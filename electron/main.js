const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, session, net, Notification, protocol } = require('electron');

// Register disbox-stream protocol as privileged
protocol.registerSchemesAsPrivileged([
  { scheme: 'disbox-stream', privileges: { stream: true, bypassCSP: true, supportFetchAPI: true, corsEnabled: true } }
]);
const path = require('path');
const fs = require('fs');
const os = require('os');
const chokidar = require('chokidar');
const archiver = require('archiver');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ─── Tangkap SIGINT/SIGTERM agar before-quit terpicu ─────────────────────────
process.on('SIGINT', () => {
  console.log('[main] SIGINT received, calling app.quit() untuk trigger before-quit...');
  app.quit();
});
process.on('SIGTERM', () => {
  console.log('[main] SIGTERM received, calling app.quit()...');
  app.quit();
});

let mainWindow;
let tray;
let isQuitting = false;

var uploadCancelFlags = new Map();
const abortControllers = new Map();

const cryptoNode = require('crypto');

// ─── Share & Privacy Constants ───────────────────────────────────────────────
const PUBLIC_WORKER_URL = 'https://disbox-shared-link.naufal-backup.workers.dev';
const PUBLIC_API_KEYS = {
  'https://disbox-shared-link.alamsyahnaufal453.workers.dev': 'disbox-shared-link-0002',
  'https://disbox-shared-link.naufal-backup.workers.dev': 'disbox-shared-link-0001',
  'https://disbox-worker-2.naufal-backup.workers.dev': 'disbox-shared-link-0001',
  'https://disbox-worker-3.naufal-backup.workers.dev': 'disbox-shared-link-0001'
};
const DEFAULT_PUBLIC_API_KEY = 'disbox-shared-link-0001';
const MAGIC_HEADER = Buffer.from('DBX_ENC:');

function normalizeUrl(url) {
  if (!url) return '';
  return url.split('?')[0].trim().replace(/\/+$/, '');
}

function getEncryptionKey(url) {
  if (!url) return null;
  const baseUrl = normalizeUrl(url);
  return cryptoNode.createHash('sha256').update(baseUrl).digest();
}

function encrypt(data, key) {
  if (!key) return data;
  const iv = cryptoNode.randomBytes(12);
  const cipher = cryptoNode.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Web Crypto format: [MAGIC][IV][CIPHERTEXT][TAG]
  return Buffer.concat([MAGIC_HEADER, iv, encrypted, tag]);
}

function decrypt(data, key) {
  if (!key || data.length < MAGIC_HEADER.length + 12 + 16) return data;
  if (!data.slice(0, MAGIC_HEADER.length).equals(MAGIC_HEADER)) return data;

  try {
    const iv = data.slice(MAGIC_HEADER.length, MAGIC_HEADER.length + 12);
    const tag = data.slice(data.length - 16);
    const ciphertext = data.slice(MAGIC_HEADER.length + 12, data.length - 16);
    const decipher = cryptoNode.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (e) {
    console.error('[crypto] Decryption failed:', e.message);
    return data;
  }
}

// ─── Metadata lokal ───────────────────────────────────────────────────────────
const METADATA_DIR = process.platform === 'win32'
? path.join(app.getPath('userData'), 'metadata')
: path.join(os.homedir(), '.config', 'disbox-linux');

if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });

// [REFACTOR] SQLite Setup
const Database = require('better-sqlite3');
const DB_PATH = path.join(METADATA_DIR, 'disbox.db');
let db;

function initDatabase() {
  if (db) {
    try { db.close(); } catch(e) {}
  }
  db = new Database(DB_PATH);

  // [OPTIMIZATION] Enable WAL mode and other performance tweaks
  db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA cache_size = -16000; -- 16MB cache
  PRAGMA journal_size_limit = 67108864; -- 64MB journal limit
  `);

  try {
    // Pastikan tabel files minimal ada dulu (versi lama tanpa hash)
    db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT NOT NULL,
      hash TEXT NOT NULL,
      path TEXT NOT NULL,
      parent_path TEXT NOT NULL,
      name TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      created_at INTEGER,
      message_ids TEXT NOT NULL,
      is_locked INTEGER DEFAULT 0,
      is_starred INTEGER DEFAULT 0,
      PRIMARY KEY (id, hash)
    );
    CREATE TABLE IF NOT EXISTS metadata_sync (
      hash TEXT PRIMARY KEY,
      last_msg_id TEXT,
      snapshot_history TEXT DEFAULT '[]',
      is_dirty INTEGER DEFAULT 0,
      updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (
      hash TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (hash, key)
    );
    CREATE TABLE IF NOT EXISTS cloudsave_entries (
      id TEXT PRIMARY KEY,
      webhook_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      local_path TEXT,
      discord_path TEXT NOT NULL,
      last_synced INTEGER DEFAULT 0,
      last_modified INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS share_settings (
      hash TEXT PRIMARY KEY,
      mode TEXT DEFAULT 'public',
      cf_worker_url TEXT,
      cf_api_token TEXT,
      webhook_url TEXT,
      enabled INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_id TEXT,
      token TEXT NOT NULL,
      permission TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL
    );
    `);

    // Migrations
    try { db.prepare("ALTER TABLE share_settings ADD COLUMN webhook_url TEXT").run(); } catch (_) {}
    const cols = db.prepare("PRAGMA table_info(files)").all();
    const hasHash = cols.some(c => c.name === 'hash');
    const hasIsLocked = cols.some(c => c.name === 'is_locked');
    const hasIsStarred = cols.some(c => c.name === 'is_starred');

    if (!hasHash) {
      db.transaction(() => {
        db.exec(`ALTER TABLE files RENAME TO files_old;`);
        db.exec(`
        CREATE TABLE files (
          id TEXT NOT NULL,
          hash TEXT NOT NULL,
          path TEXT NOT NULL,
          parent_path TEXT NOT NULL,
          name TEXT NOT NULL,
          size INTEGER DEFAULT 0,
          created_at INTEGER,
          message_ids TEXT NOT NULL,
          is_locked INTEGER DEFAULT 0,
          is_starred INTEGER DEFAULT 0,
          PRIMARY KEY (id, hash)
        );
        `);
        db.exec(`DROP TABLE files_old;`);
      })();
    } else {
      if (!hasIsLocked) db.exec(`ALTER TABLE files ADD COLUMN is_locked INTEGER DEFAULT 0`);
      if (!hasIsStarred) db.exec(`ALTER TABLE files ADD COLUMN is_starred INTEGER DEFAULT 0`);
    }

    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hash ON files(hash);
    CREATE INDEX IF NOT EXISTS idx_path ON files(path, hash);
    CREATE INDEX IF NOT EXISTS idx_parent ON files(parent_path, hash);
    `);
  } catch (e) {
    console.error('[migration] Setup database gagal:', e.message);
  }
}

initDatabase();

// [REFACTOR] Automatic Migration from JSON to SQLite
function migrateJsonToSqlite() {
  const filesInDir = fs.readdirSync(METADATA_DIR);
  const jsonFiles = filesInDir.filter(f => f.endsWith('.json') && f !== 'preferences.json' && !f.endsWith('.bak'));

  for (const file of jsonFiles) {
    const hash = file.replace('.json', '');
    const filePath = path.join(METADATA_DIR, file);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const files = Array.isArray(content) ? content : (content.files || []);
      const meta = Array.isArray(content) ? {} : content;

      console.log(`[migration] Migrating ${hash} (${files.length} items)...`);

      db.transaction(() => {
        const upsertSync = db.prepare(`
        INSERT INTO metadata_sync (hash, last_msg_id, snapshot_history, is_dirty, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(hash) DO UPDATE SET
        last_msg_id=excluded.last_msg_id,
        snapshot_history=excluded.snapshot_history,
        is_dirty=excluded.is_dirty,
        updated_at=excluded.updated_at
        `);
        upsertSync.run(
          hash,
          meta.lastMsgId || null,
          JSON.stringify(meta.snapshotHistory || []),
                       meta.isDirty ? 1 : 0,
                       meta.updatedAt || Date.now()
        );

        // [FIX] Insert files dengan hash
        const insertFile = db.prepare(`
        INSERT INTO files (id, hash, path, parent_path, name, size, created_at, message_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id, hash) DO UPDATE SET
        path=excluded.path,
        parent_path=excluded.parent_path,
        name=excluded.name,
        size=excluded.size,
        created_at=excluded.created_at,
        message_ids=excluded.message_ids
        `);

        for (const f of files) {
          const parts = f.path.split('/');
          const name = parts.pop();
          const parent_path = parts.join('/') || '/';
          insertFile.run(
            f.id || Math.random().toString(36).substring(7),
                         hash,
                         f.path,
                         parent_path,
                         name,
                         f.size || 0,
                         f.createdAt || Date.now(),
                         JSON.stringify(f.messageIds || [])
          );
        }
      })();

      console.log(`[migration] Success for ${hash}. Renaming to .bak`);
      fs.renameSync(filePath, filePath + '.bak');
    } catch (e) {
      console.log(`[migration] Failed for ${hash}:`, e.message);
      }
      }
      }

      function migrateLegacyJsonDataToSqlite(hash, data) {
      const isContainer = !Array.isArray(data) && data !== null && typeof data === 'object';
      const filesToSave = isContainer ? (data.files || []) : (data || []);
      const pinHashToSync = isContainer ? data.pinHash : null;
      const shareLinksToSync = isContainer ? (data.shareLinks || []) : [];

      console.log(`[migration] Migrating ${filesToSave.length} files from legacy JSON cloud data...`);

      db.transaction(() => {
      // Hapus data lama untuk hash ini agar sync bersih
      db.prepare('DELETE FROM files WHERE hash = ?').run(hash);
      db.prepare("DELETE FROM settings WHERE hash = ? AND key = 'pin_hash'").run(hash);
      db.prepare('DELETE FROM share_links WHERE hash = ?').run(hash);

      const insertFile = db.prepare(`
      INSERT INTO files (id, hash, path, parent_path, name, size, created_at, message_ids, is_locked, is_starred)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const f of filesToSave) {
      const parts = f.path.split('/');
      const name = parts.pop();
      const parent_path = parts.join('/') || '/';
      insertFile.run(
        f.id || Math.random().toString(36).substring(7),
        hash,
        f.path,
        parent_path,
        name,
        f.size || 0,
        f.createdAt || Date.now(),
        JSON.stringify(f.messageIds || []),
        f.isLocked ? 1 : 0,
        f.isStarred ? 1 : 0
      );
      }

      if (pinHashToSync) {
      db.prepare(`
      INSERT INTO settings (hash, key, value) VALUES (?, 'pin_hash', ?)
      ON CONFLICT(hash, key) DO UPDATE SET value = excluded.value
      `).run(hash, pinHashToSync);
      }

      if (shareLinksToSync.length > 0) {
      const insertLink = db.prepare(`
      INSERT INTO share_links (id, hash, file_path, file_id, token, permission, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of shareLinksToSync) {
        insertLink.run(
          s.id,
          s.hash,
          s.file_path,
          s.file_id || null,
          s.token,
          s.permission,
          s.expires_at || null,
          s.created_at || Date.now()
        );
      }
      }
      })();
      }

      migrateJsonToSqlite();

// Preferensi default
let prefs = {
  closeToTray: false,
  startMinimized: false,
  autoCloseTransfers: true,
  chunksPerMessage: 1 // Default 1 chunk per pesan
};

const PREFS_PATH = path.join(METADATA_DIR, 'preferences.json');
try {
  if (fs.existsSync(PREFS_PATH)) {
    prefs = { ...prefs, ...JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8')) };
  }
} catch (e) { console.error('Gagal memuat preferensi:', e); }

function savePrefs() {
  try {
    fs.writeFileSync(PREFS_PATH, JSON.stringify(prefs, null, 2));
  } catch (e) { console.error('Gagal menyimpan preferensi:', e); }
}

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    backgroundColor: '#0d0d12',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
                                 webPreferences: {
                                   preload: path.join(__dirname, 'preload.js'),
                                 contextIsolation: true,
                                 nodeIntegration: false,
                                 webSecurity: false,
                                 },
                                 show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    if (!prefs.startMinimized) {
      mainWindow.show();
    }
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && prefs.closeToTray) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const iconPaths = [
    path.join(__dirname, '../src/assets/icon.png'),
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, '../icon.png'),
    path.join(__dirname, '../public/icon.png')
  ];

  let trayIcon = null;
  for (const p of iconPaths) {
    if (fs.existsSync(p)) {
      trayIcon = nativeImage.createFromPath(p).resize({ width: 16 });
      break;
    }
  }

  if (!trayIcon) {
    trayIcon = nativeImage.createFromNamedImage('folder', [1, 1, 1]);
  }

  tray = new Tray(trayIcon || nativeImage.createEmpty());
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Disbox', click: () => mainWindow?.show() },
                                             { type: 'separator' },
                                             { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  tray.setToolTip('Disbox — Discord Cloud Storage');
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else mainWindow?.show();
  });
}

app.whenReady().then(() => {
  // ─── disbox-stream Protocol Handler ─────────────────────────────────────────
  protocol.handle('disbox-stream', async (request) => {
    try {
      const url = new URL(request.url);
      const fileId = url.host;
      const webhookUrl = url.searchParams.get('webhook');
      const mimeType = url.searchParams.get('mime') || 'application/octet-stream';
      const totalSize = parseInt(url.searchParams.get('size'));
      const passedChunkSize = parseInt(url.searchParams.get('chunkSize'));
      const messageIds = JSON.parse(url.searchParams.get('messages') || '[]');
      const encryptionKey = getEncryptionKey(webhookUrl);

      if (!webhookUrl || !totalSize || !messageIds.length) {
        return new Response('Invalid stream request', { status: 400 });
      }

      const rangeHeader = request.headers.get('Range');
      let start = 0;
      let end = totalSize - 1;

      if (rangeHeader) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-');
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      }

      const contentLength = end - start + 1;
      // Default to 7.5MB if not passed, but passed value is better
      const chunkSize = passedChunkSize || Math.ceil(totalSize / messageIds.length) || 7.5 * 1024 * 1024;

      let isClosed = false;
      const abortController = new AbortController();

      // Create a readable stream for the response
      const stream = new ReadableStream({
        async start(controller) {
          try {
            let currentOffset = start;

            // Loop through chunks that overlap with the requested range
            for (let i = 0; i < messageIds.length; i++) {
              if (isClosed) break;

              const chunkStart = i * chunkSize;
              const chunkEnd = Math.min(chunkStart + chunkSize, totalSize);

              // Skip chunks before the requested range
              if (chunkEnd <= start) continue;
              // Stop if we've reached the end of the requested range
              if (chunkStart > end) break;

              const item = messageIds[i];
              const msgId = typeof item === 'string' ? item : item.msgId;
              const attachmentIndex = typeof item === 'object' ? (item.index || 0) : 0;

              // Download and decrypt chunk
              const msgRes = await net.fetch(`${webhookUrl}/messages/${msgId}`, { signal: abortController.signal });
              if (isClosed) break;
              if (!msgRes.ok) throw new Error(`Failed to fetch message ${msgId}`);
              
              const msg = JSON.parse(await msgRes.text());
              const attachmentUrl = msg.attachments?.[attachmentIndex]?.url || msg.attachments?.[0]?.url;
              if (!attachmentUrl) throw new Error('No attachment found');

              const chunkRes = await net.fetch(attachmentUrl, { signal: abortController.signal });
              if (isClosed) break;
              
              const encryptedData = Buffer.from(await chunkRes.arrayBuffer());
              const decryptedChunk = decrypt(encryptedData, encryptionKey);

              // Calculate slice within this chunk
              const sliceStart = Math.max(0, currentOffset - chunkStart);
              const sliceEnd = Math.min(decryptedChunk.length, end - chunkStart + 1);

              if (sliceStart < decryptedChunk.length && !isClosed) {
                const dataToPush = decryptedChunk.slice(sliceStart, sliceEnd);
                if (dataToPush.length > 0) {
                  controller.enqueue(dataToPush);
                  currentOffset += dataToPush.length;
                }
              }

              if (currentOffset > end) break;
            }
            
            if (!isClosed) {
              isClosed = true;
              controller.close();
            }
          } catch (e) {
            if (!isClosed) {
              isClosed = true;
              if (e.name !== 'AbortError') {
                console.error('[stream] Stream error:', e.message);
                try { controller.error(e); } catch (_) {}
              } else {
                try { controller.close(); } catch (_) {}
              }
            }
          }
        },
        cancel() {
          isClosed = true;
          abortController.abort();
        }
      });

      const status = rangeHeader ? 206 : 200;
      const headers = {
        'Content-Type': mimeType,
        'Content-Length': contentLength.toString(),
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*',
      };

      if (rangeHeader) {
        headers['Content-Range'] = `bytes ${start}-${end}/${totalSize}`;
      }

      return new Response(stream, { status, headers });
    } catch (e) {
      console.error('[stream] Fatal error:', e.message);
      return new Response(e.message, { status: 500 });
    }
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Methods': ['GET, POST, PUT, DELETE, PATCH, OPTIONS'],
        'Access-Control-Allow-Headers': ['*'],
      },
    });
  });

  createWindow();
  createTray();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow?.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && (!prefs.closeToTray || isQuitting)) {
    app.quit();
  }
});

ipcMain.handle('get-prefs', () => prefs);
ipcMain.handle('set-prefs', (_, newPrefs) => {
  prefs = { ...prefs, ...newPrefs };
  savePrefs();
  return prefs;
});

// ─── Simpan webhookUrl dari renderer untuk dipakai saat quit ─────────────────
let activeWebhookUrl = null;
let activeWebhookHash = null;

ipcMain.on('set-active-webhook', (_, webhookUrl, hash) => {
  activeWebhookUrl = webhookUrl;
  activeWebhookHash = hash;
  console.log('[metadata] Active webhook set:', hash?.slice(-8));
});

// ─── Flush metadata ke Discord sebelum quit ───────────────────────────────────
app.on('before-quit', (event) => {
  if (isQuitting && !metadataUploadTimer) return;

  if (!activeWebhookUrl || !activeWebhookHash || !metadataUploadTimer) {
    isQuitting = true;
    return;
  }

  clearTimeout(metadataUploadTimer);
  metadataUploadTimer = null;

  event.preventDefault();
  isQuitting = true;
  console.log(`[metadata] before-quit: menyelesaikan upload yang pending...`);

  uploadMetadataToDiscord(activeWebhookHash)
  .then(() => {
    console.log('[metadata] Final upload complete, quitting.');
    app.quit();
  })
  .catch(e => {
    console.error('[metadata] Final upload failed:', e.message);
    app.quit();
  });
});

ipcMain.handle('flush-metadata', async (_, webhookUrl, hash) => {
  activeWebhookUrl = webhookUrl;
  activeWebhookHash = hash;
  return true;
});

function buildMetadataFormData(contentBuffer, filename) {
  const boundary = '----DisboxFlushBoundary';
  const CRLF = Buffer.from('\r\n');
  const parts = [
    Buffer.from('--' + boundary + '\r\n'),
    Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`),
    Buffer.from('Content-Type: application/json\r\n'),
    CRLF,
    contentBuffer,
    CRLF,
    Buffer.from('--' + boundary + '--\r\n'),
  ];
  return Buffer.concat(parts);
}

ipcMain.handle('net-fetch', async (_, url, options = {}) => {
  const transferId = options.transferId;
  const controller = new AbortController();
  if (transferId) abortControllers.set(transferId, controller);

  try {
    const response = await net.fetch(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 Disbox/2.0',
        ...(options.headers || {}),
      },
      body: options.body || undefined,
      signal: controller.signal,
    });
    const body = await response.text();
    return { status: response.status, body, ok: response.ok };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { status: 0, body: '', ok: false, error: 'ABORTED' };
    }
    console.error('[net-fetch] error:', url, e.message);
    return { status: 0, body: '', ok: false, error: e.message };
  } finally {
    if (transferId) abortControllers.delete(transferId);
  }
});

ipcMain.handle('proxy-download', async (_, url, transferId = null) => {
  const controller = new AbortController();
  if (transferId) abortControllers.set(transferId, controller);

  try {
    const response = await net.fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Disbox/2.0' },
      signal: controller.signal,
    });
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('ABORTED');
    throw new Error(`Download failed: ${e.message}`);
  } finally {
    if (transferId) abortControllers.delete(transferId);
  }
});

ipcMain.handle('dialog-confirm', async (_, { title, message, detail, type = 'question' }) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type,
    buttons: ['Cancel', 'Confirm'],
    defaultId: 1,
      title: title || 'Confirmation',
      message: message || 'Are you sure?',
      detail: detail || '',
      cancelId: 0,
      noLink: true
  });
  return result.response === 1;
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized());

// ─── Cloud Save Feature ──────────────────────────────────────────────────────
const cloudWatchers = new Map();

function showSyncNotification(name, type) {
  const title = 'Disbox Cloud Save';
  const body = type === 'upload'
  ? `${name} synced to Disbox`
  : `${name} updated from Disbox`;

  new Notification({ title, body }).show();
}

ipcMain.handle('cloudsave-get-all', async (_, hash) => {
  try {
    return db.prepare('SELECT * FROM cloudsave_entries WHERE webhook_hash = ?').all(hash);
  } catch (e) {
    console.error('[cloudsave] get-all error:', e.message);
    return [];
  }
});

ipcMain.handle('cloudsave-get-status', async (_, id) => {
  try {
    const entry = db.prepare('SELECT * FROM cloudsave_entries WHERE id = ?').get(id);
    if (!entry) return null;

    // Normalize path for query
    const searchPath = entry.discord_path.replace(/^\/+/, '').replace(/\/+$/, '');
    const fileCount = db.prepare('SELECT COUNT(*) as count FROM files WHERE hash = ? AND (path LIKE ? OR path LIKE ? OR path LIKE ? OR path LIKE ?)')
    .get(entry.webhook_hash, searchPath + '/%', searchPath + '%', '/' + searchPath + '/%', '/' + searchPath + '%').count;

    return {
      id: entry.id,
      localExists: entry.local_path ? fs.existsSync(entry.local_path) : false,
               lastSynced: entry.last_synced,
               lastModified: entry.last_modified,
               fileCount
    };
  } catch (e) {
    console.error('[cloudsave] get-status error:', e.message);
    return null;
  }
});

ipcMain.handle('cloudsave-add', async (_, hash, entry) => {
  try {
    const id = cryptoNode.randomUUID();
    // Normalize discord_path: no leading, yes trailing
    const discordPath = entry.discord_path.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
    db.prepare(`
    INSERT INTO cloudsave_entries (id, webhook_hash, name, local_path, discord_path, last_synced, last_modified)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, hash, entry.name, entry.local_path, discordPath, 0, 0);

    if (entry.local_path) setupCloudWatcher(id, entry.local_path, hash);
    return id;
  } catch (e) {
    console.error('[cloudsave] add error:', e.message);
    return null;
  }
});

ipcMain.handle('cloudsave-update', async (_, id, fields) => {
  try {
    const keys = Object.keys(fields);
    if (fields.discord_path) {
      fields.discord_path = fields.discord_path.replace(/^\/+/, '').replace(/\/+$/, '') + '/';
    }
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    db.prepare(`UPDATE cloudsave_entries SET ${setClause} WHERE id = ?`).run(...values, id);

    const entry = db.prepare('SELECT * FROM cloudsave_entries WHERE id = ?').get(id);
    if (fields.local_path) {
      setupCloudWatcher(id, fields.local_path, entry.webhook_hash);
    }
    return true;
  } catch (e) {
    console.error('[cloudsave] update error:', e.message);
    return false;
  }
});

ipcMain.handle('cloudsave-remove', async (_, id) => {
  try {
    db.prepare('DELETE FROM cloudsave_entries WHERE id = ?').run(id);
    if (cloudWatchers.has(id)) {
      cloudWatchers.get(id).close();
      cloudWatchers.delete(id);
    }
    return true;
  } catch (e) {
    console.error('[cloudsave] remove error:', e.message);
    return false;
  }
});

async function downloadDiscordFile(webhookUrl, file, destPath) {
  try {
    const encryptionKey = getEncryptionKey(webhookUrl);
    const chunks = [];
    for (const msgId of file.messageIds) {
      const response = await net.fetch(`${webhookUrl}/messages/${msgId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 Disbox/2.0' }
      });
      if (!response.ok) throw new Error(`Failed to get message ${msgId}`);
      const msgData = JSON.parse(await response.text());
      const attachmentUrl = msgData.attachments[0].url;

      const fileRes = await net.fetch(attachmentUrl);
      if (!fileRes.ok) throw new Error(`Failed to download attachment from ${attachmentUrl}`);
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      const decrypted = decrypt(buffer, encryptionKey);
      chunks.push(decrypted);
    }
    const fullBuffer = Buffer.concat(chunks);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, fullBuffer);
    return true;
  } catch (e) {
    console.error(`[cloudsave] Error downloading ${file.path}:`, e.message);
    return false;
  }
}

ipcMain.handle('cloudsave-export-zip', async (_, id) => {
  let tempDir = null;
  try {
    const entry = db.prepare('SELECT * FROM cloudsave_entries WHERE id = ?').get(id);
    if (!entry) return { ok: false, reason: 'entry_not_found' };

    const searchPath = entry.discord_path.replace(/^\/+/, '').replace(/\/+$/, '');
    const files = db.prepare('SELECT * FROM files WHERE hash = ? AND (path LIKE ? OR path LIKE ? OR path LIKE ? OR path LIKE ?)')
    .all(entry.webhook_hash, searchPath + '/%', searchPath + '%', '/' + searchPath + '/%', '/' + searchPath + '%');

    if (files.length === 0) {
      console.log(`[cloudsave] No files found for hash ${entry.webhook_hash.slice(-8)} and path ${searchPath}`);
      return { ok: false, reason: 'no_files_in_cloud' };
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${entry.name}_export.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    });

    if (result.canceled) return { ok: false, reason: 'cancelled' };

    tempDir = path.join(os.tmpdir(), `disbox_export_${id}_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const webhookRow = db.prepare('SELECT value FROM settings WHERE hash = ? AND key = ?').get(entry.webhook_hash, 'webhook_url');
    const webhookUrl = webhookRow?.value || activeWebhookUrl;

    for (const file of files) {
      file.messageIds = JSON.parse(file.message_ids);
      // Strip both possible path starts
      let relativePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
      relativePath = relativePath.replace(searchPath, '').replace(/^\/+/, '');

      const destPath = path.join(tempDir, relativePath);
      await downloadDiscordFile(webhookUrl, file, destPath);
    }

    const output = fs.createWriteStream(result.filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    await new Promise((resolve, reject) => {
      output.on('close', () => resolve(true));
      archive.on('error', (err) => reject(err));
      archive.pipe(output);
      archive.directory(tempDir, false);
      archive.finalize();
    });

    return { ok: true };
  } catch (e) {
    console.error('[cloudsave] export-zip error:', e.message);
    return { ok: false, reason: e.message };
  } finally {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
});

ipcMain.handle('cloudsave-restore', async (_, { id, force }) => {
  try {
    const entry = db.prepare('SELECT * FROM cloudsave_entries WHERE id = ?').get(id);
    if (!entry) return { ok: false, reason: 'entry_not_found' };

    const searchPath = entry.discord_path.replace(/^\/+/, '').replace(/\/+$/, '');
    const files = db.prepare('SELECT * FROM files WHERE hash = ? AND (path LIKE ? OR path LIKE ? OR path LIKE ? OR path LIKE ?)')
    .all(entry.webhook_hash, searchPath + '/%', searchPath + '%', '/' + searchPath + '/%', '/' + searchPath + '%');

    if (files.length === 0) {
      console.log(`[cloudsave] No files found for restore: ${searchPath}`);
      return { ok: false, reason: 'no_files_in_cloud' };
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled) return { ok: false, reason: 'cancelled' };
    const chosenPath = result.filePaths[0];

    if (fs.readdirSync(chosenPath).length > 0 && !force) {
      return { ok: false, reason: 'folder_not_empty' };
    }

    const webhookRow = db.prepare('SELECT value FROM settings WHERE hash = ? AND key = ?').get(entry.webhook_hash, 'webhook_url');
    const webhookUrl = webhookRow?.value || activeWebhookUrl;

    for (const file of files) {
      file.messageIds = JSON.parse(file.message_ids);
      let relativePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
      relativePath = relativePath.replace(searchPath, '').replace(/^\/+/, '');

      const destPath = path.join(chosenPath, relativePath);
      await downloadDiscordFile(webhookUrl, file, destPath);
    }

    const now = Date.now();
    db.prepare('UPDATE cloudsave_entries SET local_path = ?, last_synced = ? WHERE id = ?')
    .run(chosenPath, now, id);

    setupCloudWatcher(id, chosenPath, entry.webhook_hash);

    return { ok: true, localPath: chosenPath };
  } catch (e) {
    console.error('[cloudsave] restore error:', e.message);
    return { ok: false, reason: e.message };
  }
});

ipcMain.handle('cloudsave-sync-entry', async (_, id) => {
  return triggerCloudSync(id);
});

ipcMain.handle('cloudsave-choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  });
  return result.canceled ? null : result.filePaths[0];
});

function setupCloudWatcher(id, localPath, hash) {
  if (cloudWatchers.has(id)) {
    cloudWatchers.get(id).close();
  }

  if (!localPath || !fs.existsSync(localPath)) return;

  const watcher = chokidar.watch(localPath, {
    persistent: true,
    ignoreInitial: true,
    depth: 10
  });

  watcher.on('add', (filePath) => handleLocalChange(id, filePath, 'add'));
  watcher.on('change', (filePath) => handleLocalChange(id, filePath, 'change'));
  watcher.on('unlink', (filePath) => handleLocalDelete(id, filePath));
  watcher.on('unlinkDir', (dirPath) => handleLocalDelete(id, dirPath));
  watcher.on('error', (error) => console.error(`[cloudsave] Watcher error for ${id}:`, error));

  cloudWatchers.set(id, watcher);
}

async function handleLocalChange(id, filePath, type) {
  try {
    const entry = db.prepare('SELECT * FROM cloudsave_entries WHERE id = ?').get(id);
    if (!entry) return;

    const relativePath = path.relative(entry.local_path, filePath).replace(/\\/g, '/');
    const discordPath = (entry.discord_path + '/' + relativePath).replace(/\/+/g, '/');

    console.log(`[cloudsave] Local ${type}: ${filePath} -> ${discordPath}`);

    // Trigger upload via renderer (keeping existing upload flow for simplicity/encryption)
    mainWindow?.webContents.send('cloudsave-do-upload-file', { id, filePath, discordPath });

    // Wait for response
    const success = await new Promise(resolve => {
      ipcMain.once(`cloudsave-upload-file-result-${id}-${discordPath}`, (_, res) => resolve(res));
      setTimeout(() => resolve(false), 60000);
    });

    if (success) {
      const now = Date.now();
      db.prepare('UPDATE cloudsave_entries SET last_modified = ?, last_synced = ? WHERE id = ?')
      .run(now, now, id);
    }
  } catch (e) {
    console.error('[cloudsave] handleLocalChange error:', e.message);
  }
}

async function handleLocalDelete(id, filePath) {
  try {
    const entry = db.prepare('SELECT * FROM cloudsave_entries WHERE id = ?').get(id);
    if (!entry) return;

    // Set local_path = null and notify
    db.prepare('UPDATE cloudsave_entries SET local_path = NULL WHERE id = ?').run(id);
    if (cloudWatchers.has(id)) {
      cloudWatchers.get(id).close();
      cloudWatchers.delete(id);
    }

    mainWindow?.webContents.send('cloudsave-local-missing', { id });

    tray?.displayBalloon({
      iconType: 'warning',
      title: 'Disbox Cloud Save',
      content: `${entry.name} local folder missing, data still safe in Disbox`
    });

    // For Linux/macOS where displayBalloon might not work
    new Notification({
      title: 'Disbox Cloud Save',
      body: `${entry.name} local folder missing, data still safe in Disbox`
    }).show();

  } catch (e) {
    console.error('[cloudsave] handleLocalDelete error:', e.message);
  }
}

async function triggerCloudSync(id) {
  try {
    const entry = db.prepare('SELECT * FROM cloudsave_entries WHERE id = ?').get(id);
    if (!entry) return;

    // Check if localPath exists
    if (!entry.local_path || !fs.existsSync(entry.local_path)) {
      return; // Wait for user to restore
    }

    mainWindow?.webContents.send('cloudsave-sync-status', { id, status: 'syncing' });

    // Get local last modified
    let localLastModified = 0;
    const getLatestMtime = (dir) => {
      let max = fs.statSync(dir).mtimeMs;
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const fstats = fs.statSync(fullPath);
        if (fstats.isDirectory()) {
          const childMax = getLatestMtime(fullPath);
          if (childMax > max) max = childMax;
        } else {
          if (fstats.mtimeMs > max) max = fstats.mtimeMs;
        }
      }
      return max;
    };
    localLastModified = getLatestMtime(entry.local_path);

    // Get Discord last modified from metadata_sync
    const metaSync = db.prepare('SELECT updated_at FROM metadata_sync WHERE hash = ?').get(entry.webhook_hash);
    const discordLastModified = metaSync ? metaSync.updated_at : 0;

    if (localLastModified > entry.last_synced) {
      // Local is newer -> Upload
      console.log(`[cloudsave] Syncing ${entry.name}: Local is newer.`);
      const success = await uploadCloudFolder(entry);
      if (success) {
        const now = Date.now();
        db.prepare('UPDATE cloudsave_entries SET last_synced = ?, last_modified = ? WHERE id = ?')
        .run(now, localLastModified, id);
        mainWindow?.webContents.send('cloudsave-sync-status', { id, status: 'synced', lastSynced: now });
      } else {
        mainWindow?.webContents.send('cloudsave-sync-status', { id, status: 'error' });
      }
    } else if (discordLastModified > entry.last_synced) {
      // Discord is newer -> Download
      console.log(`[cloudsave] Syncing ${entry.name}: Discord is newer.`);
      const searchPath = entry.discord_path.replace(/^\/+/, '').replace(/\/+$/, '');
      const files = db.prepare('SELECT * FROM files WHERE hash = ? AND (path LIKE ? OR path LIKE ?)')
      .all(entry.webhook_hash, searchPath + '/%', searchPath + '%');

      const webhookRow = db.prepare('SELECT value FROM settings WHERE hash = ? AND key = ?').get(entry.webhook_hash, 'webhook_url');
      const webhookUrl = webhookRow?.value || activeWebhookUrl;

      for (const file of files) {
        file.messageIds = JSON.parse(file.message_ids);
        let relativePath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
        relativePath = relativePath.replace(searchPath, '').replace(/^\/+/, '');

        const destPath = path.join(entry.local_path, relativePath);
        await downloadDiscordFile(webhookUrl, file, destPath);
      }

      const now = Date.now();
      db.prepare('UPDATE cloudsave_entries SET last_synced = ? WHERE id = ?').run(now, id);
      mainWindow?.webContents.send('cloudsave-sync-status', { id, status: 'synced', lastSynced: now });
    } else {
      mainWindow?.webContents.send('cloudsave-sync-status', { id, status: 'synced' });
    }
  } catch (e) {
    console.error('[cloudsave] sync error:', e.message);
    mainWindow?.webContents.send('cloudsave-sync-status', { id, status: 'error' });
  }
}

async function uploadCloudFolder(entry) {
  return new Promise((resolve) => {
    mainWindow?.webContents.send('cloudsave-do-upload', entry);
    ipcMain.once(`cloudsave-upload-result-${entry.id}`, (_, success) => resolve(success));
    setTimeout(() => resolve(false), 300000);
  });
}

// Background polling every 5 minutes
setInterval(() => {
  if (activeWebhookHash) {
    const entries = db.prepare('SELECT id FROM cloudsave_entries WHERE webhook_hash = ?').all(activeWebhookHash);
    for (const e of entries) {
      triggerCloudSync(e.id);
    }
  }
}, 300000);


// ─── Share & Privacy IPC Handlers ────────────────────────────────────────────

ipcMain.handle('share-get-settings', async (_, hash) => {
  try {
    const row = db.prepare('SELECT * FROM share_settings WHERE hash = ?').get(hash);
    return row || { hash, mode: 'public', cf_worker_url: PUBLIC_WORKER_URL, enabled: 1 };
  } catch (e) {
    console.error('[share] get-settings error:', e.message);
    return { hash, mode: 'public', cf_worker_url: PUBLIC_WORKER_URL, enabled: 1 };
  }
});

ipcMain.handle('share-save-settings', async (_, hash, settings) => {
  try {
    db.prepare(`
    INSERT INTO share_settings (hash, mode, cf_worker_url, cf_api_token, webhook_url, enabled)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(hash) DO UPDATE SET
    mode = excluded.mode,
    cf_worker_url = excluded.cf_worker_url,
    cf_api_token = excluded.cf_api_token,
    webhook_url = excluded.webhook_url,
    enabled = excluded.enabled
    `).run(hash, settings.mode || 'public', settings.cf_worker_url || null, settings.cf_api_token || null, settings.webhook_url || null, settings.enabled ? 1 : 0);
    return true;
  } catch (e) {
    console.error('[share] save-settings error:', e.message);
    return false;
  }
});

ipcMain.handle('share-deploy-worker', async (_, { apiToken }) => {
  console.log('[share] Starting worker deployment...');
  try {
    // 1. Verify Token
    const verifyRes = await net.fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' }
    });
    const verifyData = JSON.parse(await verifyRes.text());
    if (!verifyRes.ok || !verifyData.success) {
      console.error('[share] Token verification failed:', verifyData);
      return { ok: false, reason: 'invalid_token', message: 'API Token tidak valid atau tidak memiliki izin yang cukup.' };
    }

    // 2. Get Account ID
    const accountsRes = await net.fetch('https://api.cloudflare.com/client/v4/accounts', {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    const accountsData = JSON.parse(await accountsRes.text());
    if (!accountsRes.ok || !accountsData.success || !accountsData.result?.[0]) {
      console.error('[share] Could not fetch accounts:', accountsData);
      return { ok: false, reason: 'no_account', message: 'Gagal mengambil ID akun Cloudflare.' };
    }

    // Gunakan account pertama (paling umum untuk user personal)
    const accountId = accountsData.result[0].id;
    const accountName = accountsData.result[0].name;
    console.log(`[share] Using Cloudflare account: ${accountName} (${accountId})`);

    // 3. Create/Get KV Namespace (Must be done BEFORE script upload for binding)
    console.log('[share] Setting up KV namespace...');
    let kvNamespaceId = null;

    const listKvRes = await net.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
      { headers: { 'Authorization': `Bearer ${apiToken}` } }
    );
    const listKvData = JSON.parse(await listKvRes.text());
    if (listKvRes.ok && listKvData.success) {
      const existing = listKvData.result.find(ns => ns.title === 'disbox_share_kv');
      if (existing) kvNamespaceId = existing.id;
    }

    if (!kvNamespaceId) {
      console.log('[share] Creating new KV namespace: disbox_share_kv');
      const kvRes = await net.fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'disbox_share_kv' })
        }
      );
      const kvData = JSON.parse(await kvRes.text());
      if (kvRes.ok && kvData.success) {
        kvNamespaceId = kvData.result.id;
      } else {
        console.warn('[share] KV creation failed:', kvData);
        return { ok: false, reason: 'kv_failed', message: 'Gagal membuat KV Namespace. Pastikan token punya izin KV.' };
      }
    }

    // 4. Deploy Script Code with Bindings (Multipart)
    const uniqueId = cryptoNode.randomBytes(3).toString('hex');
    const scriptName = `disbox-worker-${uniqueId}`;
    console.log(`[share] Deploying script: ${scriptName} with KV binding...`);

    const boundary = '----DisboxWorkerBoundary' + uniqueId;
    const metadata = {
      body_part: 'script', // PENTING: Untuk Service Worker (non-module)
bindings: [
  { type: 'kv_namespace', name: 'SHARE_KV', namespace_id: kvNamespaceId }
]
    };

    const workerCode = getDisboxWorkerCode();

    // Construct Multipart Body secara presisi
    const bodyParts = [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="metadata"\r\n`,
      `Content-Type: application/json\r\n\r\n`,
      JSON.stringify(metadata) + `\r\n`,
               `--${boundary}\r\n`,
               `Content-Disposition: form-data; name="script"\r\n`,
               `Content-Type: application/javascript\r\n\r\n`,
               workerCode + `\r\n`,
               `--${boundary}--\r\n`
    ];
    const multipartBody = bodyParts.join('');

    const deployRes = await net.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body: multipartBody
      }
    );

    const deployData = JSON.parse(await deployRes.text());
    if (!deployRes.ok || !deployData.success) {
      console.error('[share] Deployment failed:', deployData);
      const errMsg = deployData.errors?.[0]?.message || 'Gagal deploy Worker.';
      return { ok: false, reason: 'deploy_failed', message: errMsg };
    }

    // Langkah Tambahan: Explicit Binding (Fallback untuk memastikan KV terikat)
    console.log('[share] Applying explicit KV binding...');
    await net.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/bindings`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ bindings: [{ type: 'kv_namespace', name: 'SHARE_KV', namespace_id: kvNamespaceId }] })
      }
    ).catch(e => console.warn('[share] Explicit binding failed:', e.message));

    // 5. Enable workers.dev subdomain for this script
    console.log(`[share] Enabling workers.dev subdomain for ${scriptName}...`);
    await net.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/subdomain`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true })
      }
    ).catch(e => console.warn('[share] Could not enable subdomain:', e.message));

    // 6. Get Subdomain & Worker URL
    console.log('[share] Fetching worker subdomain...');
    const subdomainRes = await net.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`,
      { headers: { 'Authorization': `Bearer ${apiToken}` } }
    );
    const subdomainData = JSON.parse(await subdomainRes.text());

    if (!subdomainRes.ok || !subdomainData.success || !subdomainData.result?.subdomain) {
      return { ok: false, reason: 'no_subdomain', message: 'Subdomain Workers belum diset di Cloudflare.' };
    }

    const subdomain = subdomainData.result.subdomain;
    const workerUrl = `https://${scriptName}.${subdomain}.workers.dev`;
    console.log('[share] Worker URL:', workerUrl);

    // 7. Set Secrets
    console.log('[share] Setting DISBOX_API_KEY secret...');
    const userApiKey = cryptoNode.randomBytes(24).toString('hex');
    const secretRes = await net.fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}/secrets`,
      {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'DISBOX_API_KEY', text: userApiKey, type: 'secret_text' })
      }
    );
    if (!secretRes.ok) console.warn('[share] Secret set failed:', await secretRes.text());

    console.log('[share] Worker deployment successful!');
    return { ok: true, workerUrl, userApiKey };
  } catch (e) {
    console.error('[share] Fatal deployment error:', e);
    return { ok: false, reason: 'fatal_error', message: e.message };
  }
});

ipcMain.handle('share-get-links', async (_, hash) => {
  try {
    return db.prepare('SELECT * FROM share_links WHERE hash = ? ORDER BY created_at DESC').all(hash);
  } catch (e) {
    console.error('[share] get-links error:', e.message);
    return [];
  }
});

function getApiKey(settings, cfWorkerUrl) {
  if (settings?.mode === 'private' && settings?.cf_api_token) {
    return settings.cf_api_token.trim();
  }

  const normalize = (u) => u?.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '').trim();
  const target = normalize(cfWorkerUrl);

  console.log(`[share] Mapping key for worker: ${cfWorkerUrl} (normalized: ${target})`);

  for (const [url, key] of Object.entries(PUBLIC_API_KEYS)) {
    if (normalize(url) === target) {
      console.log(`[share] Found match! Using key: ${key.slice(0, 8)}...`);
      return key.trim();
    }
  }

  console.log(`[share] No specific mapping found, using default key: ${DEFAULT_PUBLIC_API_KEY.slice(0, 8)}...`);
  return DEFAULT_PUBLIC_API_KEY.trim();
}

ipcMain.handle('share-create-link', async (_, hash, { filePath, fileId, permission, expiresAt }) => {
  try {
    const token = cryptoNode.randomUUID().replace(/-/g, '');
    const settings = db.prepare('SELECT * FROM share_settings WHERE hash = ?').get(hash);

    if (!activeWebhookUrl && settings?.webhook_url) {
      activeWebhookUrl = settings.webhook_url;
    }

    if (activeWebhookUrl) {
      activeWebhookUrl = activeWebhookUrl.split('?')[0].replace(/\/+$/, '');
    }

    let cfWorkerUrl = settings?.cf_worker_url || PUBLIC_WORKER_URL;
    if (!cfWorkerUrl || cfWorkerUrl.includes('.xxx.') || !cfWorkerUrl.startsWith('http')) {
      return { ok: false, reason: 'invalid_worker_url', message: 'URL Cloudflare Worker belum diset dengan benar. Silakan cek tab Settings.' };
    }
    cfWorkerUrl = cfWorkerUrl.replace(/\/+$/, '');

    let apiKey = getApiKey(settings, cfWorkerUrl);

    console.log(`[share] PREPARING REQUEST:`);
    console.log(`[share] > Worker: ${cfWorkerUrl}`);
    console.log(`[share] > API Key (first 8): ${apiKey?.slice(0, 8)}...`);
    console.log(`[share] > Mode: ${settings?.mode || 'public'}`);

    // Ambil messageIds dari database (fetching attachment URLs dilimpahkan ke CF Worker)
    let messageIds = [];
    try {
      const fileRow = fileId
      ? db.prepare('SELECT message_ids FROM files WHERE id = ? AND hash = ?').get(fileId, hash)
      : db.prepare('SELECT message_ids FROM files WHERE path = ? AND hash = ?').get(filePath, hash);

      if (fileRow) {
        const rawIds = JSON.parse(fileRow.message_ids || '[]');
        console.log(`[share] > Total chunks to register: ${rawIds.length}`);

        for (let i = 0; i < rawIds.length; i++) {
          const item = rawIds[i];
          const msgId = typeof item === 'string' ? item : item.msgId;
          messageIds.push({ msgId, attachmentUrl: null });
        }
      }
    } catch (e) { console.warn('[share] Could not fetch messageIds:', e.message); }

    // Derive encryption key dari webhook URL dan encode ke base64
    // Disimpan di KV agar browser bisa decrypt chunks saat download
    let encryptionKeyB64 = null;
    try {
      const encKey = getEncryptionKey(activeWebhookUrl);
      if (encKey) encryptionKeyB64 = encKey.toString('base64');
    } catch (e) { console.warn('[share] Could not get encryption key:', e.message); }

    console.log(`[share] > All messageIds prepared. Sending to Cloudflare...`);
    console.log(`[share] > Target: ${cfWorkerUrl}/share/create`);
    console.log(`[share] > Key: ${apiKey.trim().slice(0, 8)}...`);

    const headers = {
      'Content-Type': 'application/json',
      'X-Disbox-Key': apiKey.trim()
    };

    const res = await net.fetch(`${cfWorkerUrl}/share/create`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ token, fileId, filePath, permission, expiresAt, webhookHash: hash, messageIds, encryptionKeyB64, webhookUrl: activeWebhookUrl })
    }).catch(e => {
      if (e.message.includes('ERR_SSL') || e.message.includes('ERR_CERT')) {
        throw new Error('SSL Cloudflare belum siap. Tunggu 1-2 menit agar sertifikat aktif.');
      }
      if (e.message.includes('ERR_NAME_NOT_RESOLVED')) {
        throw new Error('Domain Worker tidak ditemukan. Pastikan URL di Settings sudah benar.');
      }
      throw e;
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[share] CF Worker create failed:', res.status, body);
      return { ok: false, reason: 'worker_error' };
    }

    const id = cryptoNode.randomUUID();
    db.prepare(`
    INSERT INTO share_links (id, hash, file_path, file_id, token, permission, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, hash, filePath, fileId || null, token, permission, expiresAt || null, Date.now());

    markMetadataDirty(hash);

    return { ok: true, link: `${cfWorkerUrl}/share/${token}`, token, id };
  } catch (e) {
    console.error('[share] create-link error:', e.message);
    return { ok: false, reason: e.message };
  }
});

ipcMain.handle('share-revoke-link', async (_, hash, { id, token }) => {
  try {
    const settings = db.prepare('SELECT * FROM share_settings WHERE hash = ?').get(hash);
    const cfWorkerUrl = (settings?.cf_worker_url || PUBLIC_WORKER_URL).replace(/\/+$/, '');
    let apiKey = getApiKey(settings, cfWorkerUrl);

    await net.fetch(`${cfWorkerUrl}/share/revoke/${token}`, {
      method: 'DELETE',
      headers: { 'X-Disbox-Key': apiKey }
    }).catch(e => console.warn('[share] CF revoke failed:', e.message));
    db.prepare('DELETE FROM share_links WHERE id = ? AND hash = ?').run(id, hash);

    markMetadataDirty(hash);

    return true;
  } catch (e) {
    console.error('[share] revoke-link error:', e.message);
    return false;
  }
});

ipcMain.handle('share-revoke-all', async (_, hash) => {
  try {
    const settings = db.prepare('SELECT * FROM share_settings WHERE hash = ?').get(hash);
    const cfWorkerUrl = (settings?.cf_worker_url || PUBLIC_WORKER_URL).replace(/\/+$/, '');
    let apiKey = getApiKey(settings, cfWorkerUrl);

    await net.fetch(`${cfWorkerUrl}/share/revoke-all/${hash}`, {
      method: 'DELETE',
      headers: { 'X-Disbox-Key': apiKey }
    }).catch(e => console.warn('[share] CF revoke-all failed:', e.message));
    db.prepare('DELETE FROM share_links WHERE hash = ?').run(hash);

    markMetadataDirty(hash);

    return true;
  } catch (e) {
    console.error('[share] revoke-all error:', e.message);
    return false;
  }
});

ipcMain.handle('share-open-cf-token-page', async () => {
  const url = 'https://dash.cloudflare.com/profile/api-tokens/create?permissionGroupKeys=workers_scripts:edit,workers_kv_storage:edit,account_settings:read&name=Disbox+Worker';
  shell.openExternal(url);
  return true;
});

function getDisboxWorkerCode() {
  // Baca worker code dari file terpisah — menghindari masalah escaping string
  const workerPath = require('path').join(__dirname, 'disbox-worker.js');
  return require('fs').readFileSync(workerPath, 'utf8');
}
ipcMain.handle('dialog-open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog-save-file', async (_, filename) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: filename });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('read-file', async (_, filePath) => {
  const stats = fs.statSync(filePath);
  const MAX_READ = 512 * 1024 * 1024;
  if (stats.size > MAX_READ) {
    throw new Error(`File terlalu besar (${(stats.size / 1024 / 1024).toFixed(0)} MB)`);
  }
  const buffer = fs.readFileSync(filePath);
  return {
    data: buffer.toString('base64'),
               name: path.basename(filePath),
               size: stats.size,
  };
});

ipcMain.handle('stat-file', async (_, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return { size: stats.size, name: path.basename(filePath) };
  } catch (e) {
    return { size: 0, name: path.basename(filePath) };
  }
});

ipcMain.handle('save-file', async (_, { savePath, data }) => {
  try {
    const buffer = (typeof data === 'string') ? Buffer.from(data, 'base64') : Buffer.from(data);
    await fs.promises.writeFile(savePath, buffer);
    return true;
  } catch (e) {
    console.error('[save-file] error:', e.message);
    throw e;
  }
});

ipcMain.handle('open-path', async (_, filePath) => shell.openPath(filePath));
ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('list-directory', async (_, dirPath) => {
  try {
    const files = fs.readdirSync(dirPath);
    const result = [];
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stats = fs.statSync(fullPath);
      result.push({
        name: file,
        path: fullPath,
        isDirectory: stats.isDirectory(),
                  size: stats.size,
                  mtime: stats.mtimeMs
      });
    }
    return result;
  } catch (e) {
    console.error('[list-directory] error:', e.message);
    return [];
  }
});

function findLatestMetadataFile(hash) {
  try {
    const finalPath = path.join(METADATA_DIR, `${hash}.json`);
    if (fs.existsSync(finalPath)) {
      const stats = fs.statSync(finalPath);
      return { file: `${hash}.json`, mtime: stats.mtimeMs };
    }
    return null;
  } catch { return null; }
}

fs.watch(METADATA_DIR, (eventType, filename) => {
  if (filename && filename.endsWith('.json')) {
    const hash = filename.split('.')[0];
    const filePath = path.join(METADATA_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf8').trim();
        if (raw && raw !== '[]' && raw !== 'null') {
          mainWindow?.webContents.send('metadata-external-change', hash);
        }
      } catch (_) {}
    }
  }
});

ipcMain.handle('get-latest-metadata-msgid', async (_, hash, webhookUrl) => {
  console.log(`[metadata] Discovery requested | hash: ${hash?.slice(-8)}`);
  try {
    const meta = db.prepare('SELECT last_msg_id, snapshot_history, is_dirty FROM metadata_sync WHERE hash = ?').get(hash);
    
    let localMsgId = meta?.last_msg_id || null;
    let snapshotHistory = JSON.parse(meta?.snapshot_history || '[]');
    
    if (meta?.is_dirty) {
      console.log('[metadata] Local is dirty, returning pending.');
      return 'pending';
    }

    let webhookMsgId = null;

    if (webhookUrl) {
      const normalized = normalizeUrl(webhookUrl);
      console.log(`[metadata] Checking cloud for latest ID (Webhook: ${normalized.slice(-10)}...)`);
      
      try {
        // 1. Ambil ID dari Nama Webhook (Fast Path)
        const res = await net.fetch(normalized);
        if (res.ok) {
          const info = JSON.parse(await res.text());
          const match = info.name?.match(/(?:dbx|disbox|db)[:\s]+(\d+)/i);
          webhookMsgId = match?.[1] || null;
          if (webhookMsgId) console.log(`[metadata] Found ID in Webhook name: ${webhookMsgId}`);
        }

        // 2. Scanning Proaktif: Ambil 100 pesan terakhir untuk mencari metadata terbaru
        const msgRes = await net.fetch(`${normalized}/messages?limit=100`);
        if (msgRes.ok) {
          const messages = JSON.parse(await msgRes.text());
          const metaMsg = messages.find(m => 
            m.attachments?.some(a => a.filename.includes('metadata.json'))
          );
          if (metaMsg) {
            const scannedId = metaMsg.id;
            console.log(`[metadata] Found ID via scanning: ${scannedId}`);
            
            // Bandingkan dengan ID dari nama Webhook
            if (!webhookMsgId || BigInt(scannedId) > BigInt(webhookMsgId)) {
              console.log(`[metadata] Scanned ID ${scannedId} is NEWER than name ID ${webhookMsgId || 'None'}`);
              webhookMsgId = scannedId;
              
              // Sync balik ke Nama Webhook agar selanjutnya cepat
              await net.fetch(normalized, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `dbx: ${webhookMsgId}` }),
              }).catch(() => {});
            }
          }
        }
      } catch (e) {
        console.error('[metadata] Discovery error:', e.message);
      }
    }

    const candidates = [localMsgId, webhookMsgId].filter(Boolean);
    console.log(`[metadata] Candidates: local=${localMsgId}, cloud=${webhookMsgId}`);

    if (candidates.length === 0) return null;

    // Pilih ID yang paling baru (terbesar secara numerik/BigInt)
    const best = candidates.reduce((a, b) => {
      try {
        return BigInt(a) >= BigInt(b) ? a : b;
      } catch { return a; }
    });

    console.log(`[metadata] Selected best ID: ${best}`);

    return {
      lastMsgId: best,
      snapshotHistory: snapshotHistory
    };
  } catch (e) {
    console.error('[metadata] get-latest-msgid error:', e.message);
  }
  return null;
});

// [FIX] load-metadata: filter by hash
ipcMain.handle('load-metadata', async (_, hash) => {
  try {
    const files = db.prepare(
      'SELECT id, path, message_ids as messageIds, size, created_at as createdAt, is_locked as isLocked, is_starred as isStarred FROM files WHERE hash = ?'
    ).all(hash);

    return files.map(f => ({
      ...f,
      messageIds: JSON.parse(f.messageIds),
                           isLocked: !!f.isLocked,
                           isStarred: !!f.isStarred
    }));
  } catch (e) {
    console.error('[load-metadata] error:', e.message);
    return null;
  }
});

// Helper to mark metadata as dirty and trigger timer
function markMetadataDirty(hash) {
  try {
    db.prepare(`
    UPDATE metadata_sync SET is_dirty = 1, updated_at = ? WHERE hash = ?
    `).run(Date.now(), hash);

    const check = db.prepare('SELECT hash FROM metadata_sync WHERE hash = ?').get(hash);
    if (!check) {
      db.prepare('INSERT INTO metadata_sync (hash, is_dirty, updated_at) VALUES (?, 1, ?)').run(hash, Date.now());
    }

    if (metadataUploadTimer) clearTimeout(metadataUploadTimer);
    metadataUploadTimer = setTimeout(() => {
      metadataUploadTimer = null;
      uploadMetadataToDiscord(hash);
    }, 2000);
  } catch (e) {
    console.error('[metadata] mark-dirty error:', e.message);
  }
}

ipcMain.handle('set-starred', async (_, id, hash, isStarred) => {
  try {
    db.prepare('UPDATE files SET is_starred = ? WHERE id = ? AND hash = ?').run(isStarred ? 1 : 0, id, hash);
    markMetadataDirty(hash);
    return true;
  } catch (e) {
    console.error('[set-starred] error:', e.message);
    return false;
  }
});

ipcMain.handle('set-locked', async (_, id, hash, isLocked) => {
  try {
    db.prepare('UPDATE files SET is_locked = ? WHERE id = ? AND hash = ?').run(isLocked ? 1 : 0, id, hash);
    markMetadataDirty(hash);
    return true;
  } catch (e) {
    console.error('[set-locked] error:', e.message);
    return false;
  }
});

ipcMain.handle('set-pin', async (_, hash, pin) => {
  try {
    const hashedPin = cryptoNode.createHash('sha256').update(pin).digest('hex');
    db.prepare(`
    INSERT INTO settings (hash, key, value) VALUES (?, 'pin_hash', ?)
    ON CONFLICT(hash, key) DO UPDATE SET value = excluded.value
    `).run(hash, hashedPin);
    markMetadataDirty(hash);
    return true;
  } catch (e) {
    console.error('[set-pin] error:', e.message);
    return false;
  }
});

ipcMain.handle('verify-pin', async (_, hash, pin) => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE hash = ? AND key = 'pin_hash'").get(hash);
    if (!row) return false;
    const hashedPin = cryptoNode.createHash('sha256').update(pin).digest('hex');
    return row.value === hashedPin;
  } catch (e) {
    console.error('[verify-pin] error:', e.message);
    return false;
  }
});

ipcMain.handle('has-pin', async (_, hash) => {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE hash = ? AND key = 'pin_hash'").get(hash);
    return !!row;
  } catch (e) {
    console.error('[has-pin] error:', e.message);
    return false;
  }
});

ipcMain.handle('remove-pin', async (_, hash) => {
  try {
    db.prepare("DELETE FROM settings WHERE hash = ? AND key = 'pin_hash'").run(hash);
    markMetadataDirty(hash);
    return true;
  } catch (e) {
    console.error('[remove-pin] error:', e.message);
    return false;
  }
});

// ─── Upload metadata ke Discord ──────────────────────────────────────────────
let metadataUploadTimer = null;

async function uploadMetadataToDiscord(hash) {
  if (!activeWebhookUrl || activeWebhookHash !== hash) return;

  console.log(`[metadata] UPLOADING SQLite DB …${hash.slice(-8)}`);
  mainWindow?.webContents.send('metadata-status', { hash, status: 'uploading' });

  let retryCount = 0;
  const maxRetries = 5;

  while (retryCount <= maxRetries) {
    try {
      const key = getEncryptionKey(activeWebhookUrl);

      // Force WAL checkpoint to ensure all data is in the main file
      try { db.pragma('wal_checkpoint(FULL)'); } catch(_) {}
      
      const dbBuffer = fs.readFileSync(DB_PATH);
      const encryptedBuf = encrypt(dbBuffer, key);
      const bodyBuf = buildMetadataFormData(encryptedBuf, 'disbox_metadata.json');

      console.log(`[sync-debug] Uploading encrypted SQLite DB (${dbBuffer.length} bytes)...`);

      const response = await net.fetch(activeWebhookUrl + '?wait=true', {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data; boundary=----DisboxFlushBoundary',
          'User-Agent': 'Mozilla/5.0 Disbox/2.0',
        },
        body: new Uint8Array(bodyBuf),
      });

      if (!response.ok) {
        if ((response.status === 503 || response.status === 429) && retryCount < maxRetries) {
          retryCount++;
          const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        mainWindow?.webContents.send('metadata-status', { hash, status: 'error' });
        return;
      }

      const data = JSON.parse(await response.text());
      const newMsgId = data.id;

      db.transaction(() => {
        const meta = db.prepare('SELECT snapshot_history FROM metadata_sync WHERE hash = ?').get(hash);
        let snapshotHistory = JSON.parse(meta?.snapshot_history || '[]');

        snapshotHistory.push(newMsgId);
        if (snapshotHistory.length > 3) snapshotHistory.shift();

        db.prepare(`
        INSERT INTO metadata_sync (hash, last_msg_id, snapshot_history, is_dirty, updated_at)
        VALUES (?, ?, ?, 0, ?)
        ON CONFLICT(hash) DO UPDATE SET
        last_msg_id=excluded.last_msg_id,
        snapshot_history=excluded.snapshot_history,
        is_dirty=0,
        updated_at=excluded.updated_at
        `).run(hash, newMsgId, JSON.stringify(snapshotHistory), Date.now());
      })();

      console.log(`[metadata] UPLOAD DONE ✓ ID: ${newMsgId}`);
      mainWindow?.webContents.send('metadata-status', { hash, status: 'synced' });

      await net.fetch(activeWebhookUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `dbx: ${newMsgId}` }),
      }).catch(() => {});

      return; // Success
    } catch (e) {
      if (retryCount < maxRetries) {
        retryCount++;
        const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('[metadata] UPLOAD error:', e.message);
        mainWindow?.webContents.send('metadata-status', { hash, status: 'error' });
        return;
      }
    }
  }
}

// [FIX] save-metadata: semua operasi filter/delete by hash
ipcMain.handle('save-metadata', async (_, hash, data, msgId = null) => {
  console.log(`[metadata] save-metadata | hash: ${hash?.slice(-8)}, msgId: ${msgId || 'LOCAL'}`);
  try {
    if (msgId) {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const isSqlite = buffer.slice(0, 16).toString().startsWith('SQLite format 3');
      
      if (isSqlite) {
        console.log(`[sync-debug] OVERWRITING local DB with cloud data (${buffer.length} bytes)...`);
        initDatabase(); // Tutup koneksi lama
        fs.writeFileSync(DB_PATH, buffer);
        initDatabase(); // Buka koneksi baru dengan file baru
      } else {
        // Legacy JSON Migration
        try {
          const jsonStr = buffer.toString('utf8');
          const jsonData = JSON.parse(jsonStr);
          console.log('[sync] Legacy JSON metadata detected from cloud, migrating to SQLite...');
          migrateLegacyJsonDataToSqlite(hash, jsonData);
          // Tandai sebagai dirty agar selanjutnya terupload sebagai SQLite
          markMetadataDirty(hash);
        } catch (e) {
          console.error('[sync] Failed to handle non-SQLite cloud metadata:', e.message);
          console.log('[sync] Hint: Data might be encrypted with a different key or corrupted.');
          return false;
        }
      }

      // Update sync table (baik setelah biner overwite maupun JSON migration)
      const meta = db.prepare('SELECT snapshot_history FROM metadata_sync WHERE hash = ?').get(hash);
      let snapshotHistory = JSON.parse(meta?.snapshot_history || '[]');
      if (!snapshotHistory.includes(msgId)) {
        snapshotHistory.push(msgId);
        if (snapshotHistory.length > 3) snapshotHistory.shift();
      }

      db.prepare(`
      INSERT INTO metadata_sync (hash, last_msg_id, snapshot_history, is_dirty, updated_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(hash) DO UPDATE SET
      last_msg_id=excluded.last_msg_id,
      snapshot_history=excluded.snapshot_history,
      is_dirty=0,
      updated_at=excluded.updated_at
      `).run(hash, msgId, JSON.stringify(snapshotHistory), Date.now());

      console.log(`[metadata] SYNCED & RESTORED …${hash.slice(-8)}`);
      mainWindow?.webContents.send('metadata-status', { hash, status: 'synced' });
    } else {
      markMetadataDirty(hash);
      mainWindow?.webContents.send('metadata-status', { hash, status: 'dirty' });
    }
    return true;
  } catch (e) {
    console.error('[save-metadata] error:', e.message);
    return false;
  }
});

// ─── Upload chunk ─────────────────────────────────────────────────────────────
ipcMain.handle('upload-chunk', async (_, webhookUrl, chunkB64, filename) => {
  try {
    const buffer = Buffer.from(chunkB64, 'base64');
    const boundary = '----DisboxBoundary' + Date.now().toString(36);
    const CRLF = Buffer.from('\r\n');
    const bodyParts = [
      Buffer.from('--' + boundary + '\r\n'),
               Buffer.from('Content-Disposition: form-data; name="file"; filename="' + filename + '"\r\n'),
               Buffer.from('Content-Type: application/octet-stream\r\n'),
               CRLF,
               buffer,
               CRLF,
               Buffer.from('--' + boundary + '--\r\n'),
    ];
    const bodyBuf = Buffer.concat(bodyParts);

    const response = await net.fetch(webhookUrl + '?wait=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=' + boundary,
        'User-Agent': 'Mozilla/5.0 Disbox/2.0',
      },
      body: new Uint8Array(bodyBuf),
    });

    const text = await response.text();
    return { ok: response.ok, status: response.status, body: text };
  } catch (e) {
    console.error('[upload-chunk] error:', e.message);
    return { ok: false, status: 0, body: '', error: e.message };
  }
});

ipcMain.on('cancel-upload', (_, transferId) => {
  const flag = uploadCancelFlags.get(transferId);
  if (flag) {
    flag.cancelled = true;
    console.log('[upload] Cancelled by user (flag):', transferId);
  }

  const controller = abortControllers.get(transferId);
  if (controller) {
    controller.abort();
    console.log('[transfer] Fetch aborted by user:', transferId);
  }
});

ipcMain.handle('upload-file-from-path', async (event, webhookUrl, nativePath, destName, transferId, chunkSize) => {
  const cancelFlag = { cancelled: false };
  uploadCancelFlags.set(transferId, cancelFlag);

  try {
    const stats = fs.statSync(nativePath);
    const totalSize = stats.size;
    const CHUNK = chunkSize || 7.5 * 1024 * 1024;
    const numChunks = Math.ceil(totalSize / CHUNK) || 1;
    const filename = destName || path.basename(nativePath);
    const messageIds = new Array(numChunks);
    const fd = fs.openSync(nativePath, 'r');

    let completedChunks = 0;
    let activeUploads = 0;
    let nextChunkStartIndex = 0;

    return new Promise((resolve, reject) => {
      const cancelChecker = setInterval(() => {
        if (cancelFlag.cancelled) {
          clearInterval(cancelChecker);
          try { fs.closeSync(fd); } catch (_) {}
          uploadCancelFlags.delete(transferId);
          reject(new Error('UPLOAD_CANCELLED'));
        }
      }, 100);

      function finish(result) {
        clearInterval(cancelChecker);
        uploadCancelFlags.delete(transferId);
        result instanceof Error ? reject(result) : resolve(result);
      }

      async function uploadNext() {
        if (cancelFlag.cancelled) return;

        if (completedChunks === numChunks) {
          try { fs.closeSync(fd); } catch (_) {}
          finish({ ok: true, messageIds, size: totalSize });
          return;
        }

        const chunksPerMsg = Math.min(Math.max(1, prefs.chunksPerMessage || 1), 10);
        while (activeUploads < 2 && nextChunkStartIndex < numChunks) {
          const startIndex = nextChunkStartIndex;
          const count = Math.min(chunksPerMsg, numChunks - startIndex);
          nextChunkStartIndex += count;
          activeUploads++;
          uploadGroup(startIndex, count);
        }
      }

      async function uploadGroup(startIndex, count, retryCount = 0) {
        if (cancelFlag.cancelled) {
          activeUploads--;
          return;
        }

        try {
          const boundary = '----DisboxMultiBoundary' + Date.now().toString(36) + startIndex;
          const bodyParts = [];
          const key = getEncryptionKey(webhookUrl);

          for (let i = 0; i < count; i++) {
            const index = startIndex + i;
            const start = index * CHUNK;
            const size = Math.min(CHUNK, totalSize - start);
            const buf = Buffer.allocUnsafe(size);
            fs.readSync(fd, buf, 0, size, start);

            const encryptedBuf = encrypt(buf, key);

            bodyParts.push(Buffer.from('--' + boundary + '\r\n'));
            bodyParts.push(Buffer.from(`Content-Disposition: form-data; name="file${i}"; filename="${filename}.part${index}"\r\n`));
            bodyParts.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
            bodyParts.push(encryptedBuf);
            bodyParts.push(Buffer.from('\r\n'));
          }
          bodyParts.push(Buffer.from('--' + boundary + '--\r\n'));

          const body = Buffer.concat(bodyParts);

          if (cancelFlag.cancelled) {
            activeUploads--;
            return;
          }

          const response = await net.fetch(webhookUrl + '?wait=true', {
            method: 'POST',
            headers: {
              'Content-Type': 'multipart/form-data; boundary=' + boundary,
              'User-Agent': 'Mozilla/5.0 Disbox/2.0',
            },
            body,
          });

          if (cancelFlag.cancelled) {
            activeUploads--;
            return;
          }

          const text = await response.text();

          if (response.status === 429) {
            const retryAfter = (JSON.parse(text).retry_after || 5) + 1;
            console.warn(`[upload] Rate limited, retrying after ${retryAfter}s...`);
            setTimeout(() => {
              if (!cancelFlag.cancelled) uploadGroup(startIndex, count, retryCount);
              else activeUploads--;
            }, (retryAfter * 1000));
            return;
          }

          if (!response.ok) {
            throw new Error(`Status ${response.status}: ${text.slice(0, 100)}`);
          }

          const data = JSON.parse(text);
          for (let i = 0; i < count; i++) {
            messageIds[startIndex + i] = { msgId: data.id, index: i };
          }

          activeUploads--;
          completedChunks += count;

          if (!cancelFlag.cancelled) {
            event.sender.send('upload-progress-' + transferId, completedChunks / numChunks);
          }

          uploadNext();
        } catch (e) {
          if (cancelFlag.cancelled) {
            activeUploads--;
            return;
          }

          if (retryCount < 10) {
            console.error(`[upload] Error on group starting at ${startIndex}, retry ${retryCount + 1}/10:`, e.message);
            const backoff = (retryCount + 1) * 2000;
            setTimeout(() => {
              if (!cancelFlag.cancelled) uploadGroup(startIndex, count, retryCount + 1);
              else activeUploads--;
            }, backoff);
          } else {
            activeUploads--;
            try { fs.closeSync(fd); } catch (_) {}
            finish(new Error(`Gagal upload group ${startIndex} setelah 10 kali coba: ${e.message}`));
          }
        }
      }

      uploadNext();
    });
  } catch (e) {
    uploadCancelFlags.delete(transferId);
    console.error('[upload-path] Fatal error:', e.message);
    return { ok: false, error: e.message };
  }
});
