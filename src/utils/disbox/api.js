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
    const data = encoder.encode(url);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async deriveKey(url) {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  async init(options = {}) {
    const { forceId, metadataUrl } = (typeof options === 'string') ? { forceId: options } : options;
    this.hashedWebhook = await this.hashWebhook(this.webhookUrl);
    
    const variants = new Set([this.webhookUrl, this.webhookUrl + '/', this.rawWebhookUrl]);
    this.encryptionKeys = [];
    for (const variant of variants) {
      try { this.encryptionKeys.push(await this.deriveKey(variant)); } catch {}
    }

    try {
      const found = await this.syncMetadata({ forceId, metadataUrl });
      if (!found) {
        console.log('[init] Drive Baru: Menginisialisasi metadata di Database...');
        await this.uploadMetadataToDiscord([]);
      }
    } catch (e) {
      console.error('[init] Metadata sync failed:', e);
      throw e;
    }
    return this.hashedWebhook;
  }

  async encrypt(data) {
    if (this.encryptionKeys.length === 0) return data;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.encryptionKeys[0], data);
    const result = new Uint8Array(this.MAGIC_HEADER.length + iv.length + encrypted.byteLength);
    result.set(this.MAGIC_HEADER, 0); result.set(iv, this.MAGIC_HEADER.length);
    result.set(new Uint8Array(encrypted), this.MAGIC_HEADER.length + iv.length);
    return result.buffer;
  }

  async decrypt(data) {
    const uint8 = new Uint8Array(data);
    if (uint8.length < this.MAGIC_HEADER.length) return data;
    const iv = uint8.slice(this.MAGIC_HEADER.length, this.MAGIC_HEADER.length + 12);
    const ciphertext = uint8.slice(this.MAGIC_HEADER.length + 12);
    for (const key of this.encryptionKeys) {
      try { return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext); } catch {}
    }
    throw new Error('Gagal dekripsi. Webhook tidak cocok dengan metadata di Database.');
  }

  async syncMetadata(options = {}) {
    const { forceId, metadataUrl } = options;
    return this._enqueue(async () => {
      if (this._syncing) return false;
      this._syncing = true;
      try {
        let data;
        const username = localStorage.getItem('dbx_username');
        const identifier = username || this.hashedWebhook;

        // ─── 1. SUMBER UTAMA: DATABASE (Supabase) ───
        console.log(`[sync] Menarik data dari Database (${identifier})...`);
        const cfgRes = await ipc.fetch(`https://disbox-web-weld.vercel.app/api/cloud/config?identifier=${identifier}`);
        if (cfgRes.ok) {
          const cfg = JSON.parse(cfgRes.body);
          if (cfg.metadata_b64) {
            console.log('[sync] ✓ Metadata ditemukan di Database.');
            const binary = atob(cfg.metadata_b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            data = await this.decrypt(bytes.buffer);
            data = JSON.parse(new TextDecoder().decode(data));
          }
        }

        // ─── 2. FALLBACK: Jika Database Kosong, Cek Discord (Migrasi) ───
        if (!data) {
          console.log('[sync] Database kosong, mencari di Discord sebagai cadangan...');
          const discovery = await this._getMsgIdFromDiscovery();
          const msgId = forceId || discovery?.best;
          if (msgId) {
            data = await this._downloadMetadataFromMsg(msgId);
            console.log('[sync] ✓ Metadata ditemukan di Discord. Melakukan migrasi ke Database...');
            const jsonBytes = new TextEncoder().encode(JSON.stringify(data));
            const enc = await this.encrypt(jsonBytes.buffer);
            const b64 = await _bufferToBase64(enc);
            ipc.fetch('https://disbox-web-weld.vercel.app/api/cloud/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ identifier, metadata_b64: b64 })
            }).catch(() => {});
          }
        }

        if (!data) return false;

        await ipc.saveMetadata(this.hashedWebhook, data);
        return true;
      } finally { this._syncing = false; }
    });
  }

  async uploadMetadataToDiscord(files) {
    if (!this.webhookUrl) return;
    try {
      const username = localStorage.getItem('dbx_username');
      const identifier = username || this.hashedWebhook;

      const container = { files, updatedAt: Date.now() };
      const jsonBytes = new TextEncoder().encode(JSON.stringify(container));
      const encryptedBytes = await this.encrypt(jsonBytes.buffer);
      const b64 = await _bufferToBase64(encryptedBytes);
      
      // ─── SIMPAN KE DATABASE (Non-blocking) ───
      console.log(`[disbox] Syncing to Database (${identifier})...`);
      ipc.fetch('https://disbox-web-weld.vercel.app/api/cloud/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identifier, 
          username: username,
          webhook_url: this.webhookUrl,
          metadata_b64: b64 
        })
      }).catch(() => {});
      
      await ipc.saveMetadata(this.hashedWebhook, files);
    } catch (e) { console.error('[disbox] Save failed:', e); }
  }

  async _getMsgIdFromDiscovery() {
    let channelId = null;
    try {
      const res = await ipc.fetch(this.webhookUrl);
      if (res.ok) channelId = JSON.parse(res.body).channel_id;
    } catch {}
    if (!channelId) return null;
    try {
      const discRes = await ipc.fetch(`https://disbox-web-weld.vercel.app/api/discord/discover?channel_id=${channelId}`);
      const discData = JSON.parse(discRes.body);
      return discData.ok && discData.found ? { best: discData.message_id } : null;
    } catch { return null; }
  }

  async _downloadMetadataFromMsg(msgId) {
    const msgRes = await ipc.fetch(`${this.webhookUrl}/messages/${msgId}`);
    const msg = JSON.parse(msgRes.body);
    const url = msg.attachments?.[0]?.url;
    if (!url) throw new Error('No attachment');
    const bytes = await ipc.proxyDownload(url);
    const dec = await this.decrypt(bytes);
    return JSON.parse(new TextDecoder().decode(dec));
  }

  async getFileSystem() {
    let data = await ipc.loadMetadata(this.hashedWebhook);
    // Hanya sync jika data benar-benar null (belum pernah diinit)
    if (data === null || data === undefined) {
      console.log('[disbox] Local uninitialized, performing initial sync...');
      await this.syncMetadata();
      data = await ipc.loadMetadata(this.hashedWebhook);
    }
    return Array.isArray(data) ? data : (data?.files || []);
  }

  async _saveFileSystem(files) {
    await ipc.saveMetadata(this.hashedWebhook, files);
    this.uploadMetadataToDiscord(files);
  }

  async createFile(path, messageIds, size, id) {
    const files = await this.getFileSystem();
    const entry = { path, messageIds, size, createdAt: Date.now(), id: id || crypto.randomUUID() };
    files.push(entry);
    await this._saveFileSystem(files);
    return entry;
  }

  async deletePath(targetPath) {
    const files = await this.getFileSystem();
    const filtered = files.filter(f => f.path !== targetPath && !f.path.startsWith(targetPath + '/'));
    await this._saveFileSystem(filtered);
  }
}
