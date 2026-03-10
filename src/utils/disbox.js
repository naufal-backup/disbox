// ─── Disbox API — Serverless Edition ─────────────────────────────────────────
// Metadata disimpan lokal di file JSON (via Electron IPC), bukan di server
// eksternal. Upload/download tetap ke Discord webhook.

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB

// Helper: ArrayBuffer → base64 — pakai FileReader (tidak ada stack overflow)
function _bufferToBase64(buffer) {
  return new Promise((resolve) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    reader.onloadend = () => {
      // result = "data:application/octet-stream;base64,XXXX"
      const b64 = reader.result.split(',')[1];
      resolve(b64);
    };
    reader.readAsDataURL(blob);
  });
}

export class DisboxAPI {
  constructor(webhookUrl) {
    this.webhookUrl = webhookUrl;
    this.hashedWebhook = null;
  }

  async hashWebhook(url) {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async init() {
    this.hashedWebhook = await this.hashWebhook(this.webhookUrl);
    return this.hashedWebhook;
  }

  // Validasi webhook langsung ke Discord (via Electron IPC — no CORS)
  async validateWebhook() {
    try {
      const res = await window.electron.fetch(this.webhookUrl);
      if (!res.ok) return false;
      const data = JSON.parse(res.body);
      return !!data?.id;
    } catch (e) {
      console.error('[disbox] validateWebhook:', e.message);
      return false;
    }
  }

  // ─── Filesystem lokal ────────────────────────────────────────────────────
  // Disimpan di: ~/.config/disbox/<hash>.json  (via Electron IPC)

  async getFileSystem() {
    try {
      const data = await window.electron.loadMetadata(this.hashedWebhook);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async _saveFileSystem(files) {
    await window.electron.saveMetadata(this.hashedWebhook, files);
  }

  async createFile(filePath, messageIds, size = 0) {
    const files = await this.getFileSystem();
    const existing = files.findIndex(f => f.path === filePath);
    const entry = { path: filePath, messageIds, size, createdAt: Date.now() };
    if (existing >= 0) files[existing] = entry;
    else files.push(entry);
    await this._saveFileSystem(files);
    return entry;
  }

  async deleteFile(filePath) {
    const files = await this.getFileSystem();
    const filtered = files.filter(f => f.path !== filePath);
    await this._saveFileSystem(filtered);
    return { deleted: true };
  }

  async renameFile(oldPath, newPath) {
    const files = await this.getFileSystem();
    const idx = files.findIndex(f => f.path === oldPath);
    if (idx >= 0) files[idx] = { ...files[idx], path: newPath };
    await this._saveFileSystem(files);
    return files[idx];
  }

  // ─── Upload ke Discord ────────────────────────────────────────────────────
  // Jika ada filePath (dari Electron file dialog) → kirim path ke main process,
  // baca + upload langsung dari sana (tidak ada data lewat IPC, tidak ada OOM).
  // Jika dari browser drag-drop (File object) → baca per chunk di renderer.

  async uploadFile(file, filePath, onProgress) {
    // file.nativePath tersedia jika file dipilih via Electron dialog
    if (file.nativePath && window.electron?.uploadFileFromPath) {
      const res = await window.electron.uploadFileFromPath(
        this.webhookUrl, file.nativePath, filePath,
        (progress) => onProgress?.(progress)
      );
      if (!res.ok) throw new Error(res.error || 'Upload gagal');
      await this.createFile(filePath, res.messageIds, res.size);
      return res.messageIds;
    }

    // Fallback: buffer sudah ada di memory (drag-drop dari luar Electron)
    const totalSize = file.buffer.byteLength;
    const numChunks = Math.ceil(totalSize / CHUNK_SIZE) || 1;
    const messageIds = [];

    for (let i = 0; i < numChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, totalSize);
      const chunk = file.buffer.slice(start, end);

      const chunkB64 = await _bufferToBase64(chunk);
      const chunkName = `${file.name}.part${i}`;

      const res = await window.electron.uploadChunk(this.webhookUrl, chunkB64, chunkName);
      if (!res.ok) {
        throw new Error(`Upload chunk ${i} gagal (${res.status}): ${res.body?.slice(0, 200)}`);
      }

      const data = JSON.parse(res.body);
      messageIds.push(data.id);
      onProgress?.((i + 1) / numChunks);
    }

    await this.createFile(filePath, messageIds, totalSize);
    return messageIds;
  }

  // ─── Download dari Discord ────────────────────────────────────────────────
  // messageIds disimpan lokal → fetch Discord message URL → download binary

  async downloadFile(file, onProgress) {
    const messageIds = file.messageIds || [];
    const chunks = [];

    // Extract webhook base URL untuk fetch message
    // Format: https://discord.com/api/webhooks/{id}/{token}
    const webhookBase = this.webhookUrl;

    for (let i = 0; i < messageIds.length; i++) {
      // Fetch message dari Discord untuk dapat attachment URL
      const msgUrl = `${webhookBase}/messages/${messageIds[i]}`;
      const msgRes = await window.electron.fetch(msgUrl);

      if (!msgRes.ok) throw new Error(`Gagal fetch message ${messageIds[i]}: ${msgRes.status}`);
      const msg = JSON.parse(msgRes.body);

      const attachmentUrl = msg.attachments?.[0]?.url;
      if (!attachmentUrl) throw new Error('Attachment URL tidak ditemukan');

      // Download binary via Electron (no CORS)
      const b64 = await window.electron.proxyDownload(attachmentUrl);
      const chunkData = Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;

      chunks.push(chunkData);
      onProgress?.((i + 1) / messageIds.length);
    }

    // Gabungkan chunks
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
    json: 'application/json', js: 'text/javascript',
    zip: 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}
