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
    // Auto-migrate to discord.com
    this.webhookUrl = this.rawWebhookUrl.replace('discordapp.com', 'discord.com').replace(/\/+$/, '');
    this.hashedWebhook = null;
    this.encryptionKeys = []; // Array of possible keys for resilience
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

  async init(options = {}) {
    const { forceId, metadataUrl } = (typeof options === 'string') ? { forceId: options } : options;
    
    console.log('[init] Initializing DisboxAPI...', { forceId, metadataUrl });
    
    // First, validate the webhook itself (be more lenient with 503 errors)
    try {
      const res = await ipc.fetch(this.webhookUrl);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('Webhook URL tidak ditemukan (404).');
        }
        // Jika 503, mungkin Discord sedang down/busy, tapi kita tetap coba lanjut
        console.warn(`[init] Webhook validation returned HTTP ${res.status}. Attempting to continue anyway...`);
      }
    } catch (e) {
      if (e.message.includes('404')) throw e;
      console.warn('[init] Webhook validation failed:', e.message, '. Proceeding...');
    }

    this.hashedWebhook = await this.hashWebhook(this.webhookUrl);
    
    // Derive multiple potential keys for resilience
    const variants = new Set([
      this.webhookUrl,                             // Normalized (no trailing slash)
      this.webhookUrl + '/',                       // With trailing slash
      this.webhookUrl.replace('discord.com', 'discordapp.com'),
      this.webhookUrl.replace('discord.com', 'discordapp.com') + '/',
      this.rawWebhookUrl                           // Original input
    ]);

    this.encryptionKeys = [];
    for (const variant of variants) {
      try {
        const key = await this.deriveKey(variant);
        this.encryptionKeys.push(key);
      } catch (e) {
        console.warn('[init] Failed to derive key for variant:', variant);
      }
    }

    try {
      // Sangat Penting: Pastikan metadataUrl diteruskan ke syncMetadata
      await this.syncMetadata({ forceId, metadataUrl });
    } catch (e) {
      console.error('[init] Metadata sync failed during init:', e);
      throw e;
    }
    return this.hashedWebhook;
  }

  async encrypt(data) {
    if (!this.encryptionKeys.length) return data;
    const primaryKey = this.encryptionKeys[0];
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      primaryKey,
      data
    );
    const result = new Uint8Array(this.MAGIC_HEADER.length + iv.length + encrypted.byteLength);
    result.set(this.MAGIC_HEADER, 0);
    result.set(iv, this.MAGIC_HEADER.length);
    result.set(new Uint8Array(encrypted), this.MAGIC_HEADER.length + iv.length);
    return result.buffer;
  }

  async decrypt(data) {
    if (this.encryptionKeys.length === 0) {
      console.warn('[crypto] No encryption keys available, returning raw data');
      return data;
    }
    
    const uint8 = new Uint8Array(data);
    if (uint8.length < this.MAGIC_HEADER.length) {
      return data;
    }

    let hasMagic = true;
    for (let i = 0; i < this.MAGIC_HEADER.length; i++) {
      if (uint8[i] !== this.MAGIC_HEADER[i]) {
        hasMagic = false;
        break;
      }
    }

    if (!hasMagic) {
      return data;
    }

    console.log('[crypto] Magic header found, attempting decryption with', this.encryptionKeys.length, 'key variants...');
    const iv = uint8.slice(this.MAGIC_HEADER.length, this.MAGIC_HEADER.length + 12);
    const ciphertext = uint8.slice(this.MAGIC_HEADER.length + 12);

    let lastError = null;
    for (let i = 0; i < this.encryptionKeys.length; i++) {
      try {
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          this.encryptionKeys[i],
          ciphertext
        );
        console.log(`[crypto] Decryption success with key variant #${i}`);
        return decrypted;
      } catch (e) {
        lastError = e;
      }
    }

    console.error('[crypto] Decryption failed! Webhook URL might be different from the one used to encrypt this metadata.');
    throw new Error('Gagal mendekripsi metadata. Pastikan Webhook URL benar dan sesuai dengan data drive.');
  }

  async _getMsgIdFromDiscovery() {
    const localRes = await ipc.getLatestMetadataMsgId?.(this.hashedWebhook);
    const localMsgId = typeof localRes === 'object' ? localRes?.lastMsgId : localRes;
    const snapshotHistory = localRes?.snapshotHistory || [];

    let remoteMsgId = null;
    let channelId = null;

    try {
      console.log('[sync] Fetching channel info from webhook...');
      const res = await ipc.fetch(this.webhookUrl);
      if (res.ok) {
        const info = JSON.parse(res.body);
        channelId = info.channel_id;
      }
    } catch (e) {
      console.warn('[sync] Gagal fetch webhook info:', e.message);
    }

    // SELALU lakukan Discovery ke Channel untuk mencari pesan terbaru (Prioritas Utama)
    if (channelId) {
      try {
        console.log('[sync] Searching for latest metadata message in channel:', channelId);
        const accessToken = sessionStorage.getItem('dbx_oauth_token');
        const discUrl = accessToken 
          ? `https://disbox-web-weld.vercel.app/api/discord/discover?channel_id=${channelId}&access_token=${accessToken}`
          : `https://disbox-web-weld.vercel.app/api/discord/discover?channel_id=${channelId}`;

        const discRes = await ipc.fetch(discUrl);
        const discData = JSON.parse(discRes.body);
        
        if (discData.ok && discData.found) {
          console.log('[sync] Discovery found latest message:', discData.message_id);
          remoteMsgId = discData.message_id;
        } else {
          console.log('[sync] No metadata found in channel history via discovery API.');
        }
      } catch (e) {
        console.warn('[sync] Discovery API failed:', e.message);
      }
    }

    // Bandingkan Lokal vs Remote, ambil yang paling baru (ID terbesar)
    const candidates = [localMsgId, remoteMsgId].filter(Boolean);
    if (candidates.length === 0) {
      console.log('[sync] Discovery: Tidak ada metadata ditemukan (Drive Baru).');
      return null;
    }

    const best = candidates.reduce((a, b) => BigInt(a) >= BigInt(b) ? a : b);
    console.log(`[sync] Sync point: local=${localMsgId}, remote=${remoteMsgId} → using=${best}`);
    
    return { best, snapshotHistory };
  }

  async _downloadMetadataFromMsg(msgId) {
    const msgUrl = `${this.webhookUrl}/messages/${msgId}`;
    let msgRes = await ipc.fetch(msgUrl);
    if (!msgRes.ok) throw new Error(`Message ${msgId} tidak bisa diakses: ${msgRes.status}`);
    let msg = JSON.parse(msgRes.body);
    let attachment = msg.attachments?.find(a => a.filename === 'disbox_metadata.json') || msg.attachments?.[0];
    let attachmentUrl = attachment?.url;
    if (!attachmentUrl) throw new Error('Tidak ada attachment di message ' + msgId);

    // Gunakan URL fresh dari message — Discord CDN URL bisa expire, selalu pakai yg baru dari message API
    let bytes;
    try {
      bytes = await ipc.proxyDownload(attachmentUrl);
    } catch (e) {
      // Jika CDN URL expired, coba fetch message lagi untuk URL baru
      console.warn('[sync] CDN URL mungkin expired, retry fetch message:', e.message);
      const retryRes = await ipc.fetch(msgUrl + '?_refresh=1');
      if (!retryRes.ok) throw new Error(`Retry fetch message ${msgId} gagal: ${retryRes.status}`);
      const retryMsg = JSON.parse(retryRes.body);
      const retryAttachment = retryMsg.attachments?.find(a => a.filename.includes('metadata.json'));
      const freshUrl = retryAttachment?.url || retryMsg.attachments?.[0]?.url;
      if (!freshUrl) throw new Error('Attachment tidak ditemukan setelah retry ' + msgId);
      bytes = await ipc.proxyDownload(freshUrl);
    }

    const decryptedBytes = await this.decrypt(bytes);
    const jsonStr = new TextDecoder().decode(decryptedBytes);
    const data = JSON.parse(jsonStr);
    const isValid = Array.isArray(data) || (data !== null && typeof data === 'object');
    if (!isValid) throw new Error('Format metadata tidak valid');
    return data;
  }

  async _downloadMetadataFromUrl(url) {
    try {
      // Tambahkan cache-buster agar tidak mengambil dari CDN cache yang lama
      const freshUrl = url.includes('?') ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`;
      console.log('[sync] Downloading metadata directly from URL:', freshUrl);
      const bytes = await ipc.proxyDownload(freshUrl);
      const decryptedBytes = await this.decrypt(bytes);
      const jsonStr = new TextDecoder().decode(decryptedBytes);
      const data = JSON.parse(jsonStr);
      console.log('[sync] Metadata parsed successfully from URL');
      return data;
    } catch (e) {
      console.error('[sync] _downloadMetadataFromUrl failed:', e.message);
      throw e;
    }
  }

  async syncMetadata(options = {}) {
    const { forceId, metadataUrl, force } = (typeof options === 'string') ? { forceId: options } : options;

    return this._enqueue(async () => {
      if (this._syncing) return false;
      this._syncing = true;
      try {
        let data;
        let resolvedMsgId = forceId || null;
        const username = localStorage.getItem('dbx_username');

        // ─── 1. Prioritas Utama: Vercel Cloud (Jika Login) ───
        if (!forceId && !metadataUrl && username) {
          try {
            console.log('[sync] Checking Vercel Cloud for metadata...');
            const BASE_API_URL = 'https://disbox-web-weld.vercel.app';
            const cfgRes = await ipc.fetch(`${BASE_API_URL}/api/cloud/config?username=${username}`);
            if (cfgRes.ok) {
              const cfg = JSON.parse(cfgRes.body);
              if (cfg.cloud_metadata_url) {
                console.log('[sync] Found metadata on Vercel Cloud. Downloading...');
                data = await this._downloadMetadataFromUrl(cfg.cloud_metadata_url);
                resolvedMsgId = cfg.last_msg_id || null;
                console.log('[sync] ✓ Metadata loaded from Vercel.');
              }
            }
          } catch (err) {
            console.warn('[sync] Vercel Cloud check failed, falling back to Discord:', err.message);
          }
        }

        // ─── 2. Prioritas Kedua: Metadata URL (Import Manual) ───
        if (!data && metadataUrl) {
          data = await this._downloadMetadataFromUrl(metadataUrl);
          if (!resolvedMsgId && metadataUrl.includes('/attachments/')) {
            const parts = metadataUrl.split('/');
            resolvedMsgId = parts[parts.length - 2];
          }
        }

        // ─── 3. Prioritas Ketiga: Discord Discovery (Untuk Guest atau Fallback) ───
        if (!data) {
          let msgId = forceId;
          if (!msgId) {
            const discovery = await this._getMsgIdFromDiscovery();
            if (discovery) msgId = discovery.best;
          }

          if (msgId) {
            console.log('[sync] Downloading metadata from Discord, msgId:', msgId);
            try {
              data = await this._downloadMetadataFromMsg(msgId);
              resolvedMsgId = msgId;
            } catch (e) {
              console.warn('[sync] Discord download failed, final fallback search...');
              // Last attempt: active discovery
              const discovery = await this._getMsgIdFromDiscovery();
              if (discovery && discovery.best && discovery.best !== msgId) {
                data = await this._downloadMetadataFromMsg(discovery.best);
                resolvedMsgId = discovery.best;
              }
            }
          }
        }

        if (!data) {
          console.log('[sync] No metadata found anywhere (New Drive).');
          return false;
        }

        await ipc.saveMetadata(this.hashedWebhook, data, resolvedMsgId);
        this.lastSyncedId = resolvedMsgId;
        if (resolvedMsgId) {
          localStorage.setItem(`dbx_last_sync_${this.hashedWebhook}`, resolvedMsgId);
        }

        const itemCount = Array.isArray(data) ? data.length : (data.files?.length || 0);
        console.log('[sync] ✓ Berhasil sync. Items:', itemCount);
        return true;
      } catch (e) {
        console.error('[sync] Fatal error:', e.message);
        if (metadataUrl) throw e;
        return false;
      } finally {
        this._syncing = false;
      }
    });
  }

  async persistMetadata(files) {
    if (!this.webhookUrl) return;
    try {
      console.log('[disbox] Persisting metadata...');

      let pinRow = null;
      try { pinRow = await ipc.getPinHash?.(this.hashedWebhook); } catch {}
      let shareLinks = [];
      try { shareLinks = await ipc.shareGetLinks?.(this.hashedWebhook) || []; } catch {}

      const container = { files, pinHash: pinRow || null, shareLinks, updatedAt: Date.now() };
      const jsonStr = JSON.stringify(container);
      const jsonBytes = new TextEncoder().encode(jsonStr);
      const encryptedBytes = await this.encrypt(jsonBytes.buffer);
      const b64 = await _bufferToBase64(encryptedBytes);
      
      const username = localStorage.getItem('dbx_username');
      const userId = sessionStorage.getItem('dbx_user_id') || localStorage.getItem('dbx_user_id');

      if (username || userId) {
        // ─── PURE VERCEL MODE: Hanya simpan ke Vercel (Cepat & Efisien) ───
        console.log('[disbox] Saving to Pure Vercel Cloud...');
        await ipc.fetch('https://disbox-web-weld.vercel.app/api/cloud/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: userId,
            username: username,
            webhook_url: this.webhookUrl,
            metadata_b64: b64
          })
        });
        
        // Tetap simpan ke local SQLite/IndexedDB
        await ipc.saveMetadata(this.hashedWebhook, files, this.lastSyncedId);
      } else {
        // ─── GUEST MODE: Tetap gunakan Discord Webhook ───
        console.log('[disbox] Saving to Discord (Guest Mode)...');
        const res = await ipc.uploadChunk(this.webhookUrl, b64, 'disbox_metadata.json');
        if (res.ok) {
          const data = JSON.parse(res.body);
          this.lastSyncedId = data.id;
          localStorage.setItem(`dbx_last_sync_${this.hashedWebhook}`, data.id);
          await ipc.saveMetadata(this.hashedWebhook, files, data.id);
          
          // Best effort update webhook name
          await ipc.fetch(this.webhookUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `dbx: ${data.id}` })
          }).catch(() => {});
        }
      }
      console.log('[disbox] ✓ Metadata persisted successfully.');
    } catch (e) {
      console.error('[disbox] Failed to persist metadata:', e);
      throw e;
    }
  }

  async _saveFileSystem(files) {
    if (!files || !Array.isArray(files)) return;
    await ipc.saveMetadata(this.hashedWebhook, files);
    await this.persistMetadata(files);
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
        thumbBlob = await captureVideoThumbnail(firstChunkBuffer, ext);
      }
      if (!thumbBlob) return null;

      const thumbName = `thumb_${fileId}.jpg`;
      const thumbB64 = await _bufferToBase64(await thumbBlob.arrayBuffer());
      const res = await ipc.uploadChunk(this.webhookUrl, thumbB64, thumbName);
      return res.messageIds?.[0] || null;
    } catch (e) {
      console.warn('[thumb] Upload failed:', e.message);
      return null;
    }
  }

  async uploadFile(file, onProgress, signal) {
    return this._enqueue(async () => {
      const fileName = file.name;
      const fileSize = file.size;
      const fileId = crypto.randomUUID();
      const filePath = file.path; // Virtual path
      const isVideo = ['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(fileName.split('.').pop().toLowerCase());

      let thumbnailMsgId = null;

      // Handle file native path (Electron side)
      if (file.nativePath) {
        const tid = Math.random().toString(36).substring(7);
        if (signal) {
          signal.addEventListener('abort', () => ipc.cancelUpload(tid));
        }

        if (isVideo) {
          try {
            const stats = await ipc.statFile(file.nativePath);
            if (stats.size > 0) {
              const head = await ipc.readFileRange(file.nativePath, 0, 10 * 1024 * 1024);
              thumbnailMsgId = await this._uploadVideoThumbnail(fileId, head, fileName);
            }
          } catch (e) { console.warn('[thumb] Error:', e); }
        }

        const res = await ipc.uploadFileFromPath(this.webhookUrl, file.nativePath, `${fileId}_${fileName}`, (p) => { if (!signal?.aborted) onProgress?.(p); }, tid, this.chunkSize);
        
        if (isVideo && res.messageIds?.length > 1) {
          try {
            const firstMsgId = res.messageIds[0];
            const msgRes = await ipc.fetch(`${this.webhookUrl}/messages/${firstMsgId}`);
            if (msgRes.ok) {
               // Additional logic if needed
            }
          } catch (e) {}
        }

        return await this.createFile(filePath, res.messageIds, res.size, fileId, thumbnailMsgId);
      }

      // Handle browser buffer (if any)
      const buffer = await file.arrayBuffer();
      const messageIds = [];
      let totalSize = 0;

      for (let offset = 0; offset < buffer.byteLength; offset += this.chunkSize) {
        throwIfAborted(signal);
        const chunk = buffer.slice(offset, offset + this.chunkSize);
        const encrypted = await this.encrypt(chunk);
        const chunkB64 = await _bufferToBase64(encrypted);
        const chunkName = `chunk_${fileId}_${offset}`;
        const res = await ipc.uploadChunk(this.webhookUrl, chunkB64, chunkName);
        messageIds.push(res.messageIds[0]);
        totalSize += chunk.byteLength;
        onProgress?.(totalSize / buffer.byteLength);
      }

      return await this.createFile(filePath, messageIds, totalSize, fileId, thumbnailMsgId);
    });
  }

  async downloadFile(file, onProgress, signal) {
    const messageIds = file.messageIds || [];
    const chunks = [];
    for (let i = 0; i < messageIds.length; i++) {
      throwIfAborted(signal);
      const item = messageIds[i];
      const msgId = typeof item === 'string' ? item : item.msgId;
      const attachmentIndex = typeof item === 'object' ? (item.index || 0) : 0;

      const msgRes = await ipc.fetch(`${this.webhookUrl}/messages/${msgId}`);
      if (!msgRes.ok) throw new Error(`Gagal memuat pesan ${msgId}`);
      const msg = JSON.parse(msgRes.body);
      const attachmentUrl = msg.attachments?.[attachmentIndex]?.url || msg.attachments?.[0]?.url;
      if (!attachmentUrl) throw new Error('Attachment tidak ditemukan');

      const bytes = await ipc.proxyDownload(attachmentUrl);
      const decrypted = await this.decrypt(bytes);
      chunks.push(decrypted);
      onProgress?.((i + 1) / messageIds.length);
    }
    return new Blob(chunks, { type: 'application/octet-stream' });
  }

  async getThumbnail(thumbnailMsgId, transferId = null) {
    const msgRes = await ipc.fetch(`${this.webhookUrl}/messages/${thumbnailMsgId}`, { transferId });
    if (!msgRes.ok) return null;
    const msg = JSON.parse(msgRes.body);
    const attachmentUrl = msg.attachments?.[0]?.url;
    if (!attachmentUrl) return null;
    const bytes = await ipc.proxyDownload(attachmentUrl, transferId);
    return new Blob([bytes], { type: 'image/jpeg' });
  }

  async getFirstChunk(file, transferId = null) {
    const messageIds = file.messageIds || [];
    if (messageIds.length === 0) return new ArrayBuffer(0);
    const item = messageIds[0];
    const msgId = typeof item === 'string' ? item : item.msgId;
    const attachmentIndex = typeof item === 'object' ? (item.index || 0) : 0;

    const msgRes = await ipc.fetch(`${this.webhookUrl}/messages/${msgId}`, { transferId });
    if (!msgRes.ok) return new ArrayBuffer(0);
    const msg = JSON.parse(msgRes.body);
    const attachmentUrl = msg.attachments?.[attachmentIndex]?.url || msg.attachments?.[0]?.url;
    if (!attachmentUrl) return new ArrayBuffer(0);
    const bytes = await ipc.proxyDownload(attachmentUrl, transferId);
    return await this.decrypt(bytes);
  }
}
