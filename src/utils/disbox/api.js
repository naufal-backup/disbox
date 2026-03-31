import { ipc } from '@/utils/ipc';

const CHUNK_SIZE = 7.5 * 1024 * 1024;

function _bufferToBase64(buffer) {
  return new Promise((resolve) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
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
      console.log('[init] Drive Baru: Menginisialisasi metadata kosong di Database...');
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
    throw new Error('Gagal dekripsi. Webhook tidak cocok.');
  }

  async syncMetadata(options = {}) {
    const { forceId, metadataUrl } = options;
    return this._enqueue(async () => {
      if (this._syncing) return false;
      this._syncing = true;
      try {
        const username = localStorage.getItem('dbx_username');
        const identifier = username || this.hashedWebhook;
        const BASE_API = 'https://disbox-web-weld.vercel.app';

        console.log(`[sync] Menarik struktur dari Supabase (${identifier})...`);
        const res = await ipc.fetch(`${BASE_API}/api/files/list?identifier=${identifier}`);
        const result = JSON.parse(res.body);

        if (res.ok && result.files && result.files.length > 0) {
          console.log(`[sync] ✓ Berhasil memuat ${result.files.length} baris dari database.`);
          await ipc.saveMetadata(this.hashedWebhook, result.files);
          return true;
        }

        console.log('[sync] Database kosong, mencari sumber migrasi...');
        let legacyData = null;
        try {
          if (metadataUrl && metadataUrl.startsWith('http')) {
            legacyData = await this._downloadMetadataFromUrl(metadataUrl);
          } else {
            const discovery = await this._getMsgIdFromDiscovery();
            const msgId = forceId || discovery?.best;
            if (msgId) legacyData = await this._downloadMetadataFromMsg(msgId);
          }
        } catch (err) { console.warn('[sync] Gagal mengambil data migrasi:', err.message); }

        if (legacyData) {
          const files = Array.isArray(legacyData) ? legacyData : (legacyData.files || []);
          console.log(`[sync] ✓ Menemukan ${files.length} item lama. Mengonversi ke baris database...`);
          for (const f of files) {
            await ipc.fetch(`${BASE_API}/api/files/upsert`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identifier, file: f })
            });
          }
          await ipc.saveMetadata(this.hashedWebhook, files);
          return true;
        }
        return false;
      } finally { this._syncing = false; }
    });
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
    if (data === null || data === undefined) {
      await this.syncMetadata();
      return await ipc.loadMetadata(this.hashedWebhook) || [];
    }
    return data;
  }

  async uploadMetadataToDiscord(files) {
    if (!this.webhookUrl) return;
    try {
      const username = localStorage.getItem('dbx_username');
      const identifier = username || this.hashedWebhook;
      const container = { files, updatedAt: Date.now() };
      const bytes = new TextEncoder().encode(JSON.stringify(container));
      const enc = await this.encrypt(bytes.buffer);
      const b64 = await _bufferToBase64(enc);

      ipc.fetch('https://disbox-web-weld.vercel.app/api/cloud/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, username, webhook_url: this.webhookUrl, metadata_b64: b64 })
      }).catch(() => {});

      await ipc.saveMetadata(this.hashedWebhook, files);
    } catch (e) { console.error('[backup] sync failed:', e); }
  }

  async createFile(path, messageIds, size, id, thumbnailMsgId = null) {
    return this._enqueue(async () => {
      const username = localStorage.getItem('dbx_username');
      const identifier = username || this.hashedWebhook;
      const file = { path, messageIds, size, createdAt: Date.now(), id: id || crypto.randomUUID(), thumbnailMsgId };

      const res = await ipc.fetch('https://disbox-web-weld.vercel.app/api/files/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, file })
      });

      if (!res.ok) throw new Error('Gagal simpan ke database.');

      const files = await this.getFileSystem();
      const idx = files.findIndex(f => f.path === path);
      if (idx >= 0) files[idx] = file; else files.push(file);
      await ipc.saveMetadata(this.hashedWebhook, files);
      return file;
    });
  }

  async createFolder(path) {
    return await this.createFile(path, [], 0, crypto.randomUUID());
  }

  async deletePath(targetPath) {
    return this._enqueue(async () => {
      const username = localStorage.getItem('dbx_username');
      const identifier = username || this.hashedWebhook;

      const res = await ipc.fetch('https://disbox-web-weld.vercel.app/api/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, path: targetPath })
      });

      if (!res.ok) throw new Error('Gagal hapus dari database.');

      const files = await this.getFileSystem();
      const filtered = files.filter(f => f.path !== targetPath && !f.path.startsWith(targetPath + '/'));
      await ipc.saveMetadata(this.hashedWebhook, filtered);
    });
  }

  async renamePath(oldPath, newPath) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const toUpdate = files.filter(f => f.path === oldPath || f.path.startsWith(oldPath + '/'));
      for (const f of toUpdate) {
        const newFilePath = f.path.replace(oldPath, newPath);
        await this.deletePath(f.path);
        await this.createFile(newFilePath, f.messageIds, f.size, f.id, f.thumbnailMsgId);
      }
    });
  }
}
