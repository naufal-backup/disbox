import { ipc } from '@/utils/ipc';

const CHUNK_SIZE = 7.5 * 1024 * 1024;

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    throw new DOMException('Transfer dibatalkan oleh pengguna', 'AbortError');
  }
}

async function _bufferToBase64(buffer) {
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

// Import thumbnail helpers
import { captureVideoThumbnail, captureVideoThumbnailFfmpeg } from './thumbnails';

export class DisboxAPI {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl.split('?')[0];
    this.hashedWebhook = null;
    this.encryptionKey = null;
    this.MAGIC_HEADER = new TextEncoder().encode('DBX_ENC:');
    this.lastSyncedId = null;
    const savedChunkSize = Number(localStorage.getItem('disbox_chunk_size'));
    this.chunkSize = (savedChunkSize && savedChunkSize < 8 * 1024 * 1024) ? savedChunkSize : 7.5 * 1024 * 1024;
    this._taskQueue = Promise.resolve();
    this._syncing = false;
  }

  async _enqueue(task) {
    const nextTask = this._taskQueue.then(async () => {
      try {
        return await task();
      } catch (e) {
        console.error('[queue] Task error:', e);
        throw e;
      }
    });
    this._taskQueue = nextTask.catch(() => {});
    return nextTask;
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
    await this.syncMetadata(forceSyncId);
    return this.hashedWebhook;
  }

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

  async _getMsgIdFromDiscovery() {
    try {
      const localRes = await ipc.getLatestMetadataMsgId?.(this.hashedWebhook);
      const isDirty = localRes?.isDirty || false;
      const localMsgId = typeof localRes === 'object' ? localRes?.lastMsgId : localRes;
      const snapshotHistory = localRes?.snapshotHistory || [];

      let webhookMsgId = null;
      try {
        const res = await ipc.fetch(this.webhookUrl);
        if (res.ok) {
          const info = JSON.parse(res.body);
          const match = info.name?.match(/(?:dbx|disbox|db)[:\s]+(\d+)/i);
          webhookMsgId = match?.[1] || null;
        }
      } catch (_) {}

      const candidates = [localMsgId, webhookMsgId].filter(v => v && /^\d+$/.test(v));
      if (candidates.length === 0) return { best: null, snapshotHistory: [], isDirty };
      const best = candidates.reduce((a, b) => BigInt(a) >= BigInt(b) ? a : b);
      return { best, snapshotHistory, isDirty };
    } catch (e) {
      console.error('[sync] Discovery error:', e);
      return { best: null, snapshotHistory: [], isDirty: false };
    }
  }

  async _downloadMetadataFromMsg(msgId) {
    const msgUrl = `${this.webhookUrl}/messages/${msgId}`;
    const msgRes = await ipc.fetch(msgUrl);
    if (!msgRes.ok) throw new Error(`Message ${msgId} tidak bisa diakses: ${msgRes.status}`);
    const msg = JSON.parse(msgRes.body);
    const attachment = msg.attachments?.find(a => a.filename.includes('metadata.json'));
    const attachmentUrl = attachment?.url || msg.attachments?.[0]?.url;
    if (!attachmentUrl) throw new Error('Tidak ada attachment di message ' + msgId);
    const bytes = await ipc.proxyDownload(attachmentUrl);
    const decryptedBytes = await this.decrypt(bytes);
    const jsonStr = new TextDecoder().decode(decryptedBytes);
    const data = JSON.parse(jsonStr);
    return data;
  }

  async syncMetadata(forceId = null) {
    return this._enqueue(async () => {
      if (this._syncing) return false;
      this._syncing = true;
      try {
        const discovery = forceId ? { best: forceId, snapshotHistory: [] } : await this._getMsgIdFromDiscovery();
        const { best: msgId, snapshotHistory, isDirty } = discovery;
        if (!msgId) return false;
        if (isDirty && msgId === this.lastSyncedId && !forceId) return true;
        if (!forceId && msgId === this.lastSyncedId) {
          const local = await ipc.loadMetadata(this.hashedWebhook);
          if (Array.isArray(local) && local.length > 0) return true;
        }
        let data;
        let resolvedMsgId = msgId;
        try {
          data = await this._downloadMetadataFromMsg(msgId);
        } catch (e) {
          const fallbackCandidates = [...snapshotHistory].reverse().filter(id => id !== msgId);
          if (this.lastSyncedId && !fallbackCandidates.includes(this.lastSyncedId)) fallbackCandidates.push(this.lastSyncedId);
          let success = false;
          for (const fallbackId of fallbackCandidates) {
            try {
              data = await this._downloadMetadataFromMsg(fallbackId);
              resolvedMsgId = fallbackId;
              success = true;
              break;
            } catch (err) {}
          }
          if (!success) return false;
        }
        await ipc.saveMetadata(this.hashedWebhook, data, resolvedMsgId);
        this.lastSyncedId = resolvedMsgId;
        localStorage.setItem(`dbx_last_sync_${this.hashedWebhook}`, this.lastSyncedId);
        return true;
      } catch (e) {
        return false;
      } finally {
        this._syncing = false;
      }
    });
  }

  async validateWebhook() {
    try {
      const res = await ipc.fetch(this.webhookUrl);
      if (!res.ok) return false;
      const data = JSON.parse(res.body);
      return !!data?.id;
    } catch (e) { return false; }
  }

  async getFileSystem() {
    try {
      let data = await ipc.loadMetadata(this.hashedWebhook);
      let files = Array.isArray(data) ? data : [];
      let changed = false;
      files = files.map(f => {
        if (!f.id) { changed = true; return { ...f, id: crypto.randomUUID() }; }
        return f;
      });
      if (changed) await ipc.saveMetadata(this.hashedWebhook, files);
      return files;
    } catch (e) { return []; }
  }

  async _saveFileSystem(files) {
    if (!files || !Array.isArray(files)) return;
    await ipc.saveMetadata(this.hashedWebhook, files);
  }

  async createFile(filePath, messageIds, size = 0, id = null, thumbnailMsgId = null) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const fileId = id || crypto.randomUUID();
      const entry = {
        path: filePath, messageIds, size, createdAt: Date.now(), id: fileId,
        ...(thumbnailMsgId ? { thumbnailMsgId } : {})
      };
      const existing = files.findIndex(f => f.id === fileId);
      if (existing >= 0) files[existing] = entry;
      else files.push(entry);
      await this._saveFileSystem(files);
      return entry;
    });
  }

  async deletePath(targetPath, id = null) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const filtered = files.filter(f => {
        if (id && f.id === id) return false;
        if (!id && f.path === targetPath) return false;
        if (f.path.startsWith(targetPath + '/')) return false;
        return true;
      });
      await this._saveFileSystem(filtered);
      return { deleted: true };
    });
  }

  async bulkDelete(pathsOrIds) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const filtered = files.filter(f => !pathsOrIds.some(p => f.id === p || f.path === p || f.path.startsWith(p + '/')));
      await this._saveFileSystem(filtered);
      return { deleted: true };
    });
  }

  async renamePath(oldPath, newPath, id = null) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      let found = false;
      const updated = files.map(f => {
        if ((id && f.id === id) || (!id && f.path === oldPath)) { found = true; return { ...f, path: newPath }; }
        if (f.path.startsWith(oldPath + '/')) { found = true; return { ...f, path: f.path.replace(oldPath + '/', newPath + '/') }; }
        return f;
      });
      if (found) await this._saveFileSystem(updated);
      return { success: found };
    });
  }

  async bulkMove(pathsOrIds, destDir) {
    return this._enqueue(async () => {
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
          if (f.path.startsWith(oldPath + '/')) return { ...f, path: f.path.replace(oldPath + '/', newPath + '/') };
        }
        return f;
      });
      await this._saveFileSystem(updated);
      return { success: true };
    });
  }

  async copyPath(oldPath, newPath, id = null) {
    return this._enqueue(async () => {
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
    });
  }

  async bulkCopy(pathsOrIds, destDir) {
    return this._enqueue(async () => {
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
      return { success: toAdd.length > 0 };
    });
  }

  async _uploadVideoThumbnail(fileId, firstChunkBuffer, fileName) {
    try {
      const ext = fileName.split('.').pop().toLowerCase();
      let thumbBlob = null;
      if (ipc?.generateVideoThumbnail) {
        thumbBlob = await captureVideoThumbnailFfmpeg(firstChunkBuffer, ext);
      }
      if (!thumbBlob) {
        const mimeMap = { mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mkv: 'video/x-matroska', mov: 'video/quicktime', avi: 'video/x-msvideo' };
        const mime = mimeMap[ext] || 'video/mp4';
        const videoBlob = new Blob([firstChunkBuffer], { type: mime });
        thumbBlob = await captureVideoThumbnail(videoBlob);
      }
      if (!thumbBlob) return null;
      const thumbBuffer = await thumbBlob.arrayBuffer();
      const thumbName = `${fileId}_thumb.webp`;
      const thumbB64 = await _bufferToBase64(thumbBuffer);
      const res = await ipc.uploadChunk(this.webhookUrl, thumbB64, thumbName);
      if (!res.ok) return null;
      const data = JSON.parse(res.body);
      return data.id;
    } catch (e) { return null; }
  }

  async uploadFile(file, filePath, onProgress, signal = null, transferId = null) {
    const fileId = crypto.randomUUID();
    throwIfAborted(signal);
    const fileName = filePath.split('/').pop();
    const ext = fileName.split('.').pop().toLowerCase();
    const isVideo = ['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi'].includes(ext);

    if (file.nativePath && ipc?.uploadFileFromPath) {
      const tid = transferId || fileId;
      const abortListener = () => ipc.cancelUpload(tid);
      signal?.addEventListener('abort', abortListener);
      try {
        const res = await ipc.uploadFileFromPath(this.webhookUrl, file.nativePath, `${fileId}_${fileName}`, (p) => { if (!signal?.aborted) onProgress?.(p); }, tid, this.chunkSize);
        throwIfAborted(signal);
        if (!res.ok) throw new Error(res.error || 'Upload gagal');
        let thumbnailMsgId = null;
        if (isVideo && res.messageIds?.length > 1) {
          try {
            const firstMsgId = res.messageIds[0];
            const msgRes = await ipc.fetch(`${this.webhookUrl}/messages/${firstMsgId}`);
            if (msgRes.ok) {
              const msg = JSON.parse(msgRes.body);
              const attachmentUrl = msg.attachments?.[0]?.url;
              if (attachmentUrl) {
                const chunkData = await ipc.proxyDownload(attachmentUrl);
                const decrypted = await this.decrypt(chunkData);
                thumbnailMsgId = await this._uploadVideoThumbnail(fileId, decrypted, fileName);
              }
            }
          } catch (e) {}
        }
        return await this.createFile(filePath, res.messageIds, res.size, fileId, thumbnailMsgId);
      } finally { signal?.removeEventListener('abort', abortListener); }
    }

    const totalSize = file.buffer.byteLength;
    const numChunks = Math.ceil(totalSize / this.chunkSize) || 1;
    const messageIds = [];
    let firstDecryptedChunk = null;
    for (let i = 0; i < numChunks; i++) {
      throwIfAborted(signal);
      const start = i * this.chunkSize;
      const chunk = file.buffer.slice(start, Math.min(start + this.chunkSize, totalSize));
      if (i === 0 && isVideo && numChunks > 1) firstDecryptedChunk = chunk;
      const encryptedChunk = await this.encrypt(chunk);
      const chunkB64 = await _bufferToBase64(encryptedChunk);
      const chunkName = `${fileId}_${fileName}.part${i}`;
      const res = await ipc.uploadChunk(this.webhookUrl, chunkB64, chunkName);
      if (!res.ok) throw new Error(`Upload chunk ${i} gagal`);
      const data = JSON.parse(res.body);
      messageIds.push(data.id);
      onProgress?.((i + 1) / numChunks);
    }
    let thumbnailMsgId = null;
    if (isVideo && numChunks > 1 && firstDecryptedChunk) thumbnailMsgId = await this._uploadVideoThumbnail(fileId, firstDecryptedChunk, fileName);
    return await this.createFile(filePath, messageIds, totalSize, fileId, thumbnailMsgId);
  }

  async downloadThumbnail(thumbnailMsgId, transferId = null) {
    const msgRes = await ipc.fetch(`${this.webhookUrl}/messages/${thumbnailMsgId}`, { transferId });
    if (!msgRes.ok) throw new Error(`Gagal fetch thumbnail: ${msgRes.status}`);
    const msg = JSON.parse(msgRes.body);
    const attachmentUrl = msg.attachments?.[0]?.url;
    if (!attachmentUrl) throw new Error('Tidak ada attachment di thumbnail');
    return await ipc.proxyDownload(attachmentUrl, transferId);
  }

  async downloadFile(file, onProgress, signal = null, transferId = null) {
    const messageIds = file.messageIds || [];
    const chunks = [];
    for (let i = 0; i < messageIds.length; i++) {
      throwIfAborted(signal);
      const item = messageIds[i];
      const msgId = typeof item === 'string' ? item : item.msgId;
      const attachmentIndex = typeof item === 'object' ? (item.index || 0) : 0;
      let chunkData = null;
      let retryCount = 0;
      while (retryCount <= 5) {
        throwIfAborted(signal);
        try {
          const msgRes = await ipc.fetch(`${this.webhookUrl}/messages/${msgId}`, { transferId });
          if (!msgRes.ok) throw new Error(`Fetch ${msgId} gagal`);
          const msg = JSON.parse(msgRes.body);
          const attachmentUrl = msg.attachments?.[attachmentIndex]?.url || msg.attachments?.[0]?.url;
          chunkData = await ipc.proxyDownload(attachmentUrl, transferId);
          break;
        } catch (e) {
          if (retryCount >= 5) throw e;
          retryCount++;
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, retryCount)));
        }
      }
      chunks.push(await this.decrypt(chunkData));
      onProgress?.((i + 1) / messageIds.length);
    }
    const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0);
    const merged = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) { merged.set(new Uint8Array(chunk), offset); offset += chunk.byteLength; }
    return merged.buffer;
  }

  async downloadFirstChunk(file, signal = null, transferId = null) {
    const messageIds = file.messageIds || [];
    if (messageIds.length === 0) return new ArrayBuffer(0);
    const item = messageIds[0];
    const msgId = typeof item === 'string' ? item : item.msgId;
    const attachmentIndex = typeof item === 'object' ? (item.index || 0) : 0;
    const msgRes = await ipc.fetch(`${this.webhookUrl}/messages/${msgId}`, { transferId });
    if (!msgRes.ok) throw new Error(`Fetch ${msgId} gagal`);
    const msg = JSON.parse(msgRes.body);
    const attachmentUrl = msg.attachments?.[attachmentIndex]?.url || msg.attachments?.[0]?.url;
    const chunkData = await ipc.proxyDownload(attachmentUrl, transferId);
    return await this.decrypt(chunkData);
  }
}
