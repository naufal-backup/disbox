// ─── Disbox API — Serverless Edition ─────────────────────────────────────────

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

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

export class DisboxAPI {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl.split('?')[0];
    this.hashedWebhook = null;
    this.lastSyncedId = null;
    this.chunkSize = Number(localStorage.getItem('disbox_chunk_size')) || 8 * 1024 * 1024;
  }

  async hashWebhook(url) {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async init(forceSyncId = null) {
    this.hashedWebhook = await this.hashWebhook(this.webhookUrl);
    console.log('[disbox] Init | hash:', this.hashedWebhook);
    await this.syncMetadata(forceSyncId);
    return this.hashedWebhook;
  }

  // ─── Metadata Sync ────────────────────────────────────────────────────────

  // ─── Metadata Sync ────────────────────────────────────────────────────────

  async _getMsgIdFromDiscovery() {
    // Sumber 1: file lokal — cari msgId terbesar dari nama file <hash>.<msgId>.json
    // atau 'pending' jika ada perubahan lokal yang belum diupload
    const localRes = await window.electron.getLatestMetadataMsgId?.(this.hashedWebhook);
    if (localRes === 'pending') return 'pending';
    const localMsgId = localRes;

    // Sumber 2: webhook name di Discord
    let webhookMsgId = null;
    try {
      const res = await window.electron.fetch(this.webhookUrl);
      if (res.ok) {
        const info = JSON.parse(res.body);
        const match = info.name?.match(/dbx[:\s]+(\d+)/);
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
    return best;
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
    const jsonStr = new TextDecoder().decode(bytes);
    const files = JSON.parse(jsonStr);
    if (!Array.isArray(files)) throw new Error('Format metadata tidak valid');
    return files;
  }

  async syncMetadata(forceId = null) {
    // Cegah multiple sync berjalan paralel
    if (this._syncing) {
      console.log('[sync] Sync sudah berjalan, skip.');
      return false;
    }
    this._syncing = true;
    try {
      // 1. Tentukan msgId yang akan digunakan
      const msgId = forceId || await this._getMsgIdFromDiscovery();
      if (!msgId) {
        console.log('[sync] Tidak ada msgId ditemukan, skip sync.');
        return false;
      }

      if (msgId === 'pending') {
        console.log('[sync] Local has pending changes, skipping sync to avoid data loss.');
        return true;
      }

      // 2. Cek apakah perlu download atau bisa pakai local
      //    Hanya skip download jika: msgId sama dengan lastSyncedId DAN local valid
      if (!forceId && msgId === this.lastSyncedId) {
        const local = await window.electron.loadMetadata(this.hashedWebhook);
        if (Array.isArray(local) && local.length > 0) {
          console.log('[sync] Local up-to-date, skip download. msgId:', msgId, 'items:', local.length);
          return true;
        }
        // Local hilang/kosong meski ID sama → tetap download
        console.log('[sync] ID sama tapi local kosong/hilang → force download dari Discord');
      }

      // 3. Download dari Discord
      console.log('[sync] Downloading metadata dari Discord, msgId:', msgId);
      let files;
      try {
        files = await this._downloadMetadataFromMsg(msgId);
      } catch (e) {
        console.error('[sync] Download gagal:', e.message);
        // Coba fallback ke lastSyncedId jika berbeda
        if (this.lastSyncedId && this.lastSyncedId !== msgId) {
          console.log('[sync] Fallback ke lastSyncedId:', this.lastSyncedId);
          try {
            files = await this._downloadMetadataFromMsg(this.lastSyncedId);
            // jika berhasil, lanjut dengan files dari fallback
          } catch (e2) {
            console.error('[sync] Fallback juga gagal:', e2.message);
            return false;
          }
        } else {
          return false;
        }
      }

      // 4. Safeguard: jangan timpa local yang LEBIH BANYAK dengan cloud yang jauh lebih sedikit
      //    KECUALI jika local kosong/hilang (berarti user hapus file → harus restore dari cloud)
      const localData = await window.electron.loadMetadata(this.hashedWebhook);
      const localIsValid = Array.isArray(localData) && localData.length > 0;
      if (localIsValid && !forceId && localData.length > files.length) {
        console.warn(`[sync] Cloud (${files.length}) lebih sedikit dari local (${localData.length}), skip untuk cegah data loss.`);
        return false;
      }

      // 5. Simpan ke lokal
      await window.electron.saveMetadata(this.hashedWebhook, files, msgId);
      this.lastSyncedId = msgId;
      localStorage.setItem(`dbx_last_sync_${this.hashedWebhook}`, msgId);
      console.log('[sync] ✓ Berhasil sync. msgId:', msgId, '| items:', files.length);
      return true;
    } catch (e) {
      console.error('[sync] Fatal error:', e.message);
      return false;
    } finally {
      this._syncing = false;
    }
  }

  async uploadMetadataToDiscord(_files) {
    // Upload ke Discord sekarang ditangani oleh main process via before-quit flush.
    // Fungsi ini sengaja dikosongkan untuk menghindari race condition antara
    // debounce upload renderer dan FLUSH di main process.
    // File lokal sudah disimpan oleh _saveFileSystem — itu sudah cukup.
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

      // Jika lokal kosong/hilang AND ini adalah pertama kali (lastSyncedId null) 
      // → paksa sync dari Discord
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

  async createFile(filePath, messageIds, size = 0, id = null) {
    const files = await this.getFileSystem();
    const fileId = id || crypto.randomUUID();
    const entry = { path: filePath, messageIds, size, createdAt: Date.now(), id: fileId };
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
        toAdd.push({ path: newPath, messageIds: [...f.messageIds], size: f.size, createdAt: Date.now(), id: crypto.randomUUID() });
      } else if (f.path.startsWith(oldPath + '/')) {
        toAdd.push({ path: f.path.replace(oldPath + '/', newPath + '/'), messageIds: [...f.messageIds], size: f.size, createdAt: Date.now(), id: crypto.randomUUID() });
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
          toAdd.push({ path: newPath, messageIds: [...f.messageIds], size: f.size, createdAt: Date.now(), id: crypto.randomUUID() });
        } else if (f.path.startsWith(sourcePath + '/')) {
          toAdd.push({ path: f.path.replace(sourcePath + '/', newPath + '/'), messageIds: [...f.messageIds], size: f.size, createdAt: Date.now(), id: crypto.randomUUID() });
        }
      });
    });
    if (toAdd.length > 0) await this._saveFileSystem([...files, ...toAdd]);
    return { success: true };
  }

  async deleteFile(filePath) { return this.deletePath(filePath); }
  async renameFile(oldPath, newPath) { return this.renamePath(oldPath, newPath); }

  // ─── Upload ───────────────────────────────────────────────────────────────

  async uploadFile(file, filePath, onProgress, signal = null, transferId = null) {
    const fileId = crypto.randomUUID();
    throwIfAborted(signal);

    if (file.nativePath && window.electron?.uploadFileFromPath) {
      const tid = transferId || fileId;
      const abortListener = () => window.electron.cancelUpload(tid);
      signal?.addEventListener('abort', abortListener);
      try {
        const res = await window.electron.uploadFileFromPath(
          this.webhookUrl,
          file.nativePath,
          `${fileId}_${filePath.split('/').pop()}`,
          (progress) => { if (!signal?.aborted) onProgress?.(progress); },
          tid,
          this.chunkSize
        );
        throwIfAborted(signal);
        if (!res.ok) {
          if (res.error === 'UPLOAD_CANCELLED') throw new DOMException('Transfer dibatalkan', 'AbortError');
          throw new Error(res.error || 'Upload gagal');
        }
        await this.createFile(filePath, res.messageIds, res.size, fileId);
        return res.messageIds;
      } catch (e) {
        if (e.message === 'UPLOAD_CANCELLED') throw new DOMException('Transfer dibatalkan', 'AbortError');
        throw e;
      } finally {
        signal?.removeEventListener('abort', abortListener);
      }
    }

    const totalSize = file.buffer.byteLength;
    const numChunks = Math.ceil(totalSize / this.chunkSize) || 1;
    const messageIds = [];
    for (let i = 0; i < numChunks; i++) {
      throwIfAborted(signal);
      const start = i * this.chunkSize;
      const chunk = file.buffer.slice(start, Math.min(start + this.chunkSize, totalSize));
      const chunkB64 = await _bufferToBase64(chunk);
      throwIfAborted(signal);
      const chunkName = `${fileId}_${filePath.split('/').pop()}.part${i}`;
      const res = await window.electron.uploadChunk(this.webhookUrl, chunkB64, chunkName);
      throwIfAborted(signal);
      if (!res.ok) throw new Error(`Upload chunk ${i} gagal (${res.status}): ${res.body?.slice(0, 200)}`);
      const data = JSON.parse(res.body);
      messageIds.push(data.id);
      onProgress?.((i + 1) / numChunks);
    }
    throwIfAborted(signal);
    await this.createFile(filePath, messageIds, totalSize, fileId);
    return messageIds;
  }

  // ─── Download ─────────────────────────────────────────────────────────────

  async downloadFile(file, onProgress, signal = null) {
    const messageIds = file.messageIds || [];
    const chunks = [];
    for (let i = 0; i < messageIds.length; i++) {
      throwIfAborted(signal);
      const msgUrl = `${this.webhookUrl}/messages/${messageIds[i]}`;
      const msgRes = await window.electron.fetch(msgUrl);
      throwIfAborted(signal);
      if (!msgRes.ok) throw new Error(`Gagal fetch message ${messageIds[i]}: ${msgRes.status}`);
      const msg = JSON.parse(msgRes.body);
      const attachmentUrl = msg.attachments?.[0]?.url;
      if (!attachmentUrl) throw new Error('Attachment URL tidak ditemukan');
      const chunkData = await window.electron.proxyDownload(attachmentUrl);
      throwIfAborted(signal);
      chunks.push(chunkData);
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
