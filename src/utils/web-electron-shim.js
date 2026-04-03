/**
 * Web Shim for Electron APIs
 * Menggunakan IndexedDB sebagai pengganti "Folder Metadata" di Desktop.
 */

const DB_NAME    = 'DisboxWebDB';
const DB_VERSION = 2;
const STORE_NAME = 'metadata';

// ─── CORS Proxy ───────────────────────────────────────────────────────────────
const PROXY_BASE   = '/api/proxy';
const SLICE_SIZE   = 4 * 1024 * 1024; // 4MB
// Note: PROXY_SECRET is no longer bundled into the client for security.
// Signatures will only be generated if the secret is available (e.g. during development).
const PROXY_SECRET = import.meta.env.PROXY_SECRET || '';

function isCdnUrl(url) {
  return url.includes('cdn.discordapp.com') || url.includes('media.discordapp.net');
}

// ─── HMAC sign untuk proxy URL ────────────────────────────────────────────────
async function hmacSign(secret, message) {
  if (!secret) return null;
  try {
    const encoder   = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
    return btoa(String.fromCharCode(...new Uint8Array(sigBuffer)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  } catch { return null; }
}

async function buildProxyUrl(cdnUrl, start, end) {
  const params = new URLSearchParams({ url: cdnUrl });
  if (start !== undefined) params.set('start', start);
  if (end   !== undefined) params.set('end',   end);
  if (PROXY_SECRET) {
    const sig = await hmacSign(PROXY_SECRET, cdnUrl);
    params.set('sig', sig);
  }
  return `${PROXY_BASE}?${params.toString()}`;
}

// ─── Signal registry ──────────────────────────────────────────────────────────
const transferSignalRegistry = new Map();

// ─── IndexedDB helper ─────────────────────────────────────────────────────────
const getDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror   = (e) => reject(e.target.error);
  });
};

// ─── Ranged proxy download ────────────────────────────────────────────────────
async function rangedProxyDownload(url, signal) {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  const firstProxyUrl = await buildProxyUrl(url, 0, SLICE_SIZE - 1);
  const firstRes = await fetch(firstProxyUrl, signal ? { signal } : {});
  if (!firstRes.ok) throw new Error(`Proxy error: ${firstRes.status}`);

  const totalSize   = parseInt(firstRes.headers.get('x-total-size') || '0', 10);
  const firstBuffer = await firstRes.arrayBuffer();
  if (!totalSize || totalSize <= SLICE_SIZE) return new Uint8Array(firstBuffer);

  const remaining = [];
  for (let start = SLICE_SIZE; start < totalSize; start += SLICE_SIZE) {
    remaining.push({ start, end: Math.min(start + SLICE_SIZE - 1, totalSize - 1) });
  }

  const CONCURRENCY = 3;
  const extraBuffers = [];
  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const batch = remaining.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async ({ start, end }) => {
        const proxyUrl = await buildProxyUrl(url, start, end);
        const res = await fetch(proxyUrl, signal ? { signal } : {});
        if (!res.ok) throw new Error(`Proxy slice error: ${res.status}`);
        return res.arrayBuffer();
      })
    );
    extraBuffers.push(...results);
  }

  const slices = [firstBuffer, ...extraBuffers];
  const merged = new Uint8Array(totalSize);
  let offset = 0;
  for (const slice of slices) { merged.set(new Uint8Array(slice), offset); offset += slice.byteLength; }
  return merged;
}

export const webElectronShim = {
  minimize: () => {},
  maximize: () => {},
  close: () => {},
  isMaximized: async () => false,

  registerTransferSignal:   (id, signal) => transferSignalRegistry.set(id, signal),
  unregisterTransferSignal: (id)         => transferSignalRegistry.delete(id),

  fetch: async (url, options = {}) => {
    try {
      let fetchUrl = url;
      const isDiscordUrl = url.includes('discord.com') || url.includes('discordapp.com');
      const isGet = !options.method || options.method === 'GET';

      if (isDiscordUrl && isGet) {
        fetchUrl = await buildProxyUrl(url);
        // Cache buster agar proxy tidak return stale response
        const proxyUrlObj = new URL(fetchUrl, window.location.origin);
        proxyUrlObj.searchParams.append('_t', Date.now().toString());
        fetchUrl = proxyUrlObj.toString();
      }

      const response = await fetch(fetchUrl, {
        method: options.method || 'GET',
        headers: options.headers,
        body: options.body,
        signal: options.signal,
      });
      const body = await response.text();

      // Jika proxy return 5xx (misal CDN attachment expired), jangan langsung fail —
      // return status asli agar caller bisa handle (retry, fallback, dll)
      return { status: response.status, body, ok: response.ok };
    } catch (e) {
      if (e.name === 'AbortError') return { status: 0, body: '', ok: false, error: 'ABORTED' };
      return { status: 0, body: '', ok: false, error: e.message };
    }
  },

  proxyDownload: async (url, transferId) => {
    const signal = (typeof transferId === 'string')
      ? (transferSignalRegistry.get(transferId) ?? null)
      : (transferId instanceof AbortSignal ? transferId : null);

    if (!isCdnUrl(url)) {
      const response = await fetch(url, signal ? { signal } : {});
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    }
    return await rangedProxyDownload(url, signal);
  },

  openFiles: async () => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file'; input.multiple = true;
      input.onchange = (e) => resolve(Array.from(e.target.files));
      input.click();
    });
  },

  saveFile:  async (filename) => filename,

  readFile: async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ data: reader.result.split(',')[1], name: file.name, size: file.size });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  writeFile: async (filename, data) => {
    const blob = new Blob([data]);
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    return true;
  },

  statFile:   async (file) => ({ size: file.size || 0, name: file.name || 'unknown' }),
  getVersion: async () => '3.6.0-web',
  confirm:    async ({ title, message }) => window.confirm(`${title}\n\n${message}`),

  getPrefs: async () => {
    const match = document.cookie.match(new RegExp('(^| )disbox_prefs=([^;]+)'));
    try { 
      return match ? JSON.parse(decodeURIComponent(atob(match[2]).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))) : {}; 
    } catch { return {}; }
  },

  setPrefs: async (prefs) => {
    const current = await webElectronShim.getPrefs();
    const data = btoa(encodeURIComponent(JSON.stringify({ ...current, ...prefs })).replace(/%([0-9A-F]{2})/g, (m, p) => String.fromCharCode('0x' + p)));
    document.cookie = `disbox_prefs=${data}; path=/; max-age=31536000; SameSite=Lax`;
    return prefs;
  },

  loadMetadata: async (hash) => {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(hash);
      req.onsuccess = () => {
        const val = req.result;
        // Kembalikan array files saja (disbox.js expects array)
        resolve(Array.isArray(val) ? val : (val?.files || []));
      };
      req.onerror   = () => resolve([]);
    });
  },

  saveMetadata: async (hash, data, msgId = null) => {
    const db  = await getDB();
    const isContainer = !Array.isArray(data) && data !== null && typeof data === 'object';
    const filesToSave = isContainer ? (data.files || []) : data;

    await new Promise((resolve, reject) => {
      const tx  = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(filesToSave, hash);

      // Simpan msgId ke IndexedDB agar persist
      if (msgId) {
        store.put(msgId, `msgid_${hash}`);
      }

      if (isContainer) {
        if (data.pinHash) {
          store.put(data.pinHash, `pin_${hash}`);
          document.cookie = `dbx_pin_${hash}=${data.pinHash}; path=/; max-age=31536000; Secure; SameSite=Lax`;
        } else if (msgId) {
          store.delete(`pin_${hash}`);
          document.cookie = `dbx_pin_${hash}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
        if (data.shareLinks) store.put(data.shareLinks, `links_${hash}`);
      }

      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });

    if (msgId) document.cookie = `dbx_sync_${hash}=${msgId}; path=/; max-age=31536000; SameSite=Lax`;
    return true;
  },

  getLatestMetadataMsgId: async (hash) => {
    // Cek IndexedDB dulu (lebih reliable dari cookie)
    try {
      const db = await getDB();
      const idbMsgId = await new Promise((resolve) => {
        const tx  = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(`msgid_${hash}`);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => resolve(null);
      });
      if (idbMsgId) return idbMsgId;
    } catch {}

    // Fallback ke cookie
    const match = document.cookie.match(new RegExp('(^| )dbx_sync_' + hash + '=([^;]+)'));
    if (match) return match[2];

    return null;
  },

  setActiveWebhook: (url, hash) => {
    document.cookie = `dbx_active_hash=${hash}; path=/; SameSite=Lax`;
  },

  setLocked: async (id, hash, isLocked) => {
    try {
      const db = await getDB();
      const meta = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(hash);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      const updated = meta.map(f => {
        if (f.id === id) return { ...f, isLocked };
        if (f.path === id || f.path.startsWith(id + '/')) return { ...f, isLocked };
        return f;
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(updated, hash);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return true;
    } catch (e) { console.error('[web-shim] setLocked failed:', e.message); return false; }
  },

  setStarred: async (id, hash, isStarred) => {
    try {
      const db = await getDB();
      const meta = await new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(hash);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
      const updated = meta.map(f => {
        if (f.id === id) return { ...f, isStarred };
        if (f.path === (id ? `${id}/.keep` : '.keep')) return { ...f, isStarred };
        return f;
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(updated, hash);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      return true;
    } catch (e) { console.error('[web-shim] setStarred failed:', e.message); return false; }
  },

  setPin: async (hash, pin) => {
    const data       = new TextEncoder().encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex    = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    document.cookie  = `dbx_pin_${hash}=${hashHex}; path=/; max-age=31536000; Secure; SameSite=Lax`;
    try {
      const db = await getDB();
      await new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(hashHex, `pin_${hash}`);
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error);
      });
    } catch (e) { console.warn('[pin] IndexedDB save failed:', e.message); }
    return true;
  },

  verifyPin: async (hash, pin) => {
    const data       = new TextEncoder().encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashHex    = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Cek IndexedDB dulu (source of truth)
    try {
      const db = await getDB();
      const stored = await new Promise((resolve) => {
        const tx  = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(`pin_${hash}`);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => resolve(null);
      });
      if (stored) return stored === hashHex;
    } catch {}

    // Fallback ke cookie
    const match = document.cookie.match(new RegExp('(^| )dbx_pin_' + hash + '=([^;]+)'));
    if (!match) return false;
    return match[2] === hashHex;
  },

  hasPin: async (hash) => {
    // Cek IndexedDB dulu
    try {
      const db = await getDB();
      const val = await new Promise((resolve) => {
        const tx  = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(`pin_${hash}`);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => resolve(null);
      });
      if (val) return true;
    } catch {}
    // Fallback ke cookie
    return document.cookie.indexOf(`dbx_pin_${hash}=`) !== -1;
  },

  removePin: async (hash) => {
    document.cookie = `dbx_pin_${hash}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
    try {
      const db = await getDB();
      await new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(`pin_${hash}`);
        tx.oncomplete = () => resolve();
        tx.onerror    = () => reject(tx.error);
      });
    } catch (e) { console.warn('[pin] IndexedDB delete failed:', e.message); }
    return true;
  },

  uploadChunk: async (webhookUrl, chunkB64, filename) => {
    try {
      const byteCharacters = atob(chunkB64);
      const byteNumbers    = Array.from({ length: byteCharacters.length }, (_, i) => byteCharacters.charCodeAt(i));
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/octet-stream' });
      const formData = new FormData();
      formData.append('file', blob, filename);
      const response = await fetch(webhookUrl + '?wait=true', { method: 'POST', body: formData });
      const body     = await response.text();
      return { ok: response.ok, status: response.status, body };
    } catch (e) {
      return { ok: false, status: 0, body: '', error: e.message };
    }
  },

  // Cloud Save (disabled on web)
  cloudsaveGetAll:      async () => [],
  cloudsaveAdd:         async () => null,
  cloudsaveUpdate:      async () => false,
  cloudsaveRemove:      async () => false,
  cloudsaveExportZip:   async () => ({ ok: false }),
  cloudsaveSyncEntry:   async () => false,
  cloudsaveChooseFolder:async () => null,
  cloudsaveGetStatus:   async () => null,
  cloudsaveRestore:     async () => ({ ok: false }),

  // ─── Share Settings & Links (via Cloudflare Worker) ─────────────────────

  shareGetSettings: async (hash) => {
    const match = document.cookie.match(new RegExp('(^| )dbx_share_' + hash + '=([^;]+)'));
    try { 
      return match ? JSON.parse(decodeURIComponent(atob(match[2]).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))) : null; 
    } catch { return null; }
  },

  shareSaveSettings: async (hash, settings) => {
    const data = btoa(encodeURIComponent(JSON.stringify(settings)).replace(/%([0-9A-F]{2})/g, (m, p) => String.fromCharCode('0x' + p)));
    document.cookie = `dbx_share_${hash}=${data}; path=/; max-age=31536000; SameSite=Lax`;
    return true;
  },

  shareGetLinks: async (hash) => {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx  = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(`links_${hash}`);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => resolve([]);
    });
  },

  shareCreateLink: async (hash, { filePath, fileId, permission, expiresAt }) => {
    try {
      const settingsCookie = document.cookie.match(new RegExp('(^| )dbx_share_' + hash + '=([^;]+)'));
      let settings = null;
      try { 
        settings = settingsCookie ? JSON.parse(decodeURIComponent(atob(settingsCookie[2]).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))) : null; 
      } catch {}

      const PUBLIC_WORKER_URL = 'https://disbox-shared-link.naufal-backup.workers.dev';
      const PUBLIC_API_KEYS = {
        'https://disbox-shared-link.naufal-backup.workers.dev':       'disbox-shared-link-0001',
        'https://disbox-shared-link.alamsyahnaufal453.workers.dev':   'disbox-shared-link-0002',
        'https://disbox-worker-2.naufal-backup.workers.dev':          'disbox-shared-link-0001',
        'https://disbox-worker-3.naufal-backup.workers.dev':          'disbox-shared-link-0001',
      };
      const DEFAULT_API_KEY = import.meta.env.VITE_DEFAULT_WORKER_KEY || 'disbox-shared-link-0001';

      let cfWorkerUrl = (settings?.cf_worker_url || PUBLIC_WORKER_URL).replace(/\/+$/, '');
      if (!cfWorkerUrl || !cfWorkerUrl.startsWith('http'))
        return { ok: false, message: 'URL Cloudflare Worker belum diset. Periksa tab Settings.' };

      const normalize = (u) => u?.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').trim();
      const target = normalize(cfWorkerUrl);
      let apiKey = DEFAULT_API_KEY;
      for (const [url, key] of Object.entries(PUBLIC_API_KEYS)) {
        if (normalize(url) === target) { apiKey = key; break; }
      }

      const webhookUrl = (settings?.webhook_url || '').split('?')[0].replace(/\/+$/, '');
      if (!webhookUrl)
        return { ok: false, message: 'Webhook URL tidak ditemukan. Reconnect ke drive terlebih dahulu.' };

      let messageIds = [];
      try {
        const db   = await getDB();
        const meta = await new Promise((resolve) => {
          const tx  = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(hash);
          req.onsuccess = () => { const v = req.result; resolve(Array.isArray(v) ? v : (v?.files || [])); };
          req.onerror   = () => resolve([]);
        });
        const file = meta.find(f => f.id === fileId || f.path === filePath);
        if (!file) return { ok: false, message: 'File tidak ditemukan di metadata.' };
        const rawIds = file.messageIds || [];
        messageIds = rawIds.map(m => ({
          msgId: typeof m === 'string' ? m : m.msgId,
          attachmentUrl: null
        }));
      } catch (e) {
        return { ok: false, message: 'Gagal membaca metadata: ' + e.message };
      }

      let encryptionKeyB64 = null;
      try {
        const keyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(webhookUrl));
        encryptionKeyB64 = btoa(String.fromCharCode(...new Uint8Array(keyHash)));
      } catch {}

      const token = crypto.randomUUID().replace(/-/g, '');
      const fileName = filePath.split('/').pop();

      const res = await fetch(`${cfWorkerUrl}/share/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Disbox-Key': apiKey.trim(),
        },
        body: JSON.stringify({
          token, fileId, filePath, permission,
          expiresAt: expiresAt || null,
          webhookHash: hash,
          messageIds,
          encryptionKeyB64,
          webhookUrl,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error('[share] CF Worker error:', res.status, body);
        return { ok: false, message: `CF Worker error ${res.status}` };
      }

      const linkId  = crypto.randomUUID();
      const shareUrl = `${cfWorkerUrl}/share/${token}`;
      const newLink = {
        id: linkId, hash, file_path: filePath, file_id: fileId || null,
        token, share_url: shareUrl, permission: permission || 'download',
        expires_at: expiresAt || null, created_at: Date.now(),
      };

      try {
        const db      = await getDB();
        const existing = await new Promise((resolve) => {
          const tx  = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(`links_${hash}`);
          req.onsuccess = () => resolve(req.result || []);
          req.onerror   = () => resolve([]);
        });
        const updated = [...existing, newLink];
        await new Promise((resolve, reject) => {
          const tx  = db.transaction(STORE_NAME, 'readwrite');
          const req = tx.objectStore(STORE_NAME).put(updated, `links_${hash}`);
          req.onsuccess = () => resolve();
          req.onerror   = () => reject(req.error);
        });
      } catch (e) {
        console.warn('[share] Gagal simpan link ke IndexedDB:', e.message);
      }

      return { ok: true, link: shareUrl, token, id: linkId };
    } catch (e) {
      console.error('[share] shareCreateLink error:', e.message);
      return { ok: false, message: e.message };
    }
  },

  shareRevokeLink: async (hash, { id, token }) => {
    try {
      const settingsCookie = document.cookie.match(new RegExp('(^| )dbx_share_' + hash + '=([^;]+)'));
      let settings = null;
      try { 
        settings = settingsCookie ? JSON.parse(decodeURIComponent(atob(settingsCookie[2]).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))) : null; 
      } catch {}
      const PUBLIC_WORKER_URL = 'https://disbox-shared-link.naufal-backup.workers.dev';
      const cfWorkerUrl = (settings?.cf_worker_url || PUBLIC_WORKER_URL).replace(/\/+$/, '');

      const PUBLIC_API_KEYS = {
        'https://disbox-shared-link.naufal-backup.workers.dev':       'disbox-shared-link-0001',
        'https://disbox-shared-link.alamsyahnaufal453.workers.dev':   'disbox-shared-link-0002',
        'https://disbox-worker-2.naufal-backup.workers.dev':          'disbox-shared-link-0001',
        'https://disbox-worker-3.naufal-backup.workers.dev':          'disbox-shared-link-0001',
      };
      const normalize = (u) => u?.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').trim();
      let apiKey = 'disbox-shared-link-0001';
      for (const [url, key] of Object.entries(PUBLIC_API_KEYS)) {
        if (normalize(url) === normalize(cfWorkerUrl)) { apiKey = key; break; }
      }

      await fetch(`${cfWorkerUrl}/share/revoke/${token}`, {
        method: 'DELETE',
        headers: { 'X-Disbox-Key': apiKey.trim() },
      }).catch(e => console.warn('[share] CF revoke failed:', e.message));

      const db = await getDB();
      const existing = await new Promise((resolve) => {
        const tx  = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(`links_${hash}`);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror   = () => resolve([]);
      });
      const filtered = existing.filter(l => l.id !== id);
      await new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(filtered, `links_${hash}`);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
      return true;
    } catch (e) {
      console.error('[share] shareRevokeLink error:', e.message);
      return false;
    }
  },

  shareRevokeAll: async (hash) => {
    try {
      const settingsCookie = document.cookie.match(new RegExp('(^| )dbx_share_' + hash + '=([^;]+)'));
      let settings = null;
      try { 
        settings = settingsCookie ? JSON.parse(decodeURIComponent(atob(settingsCookie[2]).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))) : null; 
      } catch {}
      const PUBLIC_WORKER_URL = 'https://disbox-shared-link.naufal-backup.workers.dev';
      const cfWorkerUrl = (settings?.cf_worker_url || PUBLIC_WORKER_URL).replace(/\/+$/, '');

      const PUBLIC_API_KEYS = {
        'https://disbox-shared-link.naufal-backup.workers.dev':       'disbox-shared-link-0001',
        'https://disbox-shared-link.alamsyahnaufal453.workers.dev':   'disbox-shared-link-0002',
        'https://disbox-worker-2.naufal-backup.workers.dev':          'disbox-shared-link-0001',
        'https://disbox-worker-3.naufal-backup.workers.dev':          'disbox-shared-link-0001',
      };
      const normalize = (u) => u?.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').trim();
      let apiKey = 'disbox-shared-link-0001';
      for (const [url, key] of Object.entries(PUBLIC_API_KEYS)) {
        if (normalize(url) === normalize(cfWorkerUrl)) { apiKey = key; break; }
      }

      await fetch(`${cfWorkerUrl}/share/revoke-all/${hash}`, {
        method: 'DELETE',
        headers: { 'X-Disbox-Key': apiKey.trim() },
      }).catch(e => console.warn('[share] CF revoke-all failed:', e.message));

      const db = await getDB();
      await new Promise((resolve, reject) => {
        const tx  = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put([], `links_${hash}`);
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
      return true;
    } catch (e) {
      console.error('[share] shareRevokeAll error:', e.message);
      return false;
    }
  },

  getPinHash: async (hash) => {
    try {
      const db = await getDB();
      return await new Promise((resolve) => {
        const tx  = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(`pin_${hash}`);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror   = () => resolve(null);
      });
    } catch { return null; }
  },

  onMetadataStatus: (cb) => () => {},
  onMetadataChange: (cb) => () => {},
};
