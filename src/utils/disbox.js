// ─── Disbox API — Tidy JSONB Edition ─────────────────────────────────────────

export const BASE_API = 'https://disbox-web-weld.vercel.app';

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

export class DisboxAPI {
  constructor(webhookUrl) {
    this.rawWebhookUrl = webhookUrl.split('?')[0].trim();
    this.webhookUrl = this.rawWebhookUrl.replace('discordapp.com', 'discord.com').replace(/\/+$/, '');
    this.hashedWebhook = null;
    this.encryptionKeys = [];
    this.MAGIC_HEADER = new TextEncoder().encode('DBX_ENC:');
    this.lastSyncedId = null;
    this.pinHash = null;
    this.shareLinks = [];
    this.settings = {};
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

    const container = await this.syncMetadata({ forceId, metadataUrl });
    if (!container && window.electron?.saveMetadata) {
      console.log('[init] New drive. Initializing empty structure.');
      await window.electron.saveMetadata(this.hashedWebhook, []);
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
    if (this._syncing) return null;
    this._syncing = true;
    try {
      const username = localStorage.getItem('dbx_username');
      const identifier = username || this.hashedWebhook;

      console.log(`[sync] Pulling structure for ${identifier}...`);
      const res = await fetch(`${BASE_API}/api/files/list?identifier=${identifier}`, {
        credentials: 'include'
      });

      if (res.status === 401) throw new Error('Sesi API berakhir. Silakan login kembali.');
      if (res.status === 403) throw new Error('Akses ditolak. Identitas tidak sesuai.');
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error (${res.status})`);
      }

      const result = await res.json();

      if (result.ok && result.files && result.files.length > 0) {
        console.log(`[sync] ✓ Loaded ${result.files.length} items from database.`);
        this.pinHash = result.pinHash || null;
        this.shareLinks = result.shareLinks || [];
        this.settings = result.settings || {};
        if (window.electron?.saveMetadata) await window.electron.saveMetadata(this.hashedWebhook, result.files);
        return { files: result.files, pinHash: this.pinHash, shareLinks: this.shareLinks, settings: this.settings };
      }

      const discovery = await this._getMsgIdFromDiscovery();
      const msgId = forceId || discovery?.best;
      let fullContainer = null;
      if (msgId) fullContainer = await this._downloadMetadataFromMsg(msgId);
      
      if (fullContainer && !Array.isArray(fullContainer)) {
        const files = fullContainer.files || [];
        this.pinHash = fullContainer.pinHash || null;
        this.shareLinks = fullContainer.shareLinks || [];
        this.settings = fullContainer.settings || {};

        if (window.electron?.saveMetadata) await window.electron.saveMetadata(this.hashedWebhook, files);
        return { files, pinHash: this.pinHash, shareLinks: this.shareLinks, settings: this.settings };
      }
      
      return result.files ? { files: result.files } : null;
    } finally { this._syncing = false; }
  }

  async _downloadMetadataFromUrl(url) {
    const freshUrl = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
    const bytes = await (window.electron ? window.electron.proxyDownload(freshUrl) : fetch(freshUrl).then(r => r.arrayBuffer()));
    const dec = await this.decrypt(bytes);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  async _downloadMetadataFromMsg(msgId) {
    const webhookBase = this.webhookUrl.split('?')[0];
    const msgRes = await (window.electron ? window.electron.fetch(`${this.webhookUrl}/messages/${msgId}`) : fetch(`${webhookBase}/messages/${msgId}`));
    const msg = window.electron ? JSON.parse(msgRes.body) : await msgRes.json();
    const url = msg.attachments?.[0]?.url;
    if (!url) return null;
    
    let bytes;
    if (window.electron) {
      bytes = await window.electron.proxyDownload(url);
    } else {
      const proxiedUrl = `${BASE_API}/api/proxy?url=${encodeURIComponent(url)}`;
      bytes = await fetch(proxiedUrl, { credentials: 'include' }).then(r => r.arrayBuffer());
    }
    const dec = await this.decrypt(bytes);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  async _getMsgIdFromDiscovery() {
    let channelId = null;
    try {
      const res = await (window.electron ? window.electron.fetch(this.webhookUrl) : fetch(`${BASE_API}/api/proxy?url=${encodeURIComponent(this.webhookUrl)}`, { credentials: 'include' }));
      const data = window.electron ? JSON.parse(res.body) : await res.json();
      channelId = data.channel_id;
    } catch {}
    if (!channelId) return null;
    try {
      const dRes = await (window.electron ? window.electron.fetch(`${BASE_API}/api/discord/discover?channel_id=${channelId}`) : fetch(`${BASE_API}/api/discord/discover?channel_id=${channelId}`, { credentials: 'include' }));
      const dData = window.electron ? JSON.parse(dRes.body) : await dRes.json();
      return dData.ok && dData.found ? { best: dData.message_id } : null;
    } catch { return null; }
  }

  async getFileSystem() {
    if (window.electron) {
      const data = await window.electron.loadMetadata(this.hashedWebhook);
      if (data && data.length > 0) return data;
    }
    const container = await this.syncMetadata();
    return container?.files || [];
  }

  async persistCloud(files, extra = {}) {
    const username = localStorage.getItem('dbx_username');
    const identifier = username || this.hashedWebhook;
    
    if (extra.pinHash !== undefined) this.pinHash = extra.pinHash;
    if (extra.shareLinks !== undefined) this.shareLinks = extra.shareLinks;
    if (extra.settings !== undefined) this.settings = { ...this.settings, ...extra.settings };

    const normalizedFiles = files.map(f => ({
      ...f,
      isLocked: !!f.isLocked,
      isStarred: !!f.isStarred
    }));

    return fetch(`${BASE_API}/api/files/sync-all`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        identifier, 
        files: normalizedFiles,
        pinHash: this.pinHash,
        shareLinks: this.shareLinks,
        settings: this.settings
      })
    }).catch(console.error);
  }

  async uploadMetadataToDiscord(files, extra = {}) {
    if (!this.webhookUrl) return;
    try {
      console.log('[disbox] Uploading metadata to Discord...');
      
      if (extra.pinHash !== undefined) this.pinHash = extra.pinHash;
      if (extra.shareLinks !== undefined) this.shareLinks = extra.shareLinks;
      if (extra.settings !== undefined) this.settings = { ...this.settings, ...extra.settings };

      let pinHash = this.pinHash;
      if (pinHash === null && window.electron) {
        try { pinHash = await window.electron.getPinHash?.(this.hashedWebhook); } catch {}
      }
      let shareLinks = this.shareLinks || [];
      if (!shareLinks.length && window.electron) {
        try { shareLinks = await window.electron.shareGetLinks?.(this.hashedWebhook) || []; } catch {}
      }

      const container = { files, pinHash, shareLinks, settings: this.settings, updatedAt: Date.now() };
      const jsonStr = JSON.stringify(container);
      const jsonBytes = new TextEncoder().encode(jsonStr);
      const encryptedBytes = await this.encrypt(jsonBytes.buffer);
      
      let res;
      if (window.electron) {
        const b64 = await _bufferToBase64(encryptedBytes);
        res = await window.electron.uploadChunk(this.webhookUrl, b64, 'disbox_metadata.json');
      } else {
        const formData = new FormData();
        const blob = new Blob([encryptedBytes], { type: 'application/json' });
        formData.append('file', blob, 'disbox_metadata.json');
        res = await fetch(this.webhookUrl, { method: 'POST', body: formData });
      }

      if (res.ok) {
        const data = window.electron ? JSON.parse(res.body) : await res.json();
        this.lastSyncedId = data.id;
        if (window.electron) await window.electron.saveMetadata(this.hashedWebhook, files, data.id);
        console.log('[disbox] Metadata synced to Discord. ID:', data.id);
        
        const username = localStorage.getItem('dbx_username');
        if (username) {
          fetch(`${BASE_API}/api/cloud/sync`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, last_msg_id: data.id })
          }).catch(() => {});
        }

        const patchData = JSON.stringify({ name: `dbx: ${data.id}` });
        if (window.electron) await window.electron.fetch(this.webhookUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchData });
        else await fetch(this.webhookUrl, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: patchData });
      }
    } catch (e) { console.error('[disbox] Failed to upload metadata:', e); }
  }

  async createFile(path, messageIds, size, id, thumbnailMsgId = null) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const entry = { path, messageIds, size, createdAt: Date.now(), id: id || crypto.randomUUID(), thumbnailMsgId };
      const idx = files.findIndex(f => f.path === path);
      if (idx >= 0) files[idx] = entry; else files.push(entry);
      
      if (window.electron) await window.electron.saveMetadata(this.hashedWebhook, files);
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
      if (window.electron) await window.electron.saveMetadata(this.hashedWebhook, filtered);
      await this.persistCloud(filtered);
      await this.uploadMetadataToDiscord(filtered);
    });
  }

  async bulkDelete(pathsOrIds) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const filtered = files.filter(f => !pathsOrIds.some(p => f.id === p || f.path === p || f.path.startsWith(p + '/')));
      if (window.electron) await window.electron.saveMetadata(this.hashedWebhook, filtered);
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
      if (window.electron) await window.electron.saveMetadata(this.hashedWebhook, updated);
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
      if (window.electron) await window.electron.saveMetadata(this.hashedWebhook, updated);
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
      if (window.electron) await window.electron.saveMetadata(this.hashedWebhook, next);
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
      if (window.electron) await window.electron.saveMetadata(this.hashedWebhook, next);
      await this.persistCloud(next);
      await this.uploadMetadataToDiscord(next);
    });
  }

  async setLocked(id, isLocked) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const updated = files.map(f => {
        if (f.id === id) return { ...f, isLocked };
        if (f.path === id || f.path.startsWith(id + '/')) return { ...f, isLocked };
        return f;
      });
      if (window.electron) await window.electron.saveMetadata(this.hashedWebhook, updated);
      await this.persistCloud(updated);
      await this.uploadMetadataToDiscord(updated);
    });
  }

  async setStarred(id, isStarred) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const updated = files.map(f => {
        if (f.id === id) return { ...f, isStarred };
        if (f.path === (id ? `${id}/.keep` : '.keep')) return { ...f, isStarred };
        return f;
      });
      if (window.electron) await window.electron.saveMetadata(this.hashedWebhook, updated);
      await this.persistCloud(updated);
      await this.uploadMetadataToDiscord(updated);
    });
  }

  async uploadFile(file, virtualPath, onProgress, signal, transferId) {
    const fileName = file.name;
    const fileSize = file.size || (file.buffer ? file.buffer.byteLength : 0);
    // Deterministic fileId based on name and size for resume support
    const fileId = `res_${btoa(fileName).replace(/=/g,'')}_${fileSize}`;
    
    // Resume logic: check if we have already uploaded some chunks
    const resumeKey = `disbox_resume_${this.hashedWebhook}_${fileId}`;
    let messageIds = [];
    try {
      const saved = localStorage.getItem(resumeKey);
      if (saved) messageIds = JSON.parse(saved);
    } catch (e) {}

    let uploadedSize = messageIds.length * this.chunkSize;

    if (window.electron && file.nativePath) {
      if (signal) signal.addEventListener('abort', () => window.electron.cancelUpload(transferId));
      const res = await window.electron.uploadFileFromPath(this.webhookUrl, file.nativePath, `${fileId}_${fileName}`, (p) => { if (!signal?.aborted) onProgress?.(p); }, transferId, this.chunkSize);
      if (!res.ok) throw new Error('Gagal upload file');
      return await this.createFile(virtualPath, res.messageIds, res.size, fileId);
    }

    const buffer = file.buffer || await file.arrayBuffer();
    for (let offset = 0; offset < buffer.byteLength; offset += this.chunkSize) {
      throwIfAborted(signal);
      const chunkIdx = Math.floor(offset / this.chunkSize);
      
      // Skip if already uploaded (Resume)
      if (chunkIdx < messageIds.length) {
        if (onProgress) onProgress(uploadedSize / buffer.byteLength);
        continue;
      }

      const chunk = buffer.slice(offset, offset + this.chunkSize);
      const encrypted = await this.encrypt(chunk);
      
      let res;
      if (window.electron) {
        const b64 = await _bufferToBase64(encrypted);
        res = await window.electron.uploadChunk(this.webhookUrl, b64, `${fileId}.part${chunkIdx}`);
      } else {
        const formData = new FormData();
        formData.append('file', new Blob([encrypted]), `${fileId}.part${chunkIdx}`);
        res = await fetch(this.webhookUrl, { method: 'POST', body: formData, signal });
      }

      if (!res.ok) throw new Error('Gagal upload chunk');
      const data = window.electron ? JSON.parse(res.body) : await res.json();
      messageIds.push(data.id);
      
      // Save progress for resume
      localStorage.setItem(resumeKey, JSON.stringify(messageIds));
      
      uploadedSize += chunk.byteLength;
      if (onProgress) onProgress(uploadedSize / buffer.byteLength);
    }

    const result = await this.createFile(virtualPath, messageIds, buffer.byteLength, fileId);
    // Success: clear resume data
    localStorage.removeItem(resumeKey);
    return result;
  }

  async downloadFile(file, onProgress, signal) {
    const messageIds = file.messageIds || [];
    const chunks = [];
    const webhookBase = this.webhookUrl.split('?')[0];

    for (let i = 0; i < messageIds.length; i++) {
      throwIfAborted(signal);
      const msgId = typeof messageIds[i] === 'string' ? messageIds[i] : messageIds[i].msgId;
      
      let resData;
      if (window.electron) {
        const res = await window.electron.fetch(`${this.webhookUrl}/messages/${msgId}`, { signal });
        if (!res.ok) throw new Error(`Gagal memuat chunk ${i}`);
        resData = JSON.parse(res.body);
      } else {
        const proxiedMsgUrl = `${BASE_API}/api/proxy?url=${encodeURIComponent(`${webhookBase}/messages/${msgId}`)}`;
        const res = await fetch(proxiedMsgUrl, { signal, credentials: 'include' });
        if (!res.ok) throw new Error(`Gagal memuat chunk ${i}`);
        resData = await res.json();
      }

      const url = resData.attachments?.[0]?.url;
      let bytes;
      if (window.electron) {
        bytes = await window.electron.proxyDownload(url, signal);
      } else {
        const proxiedUrl = `${BASE_API}/api/proxy?url=${encodeURIComponent(url)}`;
        bytes = await fetch(proxiedUrl, { 
        ...(signal ? { signal } : {}),
        credentials: 'include'
      }).then(r => r.arrayBuffer());
      }

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
    const webhookBase = this.webhookUrl.split('?')[0];
    
    let resData;
    if (window.electron) {
      const res = await window.electron.fetch(`${this.webhookUrl}/messages/${msgId}`, { signal });
      if (!res.ok) return new ArrayBuffer(0);
      resData = JSON.parse(res.body);
    } else {
      const proxiedMsgUrl = `${BASE_API}/api/proxy?url=${encodeURIComponent(`${webhookBase}/messages/${msgId}`)}`;
      const res = await fetch(proxiedMsgUrl, { signal, credentials: 'include' });
      if (!res.ok) return new ArrayBuffer(0);
      resData = await res.json();
    }

    const url = resData.attachments?.[0]?.url;
    let bytes;
    if (window.electron) {
      bytes = await window.electron.proxyDownload(url, signal || transferId);
    } else {
      const proxiedUrl = `${BASE_API}/api/proxy?url=${encodeURIComponent(url)}`;
      bytes = await fetch(proxiedUrl, { 
        ...(signal ? { signal } : {}),
        credentials: 'include'
      }).then(r => r.arrayBuffer());
    }
    return await this.decrypt(bytes);
  }

  async downloadPartialChunks(file, maxChunks = 5, signal, onProgress, includeLast = true) {
    const messageIds = file.messageIds || [];
    const totalChunks = messageIds.length;
    
    const chunkIndices = new Set();
    const firstChunksCount = Math.min(maxChunks, totalChunks);
    for (let i = 0; i < firstChunksCount; i++) chunkIndices.add(i);
    
    if (includeLast && totalChunks > firstChunksCount) {
      chunkIndices.add(totalChunks - 1);
    }

    const sortedIndices = Array.from(chunkIndices).sort((a, b) => a - b);
    const chunks = new Map();

    for (let i = 0; i < sortedIndices.length; i++) {
      throwIfAborted(signal);
      const chunkIdx = sortedIndices[i];
      const msgId = typeof messageIds[chunkIdx] === 'string' ? messageIds[chunkIdx] : messageIds[chunkIdx].msgId;
      
      let resData;
      if (window.electron) {
        const res = await window.electron.fetch(`${this.webhookUrl}/messages/${msgId}`, { signal });
        if (!res.ok) throw new Error(`Gagal memuat chunk ${chunkIdx + 1}`);
        resData = JSON.parse(res.body);
      } else {
        const webhookBase = this.webhookUrl.split('?')[0];
        const proxiedMsgUrl = `${BASE_API}/api/proxy?url=${encodeURIComponent(`${webhookBase}/messages/${chunkIdx}`)}`;
        const res = await fetch(proxiedMsgUrl, { signal, credentials: 'include' });
        if (!res.ok) throw new Error(`Gagal memuat chunk ${chunkIdx + 1}`);
        resData = await res.json();
      }

      const url = resData.attachments?.[0]?.url;
      let bytes;
      if (window.electron) {
        bytes = await window.electron.proxyDownload(url, signal);
      } else {
        const proxiedUrl = `${BASE_API}/api/proxy?url=${encodeURIComponent(url)}`;
        bytes = await fetch(proxiedUrl, { 
        ...(signal ? { signal } : {}),
        credentials: 'include'
      }).then(r => r.arrayBuffer());
      }

      const decrypted = await this.decrypt(bytes);
      chunks.set(chunkIdx, decrypted);
      if (onProgress) onProgress((i + 1) / sortedIndices.length);
    }

    const usePadding = file.size < 200 * 1024 * 1024;
    
    let result;
    if (usePadding) {
      result = new Uint8Array(file.size);
      for (const [idx, buf] of chunks.entries()) {
        const offset = idx * this.chunkSize;
        if (offset + buf.byteLength <= result.length) {
          result.set(new Uint8Array(buf), offset);
        }
      }
    } else {
      const resultSize = sortedIndices.reduce((acc, idx) => acc + chunks.get(idx).byteLength, 0);
      result = new Uint8Array(resultSize);
      let offset = 0;
      for (const idx of sortedIndices) {
        const buf = chunks.get(idx);
        result.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }
    }

    return {
      buffer: result.buffer,
      downloadedChunks: sortedIndices.length,
      totalChunks: totalChunks,
      totalFileSize: file.size,
      isComplete: sortedIndices.length >= totalChunks,
      isPadded: usePadding
    };
  }
}

// Re-export helpers
export function buildTree(files) {
  const root = { name: '/', children: {}, files: [] };
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const fileName = parts.pop();
    let node = root;
    for (const part of parts) {
      if (!node.children[part]) node.children[part] = { name: part, children: {}, files: [] };
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
    mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', 
    mkv: 'video/x-matroska', mov: 'video/quicktime', avi: 'video/x-msvideo', 
    flv: 'video/x-flv', wmv: 'video/x-ms-wmv', m4v: 'video/x-m4v',
    '3gp': 'video/3gpp', ts: 'video/mp2t',
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac', m4a: 'audio/mp4', aac: 'audio/aac',
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
