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
    // Clean webhook URL from any query parameters (like ?wait=true)
    this.webhookUrl = webhookUrl.split('?')[0];
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

  async init(forceSyncId = null) {
    this.hashedWebhook = await this.hashWebhook(this.webhookUrl);
    this.lastSyncedId = localStorage.getItem(`dbx_last_sync_${this.hashedWebhook}`);
    console.log('[disbox] Initialized with webhook hash:', this.hashedWebhook);
    // Sync metadata from Discord
    await this.syncMetadata(forceSyncId);
    return this.hashedWebhook;
  }

  // ─── Metadata Sync (Discord as DB) ───────────────────────────────────────
  
  async syncMetadata(forceId = null) {
    try {
      let msgId = forceId;
      
      if (!msgId) {
        console.log('[sync] Checking Discord for metadata discovery...');
        const res = await window.electron.fetch(this.webhookUrl);
        if (!res.ok) {
          console.error('[sync] Failed to fetch webhook info:', res.status);
          return;
        }
        
        const info = JSON.parse(res.body);
        // More flexible regex: allow spaces, pipes, and different separators
        const match = info.name?.match(/dbx[:\s]+(\d+)/);
        if (!match) {
          console.log('[sync] No metadata ID found in webhook name:', info.name);
          // If no discovery ID in name, but we have a lastSyncedId, let's at least try that as fallback
          if (this.lastSyncedId) {
            console.log('[sync] Falling back to last known synced ID:', this.lastSyncedId);
            msgId = this.lastSyncedId;
          } else {
            return;
          }
        } else {
          msgId = match[1];
        }
      }

      console.log('[sync] Target metadata message ID:', msgId);
      
      if (msgId === this.lastSyncedId && !forceId) {
        console.log('[sync] Local metadata is up to date.');
        // Even if ID matches, let's verify local file exists
        const local = await window.electron.loadMetadata(this.hashedWebhook);
        if (local && local.length > 0) return;
        console.log('[sync] Local metadata missing, re-downloading...');
      }

      const msgUrl = `${this.webhookUrl}/messages/${msgId}`;
      const msgRes = await window.electron.fetch(msgUrl);
      if (!msgRes.ok) {
        console.error('[sync] Failed to fetch metadata message:', msgRes.status);
        // If message is 404, the discovery ID is dead
        return;
      }

      const msg = JSON.parse(msgRes.body);
      // Look for disbox_metadata.json in attachments
      const attachment = msg.attachments?.find(a => a.filename.includes('metadata.json'));
      const attachmentUrl = attachment?.url || msg.attachments?.[0]?.url;
      
      if (!attachmentUrl) {
        console.error('[sync] No attachment found in metadata message.');
        return;
      }

      console.log('[sync] Downloading updated metadata from Discord...');
      const bytes = await window.electron.proxyDownload(attachmentUrl);
      
      // Decode binary metadata to JSON string
      const jsonStr = new TextDecoder().decode(bytes);
      const files = JSON.parse(jsonStr);

      if (Array.isArray(files)) {
        await window.electron.saveMetadata(this.hashedWebhook, files);
        this.lastSyncedId = msgId;
        localStorage.setItem(`dbx_last_sync_${this.hashedWebhook}`, msgId);
        console.log('[sync] Metadata updated from Discord. Items:', files.length);
      }
    } catch (e) {
      console.error('[sync] Sync-from-Discord failed:', e.message);
    }
  }

  async uploadMetadataToDiscord(files) {
    // Debounce to avoid Discord rate limits on name changes
    if (this._syncTimeout) clearTimeout(this._syncTimeout);
    
    this._syncTimeout = setTimeout(async () => {
      try {
        console.log('[sync] Uploading metadata to Discord...');
        const jsonStr = JSON.stringify(files);
        const encoder = new TextEncoder();
        const buffer = encoder.encode(jsonStr).buffer;
        const b64 = await _bufferToBase64(buffer);
        const filename = `disbox_metadata.json`;
        
        // Upload JSON file
        const res = await window.electron.uploadChunk(this.webhookUrl, b64, filename);
        if (!res.ok) throw new Error(`Upload failed with status ${res.status}`);
        
        const data = JSON.parse(res.body);
        const msgId = data.id;

        // Update Webhook Name to include the new metadata ID for discovery
        const infoRes = await window.electron.fetch(this.webhookUrl);
        if (infoRes.ok) {
          const info = JSON.parse(infoRes.body);
          // Keep the part before the first separator or the whole name if no dbx:
          let baseName = (info.name || 'Disbox').split(/[|:-] dbx:/)[0].trim();
          const newName = `${baseName} | dbx:${msgId}`;
          
          console.log('[sync] Updating webhook name to:', newName);
          const patchRes = await window.electron.fetch(this.webhookUrl, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
          });
          
          if (!patchRes.ok) {
            console.warn('[sync] Failed to update webhook name. Discovery might fail on next session.', patchRes.status);
          }
          
          this.lastSyncedId = msgId;
          localStorage.setItem(`dbx_last_sync_${this.hashedWebhook}`, msgId);
          console.log('[sync] Metadata synced to Discord. Discovery ID:', msgId);
        }
      } catch (e) {
        console.error('[sync] Sync-to-Discord failed:', e.message);
      }
    }, 4000); 
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
      let files = Array.isArray(data) ? data : [];
      
      // Auto-convert: add IDs if missing and enforce pattern/order
      let changed = false;
      files = files.map(f => {
        if (!f.id || Object.keys(f)[0] !== 'path') {
          changed = true;
          return {
            path: f.path,
            messageIds: f.messageIds || [],
            size: f.size || 0,
            createdAt: f.createdAt || Date.now(),
            id: f.id || crypto.randomUUID()
          };
        }
        return f;
      });

      if (changed) {
        await window.electron.saveMetadata(this.hashedWebhook, files);
      }

      return files;
    } catch {
      return [];
    }
  }

  async _saveFileSystem(files) {
    await window.electron.saveMetadata(this.hashedWebhook, files);
    // Also sync to Discord for cross-device support
    await this.uploadMetadataToDiscord(files);
  }

  async createFile(filePath, messageIds, size = 0, id = null) {
    const files = await this.getFileSystem();
    const fileId = id || crypto.randomUUID();
    
    // Construct entry with specific key order
    const entry = { 
      path: filePath, 
      messageIds, 
      size, 
      createdAt: Date.now(),
      id: fileId
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
        // target could be ID or path
        const isId = target.includes('-') && target.length > 30; // simple uuid check
        
        if (isId && f.id === target) {
          const name = f.path.split('/').pop();
          const newPath = destDir ? `${destDir}/${name}` : name;
          return { ...f, path: newPath };
        }
        
        const oldPath = target;
        const name = oldPath.split('/').pop();
        const newPath = destDir ? `${destDir}/${name}` : name;
        if (f.path === oldPath) {
          return { ...f, path: newPath };
        }
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
        toAdd.push({
          path: newPath,
          messageIds: [...f.messageIds],
          size: f.size,
          createdAt: Date.now(),
          id: crypto.randomUUID()
        });
      } else if (f.path.startsWith(oldPath + '/')) {
        toAdd.push({
          path: f.path.replace(oldPath + '/', newPath + '/'),
          messageIds: [...f.messageIds],
          size: f.size,
          createdAt: Date.now(),
          id: crypto.randomUUID()
        });
      }
    });
    
    if (toAdd.length > 0) {
      await this._saveFileSystem([...files, ...toAdd]);
    }
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

      // Prevent self-copy
      if (sourcePath === newPath || newPath.startsWith(sourcePath + '/')) return;

      files.forEach(f => {
        if (f.path === sourcePath) {
          toAdd.push({
            path: newPath,
            messageIds: [...f.messageIds],
            size: f.size,
            createdAt: Date.now(),
            id: crypto.randomUUID()
          });
        } else if (f.path.startsWith(sourcePath + '/')) {
          toAdd.push({
            path: f.path.replace(sourcePath + '/', newPath + '/'),
            messageIds: [...f.messageIds],
            size: f.size,
            createdAt: Date.now(),
            id: crypto.randomUUID()
          });
        }
      });
    });

    if (toAdd.length > 0) {
      await this._saveFileSystem([...files, ...toAdd]);
    }
    return { success: true };
  }


  // Legacy compatibility
  async deleteFile(filePath) { return this.deletePath(filePath); }
  async renameFile(oldPath, newPath) { return this.renamePath(oldPath, newPath); }

  // ─── Upload ke Discord ────────────────────────────────────────────────────
  // Jika ada filePath (dari Electron file dialog) → kirim path ke main process,
  // baca + upload langsung dari sana (tidak ada data lewat IPC, tidak ada OOM).
  // Jika dari browser drag-drop (File object) → baca per chunk di renderer.

  async uploadFile(file, filePath, onProgress) {
    const fileId = crypto.randomUUID();
    
    // file.nativePath tersedia jika file dipilih via Electron dialog
    if (file.nativePath && window.electron?.uploadFileFromPath) {
      const res = await window.electron.uploadFileFromPath(
        this.webhookUrl, file.nativePath, `${fileId}_${filePath.split('/').pop()}`,
        (progress) => onProgress?.(progress)
      );
      if (!res.ok) throw new Error(res.error || 'Upload gagal');
      await this.createFile(filePath, res.messageIds, res.size, fileId);
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
      const fileNameOnly = filePath.split('/').pop();
      const chunkName = `${fileId}_${fileNameOnly}.part${i}`;

      const res = await window.electron.uploadChunk(this.webhookUrl, chunkB64, chunkName);
      if (!res.ok) {
        throw new Error(`Upload chunk ${i} gagal (${res.status}): ${res.body?.slice(0, 200)}`);
      }

      const data = JSON.parse(res.body);
      messageIds.push(data.id);
      onProgress?.((i + 1) / numChunks);
    }

    await this.createFile(filePath, messageIds, totalSize, fileId);
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
      const chunkData = await window.electron.proxyDownload(attachmentUrl);
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
    json: 'application/json', js: 'text/javascript', ts: 'text/typescript',
    py: 'text/x-python', rs: 'text/rust', md: 'text/markdown',
    yml: 'text/yaml', yaml: 'text/yaml', xml: 'text/xml',
    zip: 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}
