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
    this.rawWebhookUrl = webhookUrl.split('?')[0].trim();
    this.webhookUrl = this.rawWebhookUrl.replace('discordapp.com', 'discord.com').replace(/\/+$/, '');
    this.hashedWebhook = null;
    this.encryptionKeys = [];
    this.MAGIC_HEADER = new TextEncoder().encode('DBX_ENC:');
    this.lastSyncedId = null;
    const savedChunkSize = Number(localStorage.getItem('disbox_chunk_size'));
    this.chunkSize = (savedChunkSize && savedChunkSize < 8 * 1024 * 1024) ? savedChunkSize : 7.5 * 1024 * 1024;
    this._taskQueue = Promise.resolve();
    this._syncing = false;
  }

  async _enqueue(task) {
    const nextTask = this._taskQueue.then(async () => {
      try { return await task(); }
      catch (e) { console.error('[queue] Task error:', e); throw e; }
    });
    this._taskQueue = nextTask.catch(() => {});
    return nextTask;
  }

  async hashWebhook(url) {
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(url));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async deriveKey(url) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
    return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  async init(options = {}) {
    const { forceId, metadataUrl } = (typeof options === 'string') ? { forceId: options } : options;
    this.hashedWebhook = await this.hashWebhook(this.webhookUrl);
    
    const variants = [this.webhookUrl, this.webhookUrl + '/', this.rawWebhookUrl];
    this.encryptionKeys = [];
    for (const v of variants) {
      try { this.encryptionKeys.push(await this.deriveKey(v)); } catch {}
    }

    const found = await this.syncMetadata({ forceId, metadataUrl });
    if (!found) {
      console.log('[init] New drive. Initializing empty structure.');
      await ipc.saveMetadata(this.hashedWebhook, []);
    }
    return this.hashedWebhook;
  }

  async encrypt(data) {
    if (!this.encryptionKeys.length) return data;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.encryptionKeys[0], data);
    const res = new Uint8Array(this.MAGIC_HEADER.length + iv.length + enc.byteLength);
    res.set(this.MAGIC_HEADER, 0); res.set(iv, this.MAGIC_HEADER.length);
    res.set(new Uint8Array(enc), this.MAGIC_HEADER.length + iv.length);
    return res.buffer;
  }

  async decrypt(data) {
    const u8 = new Uint8Array(data);
    if (u8.length < this.MAGIC_HEADER.length) return data;
    const iv = u8.slice(this.MAGIC_HEADER.length, this.MAGIC_HEADER.length + 12);
    const ct = u8.slice(this.MAGIC_HEADER.length + 12);
    for (const key of this.encryptionKeys) {
      try { return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct); } catch {}
    }
    throw new Error('Gagal dekripsi metadata.');
  }

  async syncMetadata(options = {}) {
    const { forceId, metadataUrl, force } = options;
    if (this._syncing) return false;
    this._syncing = true;
    try {
      const username = localStorage.getItem('dbx_username');
      const identifier = username || this.hashedWebhook;
      const BASE_API = 'https://disbox-web-weld.vercel.app';

      // 1. Check for changes before pulling full structure
      if (!force && !forceId && !metadataUrl) {
        try {
          const checkRes = await ipc.fetch(`${BASE_API}/api/files/check?identifier=${identifier}`);
          const check = JSON.parse(checkRes.body);
          
          if (checkRes.ok && check.updated_at) {
            const lastSync = localStorage.getItem(`dbx_sync_${this.hashedWebhook}`);
            if (lastSync === `${check.updated_at}_${check.count}`) {
              // No changes, skip
              return true;
            }
            this._pendingSyncInfo = `${check.updated_at}_${check.count}`;
          }
        } catch (e) {
          console.warn('[sync] Check failed, falling back to full pull:', e.message);
        }
      }

      console.log(`[sync] Pulling structure for ${identifier}...`);
      const res = await ipc.fetch(`${BASE_API}/api/files/list?identifier=${identifier}`);
      const result = JSON.parse(res.body);

      if (res.ok && result.files) {
        if (result.files.length > 0) {
          console.log(`[sync] ✓ Loaded ${result.files.length} items from database.`);
          await ipc.saveMetadata(this.hashedWebhook, result.files);
          
          if (this._pendingSyncInfo) {
            localStorage.setItem(`dbx_sync_${this.hashedWebhook}`, this._pendingSyncInfo);
            this._pendingSyncInfo = null;
          }
          return true;
        } else if (result.files.length === 0 && !forceId && !metadataUrl) {
           // Empty but successful
           await ipc.saveMetadata(this.hashedWebhook, []);
           if (this._pendingSyncInfo) {
             localStorage.setItem(`dbx_sync_${this.hashedWebhook}`, this._pendingSyncInfo);
             this._pendingSyncInfo = null;
           }
           return true;
        }
      }

      let legacyData = null;
      if (metadataUrl && metadataUrl.startsWith('http')) {
        legacyData = await this._downloadMetadataFromUrl(metadataUrl);
      } else {
        const discovery = await this._getMsgIdFromDiscovery();
        const msgId = forceId || discovery?.best;
        if (msgId) legacyData = await this._downloadMetadataFromMsg(msgId);
      }

      if (legacyData) {
        const files = Array.isArray(legacyData) ? legacyData : (legacyData.files || []);
        console.log(`[sync] ✓ Migrating ${files.length} items to Supabase Files table...`);
        const syncRes = await ipc.fetch(`${BASE_API}/api/files/sync-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, files })
        });
        const syncData = JSON.parse(syncRes.body);
        if (syncRes.ok && syncData.updated_at) {
          localStorage.setItem(`dbx_sync_${this.hashedWebhook}`, `${syncData.updated_at}_${syncData.count}`);
        }
        await ipc.saveMetadata(this.hashedWebhook, files);
        return true;
      }
      return false;
    } finally { this._syncing = false; }
  }

  async _downloadMetadataFromUrl(url) {
    const freshUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const bytes = await ipc.proxyDownload(freshUrl);
    const dec = await this.decrypt(bytes);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  async _downloadMetadataFromMsg(msgId) {
    const msgRes = await ipc.fetch(`${this.webhookUrl}/messages/${msgId}`);
    const msg = JSON.parse(msgRes.body);
    const url = msg.attachments?.[0]?.url;
    if (!url) return null;
    const bytes = await ipc.proxyDownload(url);
    const dec = await this.decrypt(bytes);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  async _getMsgIdFromDiscovery() {
    let channelId = null;
    try {
      const res = await ipc.fetch(this.webhookUrl);
      if (res.ok) channelId = JSON.parse(res.body).channel_id;
    } catch {}
    if (!channelId) return null;
    try {
      const dRes = await ipc.fetch(`https://disbox-web-weld.vercel.app/api/discord/discover?channel_id=${channelId}`);
      const dData = JSON.parse(dRes.body);
      return dData.ok && dData.found ? { best: dData.message_id } : null;
    } catch { return null; }
  }

  async getFileSystem() {
    const data = await ipc.loadMetadata(this.hashedWebhook);
    if (!data || data.length === 0) {
      await this.syncMetadata();
      return await ipc.loadMetadata(this.hashedWebhook) || [];
    }
    return data;
  }

  async persistCloud(files) {
    const username = localStorage.getItem('dbx_username');
    const identifier = username || this.hashedWebhook;
    const BASE_API = 'https://disbox-web-weld.vercel.app';
    try {
      const res = await ipc.fetch(`${BASE_API}/api/files/sync-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, files })
      });
      const data = JSON.parse(res.body);
      if (res.ok && data.updated_at) {
        localStorage.setItem(`dbx_sync_${this.hashedWebhook}`, `${data.updated_at}_${data.count}`);
      }
      return res;
    } catch (e) {
      console.error('[persistCloud] error:', e);
      throw e;
    }
  }

  async uploadMetadataToDiscord(files) {
    if (!this.webhookUrl) return;
    try {
      console.log('[disbox] Uploading metadata to Discord...');
      let pinHash = null;
      try { pinHash = await ipc.getPinHash?.(this.hashedWebhook); } catch {}
      let shareLinks = [];
      try { shareLinks = await ipc.shareGetLinks?.(this.hashedWebhook) || []; } catch {}

      const container = { files, pinHash, shareLinks, updatedAt: Date.now() };
      const jsonStr = JSON.stringify(container);
      const jsonBytes = new TextEncoder().encode(jsonStr);
      const encryptedBytes = await this.encrypt(jsonBytes.buffer);
      const b64 = await _bufferToBase64(encryptedBytes);
      
      const res = await ipc.uploadChunk(this.webhookUrl, b64, 'disbox_metadata.json');
      if (res.ok) {
        const data = JSON.parse(res.body);
        this.lastSyncedId = data.id;
        await ipc.saveMetadata(this.hashedWebhook, files, data.id);
        console.log('[disbox] Metadata synced to Discord. ID:', data.id);
        
        const username = localStorage.getItem('dbx_username');
        if (username) {
          ipc.fetch('https://disbox-web-weld.vercel.app/api/cloud/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, last_msg_id: data.id })
          }).catch(() => {});
        }

        await ipc.fetch(this.webhookUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `dbx: ${data.id}` })
        }).catch(() => {});
      }
    } catch (e) { console.error('[disbox] Failed to upload metadata:', e); }
  }

  async createFile(path, messageIds, size, id, thumbnailMsgId = null) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const entry = { path, messageIds, size, createdAt: Date.now(), id: id || crypto.randomUUID(), thumbnailMsgId };
      const idx = files.findIndex(f => f.path === path);
      if (idx >= 0) files[idx] = entry; else files.push(entry);
      
      await ipc.saveMetadata(this.hashedWebhook, files);
      await this.persistCloud(files);
      await this.uploadMetadataToDiscord(files);
      return entry;
    });
  }

  async createFolder(folderName, currentPath = '/') {
    const dirPath = currentPath === '/' ? '' : currentPath.replace(/^\/+/, '');
    const fullPath = dirPath ? `${dirPath}/${folderName}/.keep` : `${folderName}/.keep`;
    return await this.createFile(fullPath, [], 0);
  }

  async deletePath(targetPath, id = null) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const filtered = files.filter(f => {
        if (id && f.id === id) return false;
        if (f.path === targetPath || f.path.startsWith(targetPath + '/')) return false;
        return true;
      });
      await ipc.saveMetadata(this.hashedWebhook, filtered);
      await this.persistCloud(filtered);
      await this.uploadMetadataToDiscord(filtered);
    });
  }

  async bulkDelete(pathsOrIds) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const filtered = files.filter(f => !pathsOrIds.some(p => f.id === p || f.path === p || f.path.startsWith(p + '/')));
      await ipc.saveMetadata(this.hashedWebhook, filtered);
      await this.persistCloud(filtered);
      await this.uploadMetadataToDiscord(filtered);
    });
  }

  async renamePath(oldPath, newPath, id = null) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const updated = files.map(f => {
        if ((id && f.id === id) || (!id && f.path === oldPath)) return { ...f, path: newPath };
        if (f.path.startsWith(oldPath + '/')) return { ...f, path: f.path.replace(oldPath + '/', newPath + '/') };
        return f;
      });
      await ipc.saveMetadata(this.hashedWebhook, updated);
      await this.persistCloud(updated);
      await this.uploadMetadataToDiscord(updated);
    });
  }

  async bulkMove(pathsOrIds, destDir) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const updated = files.map(f => {
        for (const target of pathsOrIds) {
          if (f.id === target || f.path === target) {
            const name = f.path.split('/').pop();
            return { ...f, path: destDir ? `${destDir}/${name}` : name };
          }
          if (f.path.startsWith(target + '/')) {
            const name = target.split('/').pop();
            const newBase = destDir ? `${destDir}/${name}` : name;
            return { ...f, path: f.path.replace(target + '/', newBase + '/') };
          }
        }
        return f;
      });
      await ipc.saveMetadata(this.hashedWebhook, updated);
      await this.persistCloud(updated);
      await this.uploadMetadataToDiscord(updated);
    });
  }

  async copyPath(oldPath, newPath, id = null) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const toAdd = [];
      files.forEach(f => {
        if ((id && f.id === id) || (!id && f.path === oldPath)) {
          toAdd.push({ ...f, path: newPath, id: crypto.randomUUID(), createdAt: Date.now() });
        } else if (f.path.startsWith(oldPath + '/')) {
          toAdd.push({ ...f, path: f.path.replace(oldPath + '/', newPath + '/'), id: crypto.randomUUID(), createdAt: Date.now() });
        }
      });
      const next = [...files, ...toAdd];
      await ipc.saveMetadata(this.hashedWebhook, next);
      await this.persistCloud(next);
      await this.uploadMetadataToDiscord(next);
    });
  }

  async bulkCopy(pathsOrIds, destDir) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const toAdd = [];
      pathsOrIds.forEach(target => {
        const source = files.find(f => f.id === target || f.path === target);
        if (!source) return;
        const name = source.path.split('/').pop();
        const newBase = destDir ? `${destDir}/${name}` : name;
        files.forEach(f => {
          if (f.id === source.id || f.path === source.path) {
            toAdd.push({ ...f, path: newBase, id: crypto.randomUUID(), createdAt: Date.now() });
          } else if (f.path.startsWith(source.path + '/')) {
            toAdd.push({ ...f, path: f.path.replace(source.path + '/', newBase + '/'), id: crypto.randomUUID(), createdAt: Date.now() });
          }
        });
      });
      const next = [...files, ...toAdd];
      await ipc.saveMetadata(this.hashedWebhook, next);
      await this.persistCloud(next);
      await this.uploadMetadataToDiscord(next);
    });
  }

  async uploadFile(file, virtualPath, onProgress, signal, transferId) {
    const fileName = file.name;
    const fileId = crypto.randomUUID();
    let messageIds = [];
    let uploadedSize = 0;

    if (file.nativePath) {
      if (signal) signal.addEventListener('abort', () => ipc.cancelUpload(transferId));
      const res = await ipc.uploadFileFromPath(this.webhookUrl, file.nativePath, `${fileId}_${fileName}`, (p) => { if (!signal?.aborted) onProgress?.(p); }, transferId, this.chunkSize);
      if (!res.ok) throw new Error('Gagal upload file');
      return await this.createFile(virtualPath, res.messageIds, res.size, fileId);
    }

    const buffer = file.buffer || await file.arrayBuffer();
    for (let offset = 0; offset < buffer.byteLength; offset += this.chunkSize) {
      throwIfAborted(signal);
      const chunk = buffer.slice(offset, offset + this.chunkSize);
      const encrypted = await this.encrypt(chunk);
      const b64 = await _bufferToBase64(encrypted);
      const res = await ipc.uploadChunk(this.webhookUrl, b64, `${fileId}.part${messageIds.length}`);
      if (!res.ok) throw new Error('Gagal upload chunk');
      const data = JSON.parse(res.body);
      messageIds.push(data.id);
      uploadedSize += chunk.byteLength;
      if (onProgress) onProgress(uploadedSize / buffer.byteLength);
    }
    return await this.createFile(virtualPath, messageIds, buffer.byteLength, fileId);
  }

  async downloadFile(file, onProgress, signal) {
    const messageIds = file.messageIds || [];
    const chunks = [];
    for (let i = 0; i < messageIds.length; i++) {
      throwIfAborted(signal);
      const msgId = typeof messageIds[i] === 'string' ? messageIds[i] : messageIds[i].msgId;
      const res = await ipc.fetch(`${this.webhookUrl}/messages/${msgId}`, { signal });
      if (!res.ok) throw new Error(`Gagal memuat chunk ${i}`);
      const msg = JSON.parse(res.body);
      const url = msg.attachments?.[0]?.url;
      const bytes = await ipc.proxyDownload(url, signal);
      const decrypted = await this.decrypt(bytes);
      chunks.push(decrypted);
      if (onProgress) onProgress((i + 1) / messageIds.length);
    }
    const totalSize = chunks.reduce((s, c) => s + c.byteLength, 0);
    const result = new Uint8Array(totalSize);
    let off = 0;
    for (const c of chunks) { result.set(new Uint8Array(c), off); off += c.byteLength; }
    return result.buffer;
  }

  async downloadFirstChunk(file, signal, transferId) {
    const messageIds = file.messageIds || [];
    if (!messageIds.length) return new ArrayBuffer(0);
    const msgId = typeof messageIds[0] === 'string' ? messageIds[0] : messageIds[0].msgId;
    const res = await ipc.fetch(`${this.webhookUrl}/messages/${msgId}`, { signal });
    if (!res.ok) return new ArrayBuffer(0);
    const msg = JSON.parse(res.body);
    const bytes = await ipc.proxyDownload(msg.attachments?.[0]?.url, signal || transferId);
    return await this.decrypt(bytes);
  }
}
