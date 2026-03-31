import { ipc } from '@/utils/ipc';

const CHUNK_SIZE = 7.5 * 1024 * 1024;

export class DisboxAPI {
  constructor(webhookUrl) {
    this.rawWebhookUrl = webhookUrl.split('?')[0].trim();
    this.webhookUrl = this.rawWebhookUrl.replace('discordapp.com', 'discord.com').replace(/\/+$/, '');
    this.hashedWebhook = null;
    this.encryptionKeys = [];
    this.MAGIC_HEADER = new TextEncoder().encode('DBX_ENC:');
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
    const { forceId, metadataUrl } = options;
    if (this._syncing) return false;
    this._syncing = true;
    try {
      const username = localStorage.getItem('dbx_username');
      const identifier = username || this.hashedWebhook;
      const BASE_API = 'https://disbox-web-weld.vercel.app';

      console.log(`[sync] Pulling structure for ${identifier}...`);
      const res = await ipc.fetch(`${BASE_API}/api/files/list?identifier=${identifier}`);
      const result = JSON.parse(res.body);

      if (res.ok && result.files && result.files.length > 0) {
        console.log(`[sync] ✓ Loaded ${result.files.length} items from database.`);
        await ipc.saveMetadata(this.hashedWebhook, result.files);
        return true;
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
        await ipc.fetch(`${BASE_API}/api/files/sync-all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier, files })
        });
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
    ipc.fetch('https://disbox-web-weld.vercel.app/api/files/sync-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, files })
    }).catch(console.error);
  }

  async createFile(path, messageIds, size, id, thumbnailMsgId = null) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const entry = { path, messageIds, size, createdAt: Date.now(), id: id || crypto.randomUUID(), thumbnailMsgId };
      const idx = files.findIndex(f => f.path === path);
      if (idx >= 0) files[idx] = entry; else files.push(entry);
      
      await ipc.saveMetadata(this.hashedWebhook, files);
      this.persistCloud(files);
      return entry;
    });
  }

  async createFolder(folderName, currentPath = '/') {
    const dirPath = currentPath === '/' ? '' : currentPath.replace(/^\/+/, '');
    const fullPath = dirPath ? `${dirPath}/${folderName}/.keep` : `${folderName}/.keep`;
    return await this.createFile(fullPath, [], 0);
  }

  async deletePath(targetPath) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const filtered = files.filter(f => f.path !== targetPath && !f.path.startsWith(targetPath + '/'));
      await ipc.saveMetadata(this.hashedWebhook, filtered);
      this.persistCloud(filtered);
    });
  }

  async renamePath(oldPath, newPath) {
    return this._enqueue(async () => {
      const files = await this.getFileSystem();
      const updated = files.map(f => {
        if (f.path === oldPath) return { ...f, path: newPath };
        if (f.path.startsWith(oldPath + '/')) return { ...f, path: f.path.replace(oldPath, newPath) };
        return f;
      });
      await ipc.saveMetadata(this.hashedWebhook, updated);
      this.persistCloud(updated);
    });
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
