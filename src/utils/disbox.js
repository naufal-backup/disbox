// ─── Disbox API — Serverless Edition ─────────────────────────────────────────

const CHUNK_SIZE = 7.5 * 1024 * 1024; // 7.5MB (Safer than 8MB)

function _bufferToBase64(buffer) {
  return new Promise((resolve) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result.split(',')[1];
      resolve(b64);
    };
    reader.readAsDataURL(blob);
  });
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const err = new DOMException('Transfer dibatalkan oleh pengguna', 'AbortError');
    throw err;
  }
}

// ─── Video Thumbnail Helper ────────────────────────────────────────────────
// Capture satu frame dari video blob (untuk video single-chunk / faststart)
// ─── Canvas-based fallback (single-chunk / faststart videos) ─────────────────
export async function captureVideoThumbnail(videoBlob) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoBlob);
    let settled = false;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.src = '';
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const drawFrame = () => {
      try {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let w = video.videoWidth || 320;
        let h = video.videoHeight || 180;
        if (w > h) { if (w > MAX_SIZE) { h = Math.floor(h * MAX_SIZE / w); w = MAX_SIZE; } }
        else { if (h > MAX_SIZE) { w = Math.floor(w * MAX_SIZE / h); h = MAX_SIZE; } }
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(settle, 'image/webp', 0.75);
      } catch (e) { settle(null); }
    };

    const timer = setTimeout(() => drawFrame(), 8000);
    video.onloadeddata = () => drawFrame();
    video.oncanplay = () => { if (!settled) drawFrame(); };
    video.onerror = () => settle(null);
    video.src = url;
  });
}

// ─── ffmpeg-based thumbnail (lewat Electron IPC) ──────────────────────────────
// Lebih reliable dari canvas karena:
// - Bisa decode video tanpa moov atom di awal (multi-chunk)
// - Support semua codec (H.264, H.265, AV1, VP9, dll)
// - Ambil frame di detik ke-1 (lebih representatif)
async function captureVideoThumbnailFfmpeg(videoBuffer, ext) {
  if (!window.electron?.generateVideoThumbnail) return null;
  try {
    const b64 = await _bufferToBase64(videoBuffer);
    const result = await window.electron.generateVideoThumbnail(b64, ext);
    if (!result.ok) {
      console.warn('[ffmpeg] Thumbnail gagal:', result.reason);
      return null;
    }
    // Convert base64 webp → Blob
    const byteStr = atob(result.data);
    const arr = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
    return new Blob([arr], { type: 'image/webp' });
  } catch (e) {
    console.warn('[ffmpeg] captureVideoThumbnailFfmpeg error:', e.message);
    return null;
  }
}

export class DisboxAPI {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl.split('?')[0];
    this.hashedWebhook = null;
    this.encryptionKey = null;
    this.MAGIC_HEADER = new TextEncoder().encode('DBX_ENC:'); // 8 bytes
    this.lastSyncedId = null;
    const savedChunkSize = Number(localStorage.getItem('disbox_chunk_size'));
    this.chunkSize = (savedChunkSize && savedChunkSize < 8 * 1024 * 1024) ? savedChunkSize : 7.5 * 1024 * 1024;
  }

  async hashWebhook(url) {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async deriveKey(url) {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return await crypto.subtle.importKey(
      'raw',
      hash,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async init(forceSyncId = null) {
    this.hashedWebhook = await this.hashWebhook(this.webhookUrl);
    this.encryptionKey = await this.deriveKey(this.webhookUrl);
    console.log('[disbox] Init | hash:', this.hashedWebhook);
    await this.syncMetadata(forceSyncId);
    return this.hashedWebhook;
  }

  // ─── Encryption Helpers ──────────────────────────────────────────────────

  async encrypt(data) {
    if (!this.encryptionKey) return data;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.encryptionKey,
      data
    );
    const result = new Uint8Array(this.MAGIC_HEADER.length + iv.length + encrypted.byteLength);
    result.set(this.MAGIC_HEADER, 0);
    result.set(iv, this.MAGIC_HEADER.length);
    result.set(new Uint8Array(encrypted), this.MAGIC_HEADER.length + iv.length);
    return result.buffer;
  }

  async decrypt(data) {
    if (!this.encryptionKey) return data;
    const uint8 = new Uint8Array(data);

    for (let i = 0; i < this.MAGIC_HEADER.length; i++) {
      if (uint8[i] !== this.MAGIC_HEADER[i]) {
        console.log('[crypto] No magic header, assuming unencrypted data');
        return data;
      }
    }

    try {
      const iv = uint8.slice(this.MAGIC_HEADER.length, this.MAGIC_HEADER.length + 12);
      const ciphertext = uint8.slice(this.MAGIC_HEADER.length + 12);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.encryptionKey,
        ciphertext
      );
      return decrypted;
    } catch (e) {
      console.error('[crypto] Decryption failed:', e);
      return data;
    }
  }

  // ─── Metadata Sync ────────────────────────────────────────────────────────

  async _getMsgIdFromDiscovery() {
    const localRes = await window.electron.getLatestMetadataMsgId?.(this.hashedWebhook);
    if (localRes === 'pending') return 'pending';

    const localMsgId = typeof localRes === 'object' ? localRes?.lastMsgId : localRes;
    const snapshotHistory = localRes?.snapshotHistory || [];

    let webhookMsgId = null;
    try {
      const res = await window.electron.fetch(this.webhookUrl);
      if (res.ok) {
        const info = JSON.parse(res.body);
        const match = info.name?.match(/(?:dbx|disbox|db)[:\s]+(\d+)/i);
        webhookMsgId = match?.[1] || null;
      }
    } catch (_) {}

    const candidates = [localMsgId, webhookMsgId].filter(Boolean);
    if (candidates.length === 0) {
      console.log('[sync] Discovery: tidak ada msgId');
      return null;
    }
    const best = candidates.reduce((a, b) => BigInt(a) >= BigInt(b) ? a : b);
    console.log(`[sync] Discovery: local=${localMsgId}, webhook=${webhookMsgId} → pakai: ${best}`);

    return { best, snapshotHistory };
  }

  async _downloadMetadataFromMsg(msgId) {
    const msgUrl = `${this.webhookUrl}/messages/${msgId}`;
    const msgRes = await window.electron.fetch(msgUrl);
    if (!msgRes.ok) throw new Error(`Message ${msgId} tidak bisa diakses: ${msgRes.status}`);

    const msg = JSON.parse(msgRes.body);
    const attachment = msg.attachments?.find(a => a.filename.includes('metadata.json'));
    const attachmentUrl = attachment?.url || msg.attachments?.[0]?.url;
    if (!attachmentUrl) throw new Error('Tidak ada attachment di message ' + msgId);

    const bytes = await window.electron.proxyDownload(attachmentUrl);
    const decryptedBytes = await this.decrypt(bytes);
    const jsonStr = new TextDecoder().decode(decryptedBytes);
    const data = JSON.parse(jsonStr);

    const isValid = Array.isArray(data) || (data !== null && typeof data === 'object');
    if (!isValid) throw new Error('Format metadata tidak valid');

    return data;
  }

  async syncMetadata(forceId = null) {
    if (this._syncing) {
      console.log('[sync] Sync sudah berjalan, skip.');
      return false;
    }
    this._syncing = true;
    try {
      const discovery = forceId ? { best: forceId, snapshotHistory: [] } : await this._getMsgIdFromDiscovery();
      if (!discovery) {
        console.log('[sync] Tidak ada msgId ditemukan, skip sync.');
        return false;
      }

      if (discovery === 'pending') {
        console.log('[sync] Local has pending changes, skipping sync to avoid data loss.');
        return true;
      }

      const { best: msgId, snapshotHistory } = discovery;

      if (!forceId && msgId === this.lastSyncedId) {
        const local = await window.electron.loadMetadata(this.hashedWebhook);
        if (Array.isArray(local) && local.length > 0) {
          console.log('[sync] Local up-to-date, skip download. msgId:', msgId, 'items:', local.length);
          return true;
        }
        console.log('[sync] ID sama tapi local kosong/hilang → force download dari Discord');
      }

      console.log('[sync] Downloading metadata dari Discord, msgId:', msgId);
      let data;
      let resolvedMsgId = msgId;
      try {
        data = await this._downloadMetadataFromMsg(msgId);
      } catch (e) {
        console.error('[sync] Download gagal untuk msgId:', msgId, e.message);

        const fallbackCandidates = [...snapshotHistory].reverse().filter(id => id !== msgId);
        if (this.lastSyncedId && !fallbackCandidates.includes(this.lastSyncedId) && this.lastSyncedId !== msgId) {
          fallbackCandidates.push(this.lastSyncedId);
        }

        let success = false;
        for (const fallbackId of fallbackCandidates) {
          console.log('[sync] Fallback: mencoba download dari msgId:', fallbackId);
          try {
            data = await this._downloadMetadataFromMsg(fallbackId);
            resolvedMsgId = fallbackId;
            console.log('[sync] Fallback BERHASIL menggunakan msgId:', fallbackId);
            success = true;
            break;
          } catch (err) {
            console.error('[sync] Fallback gagal untuk msgId:', fallbackId, err.message);
          }
        }

        if (!success) {
          console.error('[sync] Semua upaya download (termasuk fallback) gagal.');
          return false;
        }
      }

      await window.electron.saveMetadata(this.hashedWebhook, data, resolvedMsgId);
      this.lastSyncedId = resolvedMsgId;
      localStorage.setItem(`dbx_last_sync_${this.hashedWebhook}`, this.lastSyncedId);

      const itemCount = Array.isArray(data) ? data.length : (data.files?.length || 0);
      console.log('[sync] ✓ Berhasil sync. msgId:', this.lastSyncedId, '| items:', itemCount);
      return true;
    } catch (e) {
      console.error('[sync] Fatal error:', e.message);
      return false;
    } finally {
      this._syncing = false;
    }
  }

  async uploadMetadataToDiscord(_files) {
    // Upload ke Discord ditangani oleh main process.
  }

  async validateWebhook() {
    try {
      const res = await window.electron.fetch(this.webhookUrl);
      if (!res.ok) return false;
      const data = JSON.parse(res.body);
      return !!data?.id;
    } catch (e) {
      return false;
    }
  }

  // ─── Filesystem lokal ────────────────────────────────────────────────────

  async getFileSystem() {
    try {
      let data = await window.electron.loadMetadata(this.hashedWebhook);

      if ((!Array.isArray(data) || data.length === 0) && !this.lastSyncedId) {
        console.log('[disbox] Local kosong dan belum pernah sync, fetch dari Discord...');
        const ok = await this.syncMetadata();
        if (ok) {
          data = await window.electron.loadMetadata(this.hashedWebhook);
        }
      }

      let files = Array.isArray(data) ? data : [];
      let changed = false;

      files = files.map(f => {
        if (!f.id) {
          changed = true;
          return { ...f, id: crypto.randomUUID() };
        }
        return f;
      });

      if (changed) {
        await window.electron.saveMetadata(this.hashedWebhook, files);
      }

      return files;
    } catch (e) {
      console.error('[disbox] getFileSystem error:', e.message);
      return [];
    }
  }

  async _saveFileSystem(files) {
    if (!files || !Array.isArray(files)) return;
    await window.electron.saveMetadata(this.hashedWebhook, files);
    await this.uploadMetadataToDiscord(files);
  }

  async createFile(filePath, messageIds, size = 0, id = null, thumbnailMsgId = null) {
    const files = await this.getFileSystem();
    const fileId = id || crypto.randomUUID();
    const entry = {
      path: filePath,
      messageIds,
      size,
      createdAt: Date.now(),
      id: fileId,
      ...(thumbnailMsgId ? { thumbnailMsgId } : {})
    };
    const existing = files.findIndex(f => f.id === fileId);
    if (existing >= 0) files[existing] = entry;
    else files.push(entry);
    await this._saveFileSystem(files);
    return entry;
  }

  async deletePath(targetPath, id = null) {
    const files = await this.getFileSystem();
    const filtered = files.filter(f => {
      if (id && f.id === id) return false;
      if (!id && f.path === targetPath) return false;
      if (f.path.startsWith(targetPath + '/')) return false;
      return true;
    });
    await this._saveFileSystem(filtered);
    return { deleted: true };
  }

  async bulkDelete(pathsOrIds) {
    const files = await this.getFileSystem();
    const filtered = files.filter(f =>
      !pathsOrIds.some(p => f.id === p || f.path === p || f.path.startsWith(p + '/'))
    );
    await this._saveFileSystem(filtered);
    return { deleted: true };
  }

  async renamePath(oldPath, newPath, id = null) {
    const files = await this.getFileSystem();
    let found = false;
    const updated = files.map(f => {
      if ((id && f.id === id) || (!id && f.path === oldPath)) {
        found = true;
        return { ...f, path: newPath };
      }
      if (f.path.startsWith(oldPath + '/')) {
        found = true;
        return { ...f, path: f.path.replace(oldPath + '/', newPath + '/') };
      }
      return f;
    });
    if (found) await this._saveFileSystem(updated);
    return { success: found };
  }

  async bulkMove(pathsOrIds, destDir) {
    const files = await this.getFileSystem();
    const updated = files.map(f => {
      for (const target of pathsOrIds) {
        const isId = target.includes('-') && target.length > 30;
        if (isId && f.id === target) {
          const name = f.path.split('/').pop();
          return { ...f, path: destDir ? `${destDir}/${name}` : name };
        }
        const oldPath = target;
        const name = oldPath.split('/').pop();
        const newPath = destDir ? `${destDir}/${name}` : name;
        if (f.path === oldPath) return { ...f, path: newPath };
        if (f.path.startsWith(oldPath + '/')) {
          return { ...f, path: f.path.replace(oldPath + '/', newPath + '/') };
        }
      }
      return f;
    });
    await this._saveFileSystem(updated);
    return { success: true };
  }

  async copyPath(oldPath, newPath, id = null) {
    if (oldPath === newPath) return { success: false, reason: 'same_location' };
    if (newPath.startsWith(oldPath + '/')) return { success: false, reason: 'into_self' };
    const files = await this.getFileSystem();
    const toAdd = [];
    files.forEach(f => {
      if ((id && f.id === id) || (!id && f.path === oldPath)) {
        toAdd.push({ path: newPath, messageIds: [...f.messageIds], size: f.size, createdAt: Date.now(), id: crypto.randomUUID(), ...(f.thumbnailMsgId ? { thumbnailMsgId: f.thumbnailMsgId } : {}) });
      } else if (f.path.startsWith(oldPath + '/')) {
        toAdd.push({ path: f.path.replace(oldPath + '/', newPath + '/'), messageIds: [...f.messageIds], size: f.size, createdAt: Date.now(), id: crypto.randomUUID(), ...(f.thumbnailMsgId ? { thumbnailMsgId: f.thumbnailMsgId } : {}) });
      }
    });
    if (toAdd.length > 0) await this._saveFileSystem([...files, ...toAdd]);
    return { success: toAdd.length > 0 };
  }

  async bulkCopy(pathsOrIds, destDir) {
    const files = await this.getFileSystem();
    const toAdd = [];
    pathsOrIds.forEach(target => {
      const isId = target.includes('-') && target.length > 30;
      let sourcePath = target;
      if (isId) {
        const f = files.find(x => x.id === target);
        if (f) sourcePath = f.path;
      }
      const name = sourcePath.split('/').pop();
      const newPath = destDir ? `${destDir}/${name}` : name;
      if (sourcePath === newPath || newPath.startsWith(sourcePath + '/')) return;
      files.forEach(f => {
        if (f.path === sourcePath) {
          toAdd.push({ path: newPath, messageIds: [...f.messageIds], size: f.size, createdAt: Date.now(), id: crypto.randomUUID(), ...(f.thumbnailMsgId ? { thumbnailMsgId: f.thumbnailMsgId } : {}) });
        } else if (f.path.startsWith(sourcePath + '/')) {
          toAdd.push({ path: f.path.replace(sourcePath + '/', newPath + '/'), messageIds: [...f.messageIds], size: f.size, createdAt: Date.now(), id: crypto.randomUUID(), ...(f.thumbnailMsgId ? { thumbnailMsgId: f.thumbnailMsgId } : {}) });
        }
      });
    });
    if (toAdd.length > 0) await this._saveFileSystem([...files, ...toAdd]);
    return { success: true };
  }

  async deleteFile(filePath) { return this.deletePath(filePath); }
  async renameFile(oldPath, newPath) { return this.renamePath(oldPath, newPath); }

  // ─── Upload Thumbnail Video ───────────────────────────────────────────────
  // Capture frame dari chunk pertama video yang sudah di-decrypt,
  // compress ke webp, upload ke Discord, kembalikan msgId thumbnail
  async _uploadVideoThumbnail(fileId, firstChunkBuffer, fileName) {
    try {
      const ext = fileName.split('.').pop().toLowerCase();
      const videoExts = ['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi'];
      if (!videoExts.includes(ext)) return null;

      let thumbBlob = null;

      // ─── Path 1: ffmpeg via Electron IPC (lebih reliable, support semua codec) ──
      if (window.electron?.generateVideoThumbnail) {
        console.log('[thumb] Mencoba ffmpeg untuk', fileName);
        thumbBlob = await captureVideoThumbnailFfmpeg(firstChunkBuffer, ext);
        if (thumbBlob) {
          console.log(`[thumb] ffmpeg berhasil: ${(thumbBlob.size / 1024).toFixed(1)}KB`);
        }
      }

      // ─── Path 2: Canvas fallback ───────────────────────────────────────────────
      if (!thumbBlob) {
        console.log('[thumb] ffmpeg tidak tersedia/gagal, fallback canvas untuk', fileName);
        const mimeMap = {
          mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
          mkv: 'video/x-matroska', mov: 'video/quicktime', avi: 'video/x-msvideo'
        };
        const mime = mimeMap[ext] || 'video/mp4';
        const videoBlob = new Blob([firstChunkBuffer], { type: mime });
        thumbBlob = await captureVideoThumbnail(videoBlob);
      }

      if (!thumbBlob) {
        console.log('[thumb] Semua metode capture gagal untuk', fileName);
        return null;
      }

      console.log(`[thumb] Frame captured: ${(thumbBlob.size / 1024).toFixed(1)}KB untuk ${fileName}`);

      // Convert blob ke base64 untuk upload
      const thumbBuffer = await thumbBlob.arrayBuffer();
      const thumbName = `${fileId}_thumb.webp`;
      const thumbB64 = await _bufferToBase64(thumbBuffer);

      // Upload thumbnail ke Discord (tidak dienkripsi, ini hanya preview publik kecil)
      const res = await window.electron.uploadChunk(this.webhookUrl, thumbB64, thumbName);
      if (!res.ok) {
        console.warn('[thumb] Upload thumbnail gagal:', res.status);
        return null;
      }

      const data = JSON.parse(res.body);
      console.log('[thumb] Thumbnail uploaded, msgId:', data.id);
      return data.id;
    } catch (e) {
      console.warn('[thumb] _uploadVideoThumbnail error:', e.message);
      return null;
    }
  }

  // ─── Upload ───────────────────────────────────────────────────────────────

  async uploadFile(file, filePath, onProgress, signal = null, transferId = null) {
    const fileId = crypto.randomUUID();
    throwIfAborted(signal);

    const fileName = filePath.split('/').pop();
    const ext = fileName.split('.').pop().toLowerCase();
    const isVideo = ['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi'].includes(ext);

    if (file.nativePath && window.electron?.uploadFileFromPath) {
      const tid = transferId || fileId;
      const abortListener = () => window.electron.cancelUpload(tid);
      signal?.addEventListener('abort', abortListener);
      try {
        const res = await window.electron.uploadFileFromPath(
          this.webhookUrl,
          file.nativePath,
          `${fileId}_${fileName}`,
          (progress) => { if (!signal?.aborted) onProgress?.(progress); },
          tid,
          this.chunkSize
        );
        throwIfAborted(signal);
        if (!res.ok) {
          if (res.error === 'UPLOAD_CANCELLED') throw new DOMException('Transfer dibatalkan', 'AbortError');
          throw new Error(res.error || 'Upload gagal');
        }

        // Untuk video multi-chunk: capture thumbnail dari chunk pertama
        let thumbnailMsgId = null;
        if (isVideo && res.messageIds?.length > 1) {
          try {
            // Download dan decrypt chunk pertama untuk capture frame
            const firstMsgId = res.messageIds[0];
            const msgRes = await window.electron.fetch(`${this.webhookUrl}/messages/${firstMsgId}`);
            if (msgRes.ok) {
              const msg = JSON.parse(msgRes.body);
              const attachmentUrl = msg.attachments?.[0]?.url;
              if (attachmentUrl) {
                const chunkData = await window.electron.proxyDownload(attachmentUrl);
                const decrypted = await this.decrypt(chunkData);
                thumbnailMsgId = await this._uploadVideoThumbnail(fileId, decrypted, fileName);
              }
            }
          } catch (e) {
            console.warn('[thumb] Gagal capture thumbnail dari native upload:', e.message);
          }
        }

        return await this.createFile(filePath, res.messageIds, res.size, fileId, thumbnailMsgId);
      } catch (e) {
        if (e.message === 'UPLOAD_CANCELLED') throw new DOMException('Transfer dibatalkan', 'AbortError');
        throw e;
      } finally {
        signal?.removeEventListener('abort', abortListener);
      }
    }

    // Buffer upload path (web / drag-drop)
    const totalSize = file.buffer.byteLength;
    const numChunks = Math.ceil(totalSize / this.chunkSize) || 1;
    const messageIds = [];
    let firstDecryptedChunk = null;

    for (let i = 0; i < numChunks; i++) {
      throwIfAborted(signal);
      const start = i * this.chunkSize;
      const chunk = file.buffer.slice(start, Math.min(start + this.chunkSize, totalSize));

      // Simpan chunk pertama (sebelum enkripsi) untuk thumbnail video
      if (i === 0 && isVideo && numChunks > 1) {
        firstDecryptedChunk = chunk;
      }

      const encryptedChunk = await this.encrypt(chunk);
      const chunkB64 = await _bufferToBase64(encryptedChunk);
      throwIfAborted(signal);
      const chunkName = `${fileId}_${fileName}.part${i}`;
      const res = await window.electron.uploadChunk(this.webhookUrl, chunkB64, chunkName);
      throwIfAborted(signal);
      if (!res.ok) throw new Error(`Upload chunk ${i} gagal (${res.status}): ${res.body?.slice(0, 200)}`);
      const data = JSON.parse(res.body);
      messageIds.push(data.id);
      onProgress?.((i + 1) / numChunks);
    }

    throwIfAborted(signal);

    // Upload thumbnail untuk video multi-chunk
    let thumbnailMsgId = null;
    if (isVideo && numChunks > 1 && firstDecryptedChunk) {
      thumbnailMsgId = await this._uploadVideoThumbnail(fileId, firstDecryptedChunk, fileName);
    }

    return await this.createFile(filePath, messageIds, totalSize, fileId, thumbnailMsgId);
  }

  // ─── Download Thumbnail ───────────────────────────────────────────────────
  // Download thumbnail webp dari Discord berdasarkan thumbnailMsgId
  async downloadThumbnail(thumbnailMsgId, transferId = null) {
    const msgUrl = `${this.webhookUrl}/messages/${thumbnailMsgId}`;
    const msgRes = await window.electron.fetch(msgUrl, { transferId });
    if (!msgRes.ok) throw new Error(`Gagal fetch thumbnail message: ${msgRes.status}`);

    const msg = JSON.parse(msgRes.body);
    const attachmentUrl = msg.attachments?.[0]?.url;
    if (!attachmentUrl) throw new Error('Tidak ada attachment di thumbnail message');

    // Thumbnail tidak dienkripsi, langsung download
    const data = await window.electron.proxyDownload(attachmentUrl, transferId);
    return data;
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  async downloadFile(file, onProgress, signal = null, transferId = null) {
    const messageIds = file.messageIds || [];
    const chunks = [];
    for (let i = 0; i < messageIds.length; i++) {
      throwIfAborted(signal);

      const item = messageIds[i];
      const msgId = typeof item === 'string' ? item : item.msgId;
      const msgUrl = `${this.webhookUrl}/messages/${msgId}`;

      let chunkData = null;
      let retryCount = 0;
      const maxRetries = 5;

      while (retryCount <= maxRetries) {
        throwIfAborted(signal);
        try {
          const msgRes = await window.electron.fetch(msgUrl, { transferId });
          throwIfAborted(signal);

          if (!msgRes.ok) {
            if (msgRes.error === 'ABORTED') throw new DOMException('Transfer dibatalkan oleh pengguna', 'AbortError');

            if ((msgRes.status === 503 || msgRes.status === 429) && retryCount < maxRetries) {
              retryCount++;
              const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
              console.warn(`[disbox] Fetch message ${msgId} failed with ${msgRes.status}, retrying in ${Math.round(delay)}ms... (${retryCount}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            throw new Error(`Gagal fetch message ${msgId}: ${msgRes.status}`);
          }

          const msg = JSON.parse(msgRes.body);
          const attachmentUrl = msg.attachments?.[0]?.url;
          if (!attachmentUrl) throw new Error('Attachment URL tidak ditemukan');

          chunkData = await window.electron.proxyDownload(attachmentUrl, transferId);
          break;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
            console.warn(`[disbox] Download attempt ${retryCount} for chunk ${i} failed: ${e.message}, retrying...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            throw e;
          }
        }
      }

      throwIfAborted(signal);

      const decryptedChunk = await this.decrypt(chunkData);
      chunks.push(decryptedChunk);
      onProgress?.((i + 1) / messageIds.length);
    }
    const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }
    return merged.buffer;
  }

  async downloadFirstChunk(file, signal = null, transferId = null) {
    const messageIds = file.messageIds || [];
    if (messageIds.length === 0) return new ArrayBuffer(0);

    throwIfAborted(signal);
    const item = messageIds[0];
    const msgId = typeof item === 'string' ? item : item.msgId;
    const msgUrl = `${this.webhookUrl}/messages/${msgId}`;

    let chunkData = null;
    let retryCount = 0;
    const maxRetries = 5;

    while (retryCount <= maxRetries) {
      throwIfAborted(signal);
      try {
        const msgRes = await window.electron.fetch(msgUrl, { transferId });
        throwIfAborted(signal);

        if (!msgRes.ok) {
          if (msgRes.error === 'ABORTED') throw new DOMException('Transfer dibatalkan oleh pengguna', 'AbortError');
          if ((msgRes.status === 503 || msgRes.status === 429) && retryCount < maxRetries) {
            retryCount++;
            const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
            console.warn(`[disbox] Fetch message ${msgId} failed with ${msgRes.status}, retrying in ${Math.round(delay)}ms... (${retryCount}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(`Gagal fetch message ${msgId}: ${msgRes.status}`);
        }

        const msg = JSON.parse(msgRes.body);
        const attachmentUrl = msg.attachments?.[0]?.url;
        if (!attachmentUrl) throw new Error('Attachment URL tidak ditemukan');

        chunkData = await window.electron.proxyDownload(attachmentUrl, transferId);
        break;
      } catch (e) {
        if (e.name === 'AbortError') throw e;
        if (retryCount < maxRetries) {
          retryCount++;
          const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
          console.warn(`[disbox] Download attempt ${retryCount} for first chunk failed: ${e.message}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw e;
        }
      }
    }

    throwIfAborted(signal);
    return await this.decrypt(chunkData);
  }

  _splitBuffer(buffer, chunkSize) {
    const chunks = [];
    for (let offset = 0; offset < buffer.byteLength; offset += chunkSize) {
      chunks.push(buffer.slice(offset, offset + chunkSize));
    }
    return chunks.length ? chunks : [new ArrayBuffer(0)];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function buildTree(files) {
  const root = { name: '/', children: {}, files: [] };
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    const fileName = parts.pop();
    let node = root;
    for (const part of parts) {
      if (!node.children[part]) {
        node.children[part] = { name: part, children: {}, files: [] };
      }
      node = node.children[part];
    }
    node.files.push({ ...file, name: fileName });
  }
  return root;
}

export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function getFileIcon(name) {
  const ext = name?.split('.').pop()?.toLowerCase();
  const map = {
    pdf: '📄', mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
    jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼',
    zip: '📦', rar: '📦', tar: '📦', gz: '📦', '7z': '📦',
    js: '⚙️', ts: '⚙️', jsx: '⚙️', tsx: '⚙️', py: '⚙️', rs: '⚙️',
    html: '🌐', css: '🎨', json: '📋',
    doc: '📝', docx: '📝', txt: '📝', md: '📝',
    xls: '📊', xlsx: '📊', csv: '📊',
  };
  return map[ext] || '📄';
}

export function getMimeType(name) {
  const ext = name?.split('.').pop()?.toLowerCase();
  const map = {
    pdf: 'application/pdf',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    txt: 'text/plain', html: 'text/html', css: 'text/css',
    json: 'application/json', js: 'text/javascript', ts: 'text/typescript',
    py: 'text/x-python', rs: 'text/rust', md: 'text/markdown',
    yml: 'text/yaml', yaml: 'text/yaml', xml: 'text/xml',
    zip: 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}
