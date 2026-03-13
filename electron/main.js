const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
const MAGIC_HEADER = Buffer.from('DBX_ENC:');

function getEncryptionKey(url) {
  if (!url) return null;
  const baseUrl = url.split('?')[0];
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
const db = new Database(DB_PATH);

// [FIX] Cek dan migrate tabel files SEBELUM membuat index yang butuh kolom hash
// Ini harus jalan duluan karena CREATE INDEX IF NOT EXISTS akan error
// jika tabel sudah ada tapi belum punya kolom hash
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
  `);

  // Sekarang cek apakah kolom hash sudah ada
  const cols = db.prepare("PRAGMA table_info(files)").all();
  const hasHash = cols.some(c => c.name === 'hash');
  const hasIsLocked = cols.some(c => c.name === 'is_locked');
  const hasIsStarred = cols.some(c => c.name === 'is_starred');

  if (!hasHash) {
    console.log('[migration] Kolom hash belum ada, migrasi tabel files...');
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
    if (!hasIsLocked) {
      console.log('[migration] Kolom is_locked belum ada, migrasi...');
      db.exec(`ALTER TABLE files ADD COLUMN is_locked INTEGER DEFAULT 0`);
    }
    if (!hasIsStarred) {
      console.log('[migration] Kolom is_starred belum ada, migrasi...');
      db.exec(`ALTER TABLE files ADD COLUMN is_starred INTEGER DEFAULT 0`);
    }
  }

  // Sekarang aman untuk buat index (kolom hash sudah pasti ada)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hash ON files(hash);
    CREATE INDEX IF NOT EXISTS idx_path ON files(path, hash);
    CREATE INDEX IF NOT EXISTS idx_parent ON files(parent_path, hash);
  `);

} catch (e) {
  console.error('[migration] Setup database gagal:', e.message);
  throw e; // Fatal — app tidak bisa jalan tanpa DB
}

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
      console.error(`[migration] Failed for ${hash}:`, e.message);
    }
  }
}

migrateJsonToSqlite();

// Preferensi default
let prefs = {
  closeToTray: false,
  startMinimized: false
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

ipcMain.handle('get-latest-metadata-msgid', async (_, hash) => {
  try {
    const meta = db.prepare('SELECT last_msg_id, snapshot_history, is_dirty FROM metadata_sync WHERE hash = ?').get(hash);
    if (!meta) return null;
    
    if (meta.is_dirty) return 'pending';
    
    return {
      lastMsgId: meta.last_msg_id,
      snapshotHistory: JSON.parse(meta.snapshot_history || '[]')
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

  let files;
  let pinHash = null;
  try {
    const rows = db.prepare(
      'SELECT id, path, message_ids as messageIds, size, created_at as createdAt, is_locked as isLocked, is_starred as isStarred FROM files WHERE hash = ?'
    ).all(hash);
    files = rows.map(f => ({
      ...f,
      messageIds: JSON.parse(f.messageIds),
      isLocked: !!f.isLocked,
      isStarred: !!f.isStarred
    }));
    
    const pinRow = db.prepare("SELECT value FROM settings WHERE hash = ? AND key = 'pin_hash'").get(hash);
    if (pinRow) pinHash = pinRow.value;

    if (files.length === 0 && !pinHash) return;
  } catch { return; }

  console.log(`[metadata] UPLOADING …${hash.slice(-8)} (${files.length} items)`);
  mainWindow?.webContents.send('metadata-status', { hash, status: 'uploading', items: files.length });

  let retryCount = 0;
  const maxRetries = 5;

  while (retryCount <= maxRetries) {
    try {
      const key = getEncryptionKey(activeWebhookUrl);
      
      // MetadataContainer format
      const container = {
        files,
        pinHash,
        updatedAt: Date.now()
      };
      
      const jsonBuf = Buffer.from(JSON.stringify(container));
      const encryptedBuf = encrypt(jsonBuf, key);
      const bodyBuf = buildMetadataFormData(encryptedBuf, 'disbox_metadata.json');
      
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
          console.warn(`[metadata] Upload failed with ${response.status}, retrying in ${Math.round(delay)}ms...`);
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
      mainWindow?.webContents.send('metadata-status', { hash, status: 'synced', items: files.length });

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
        console.warn(`[metadata] Upload attempt ${retryCount} failed: ${e.message}, retrying...`);
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
  try {
    db.transaction(() => {
      // Handle both MetadataContainer object and legacy array format
      const isContainer = !Array.isArray(data) && data !== null && typeof data === 'object';
      const filesToSave = isContainer ? (data.files || []) : (data || []);
      const pinHashToSync = isContainer ? data.pinHash : null;

      if (msgId) {
        // Sync dari cloud: hapus HANYA file milik hash ini
        db.prepare('DELETE FROM files WHERE hash = ?').run(hash);
        
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

        // Sync pinHash jika ada (khusus saat download dari cloud)
        if (pinHashToSync) {
          db.prepare(`
            INSERT INTO settings (hash, key, value) VALUES (?, 'pin_hash', ?)
            ON CONFLICT(hash, key) DO UPDATE SET value = excluded.value
          `).run(hash, pinHashToSync);
        } else if (isContainer) {
          // Jika container eksplisit tapi pinHash null/kosong, hapus pin lokal agar sync
          db.prepare("DELETE FROM settings WHERE hash = ? AND key = 'pin_hash'").run(hash);
        }

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

        console.log(`[metadata] SYNCED & RESTORED …${hash.slice(-8)} → ${filesToSave.length} items`);
        mainWindow?.webContents.send('metadata-status', { hash, status: 'synced', items: filesToSave.length });
      } else {
        // Perubahan lokal: hapus HANYA file milik hash ini
        db.prepare('DELETE FROM files WHERE hash = ?').run(hash);
        
        const insertFile = db.prepare(`
          INSERT INTO files (id, hash, path, parent_path, name, size, created_at, message_ids, is_locked, is_starred)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const f of filesToSave) {
          const parts = f.path.split('/');
          const name = parts.pop();
          const parent_path = parts.join('/') || '/';
          insertFile.run(
            f.id,
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

        markMetadataDirty(hash);

        console.log(`[metadata] LOCAL SAVE …${hash.slice(-8)} → ${filesToSave.length} items (dirty)`);
        mainWindow?.webContents.send('metadata-status', { hash, status: 'dirty', items: filesToSave.length });
      }
    })();
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
    const CHUNK = chunkSize || 8 * 1024 * 1024;
    const numChunks = Math.ceil(totalSize / CHUNK) || 1;
    const filename = destName || path.basename(nativePath);
    const messageIds = new Array(numChunks);
    const fd = fs.openSync(nativePath, 'r');

    let completedChunks = 0;
    let activeUploads = 0;
    let nextChunkIndex = 0;

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

        while (activeUploads < 3 && nextChunkIndex < numChunks) {
          const index = nextChunkIndex++;
          activeUploads++;
          uploadChunk(index);
        }
      }

      async function uploadChunk(index, retryCount = 0) {
        if (cancelFlag.cancelled) {
          activeUploads--;
          return;
        }

        try {
          const start = index * CHUNK;
          const size = Math.min(CHUNK, totalSize - start);
          const buf = Buffer.allocUnsafe(size);
          fs.readSync(fd, buf, 0, size, start);

          // [ENCRYPT] Encrypt chunk sebelum upload
          const key = getEncryptionKey(webhookUrl);
          const encryptedBuf = encrypt(buf, key);

          const boundary = '----DisboxBoundary' + Date.now().toString(36) + index;
          const header = Buffer.from(
            '--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="file"; filename="' + filename + '.part' + index + '"\r\n' +
            'Content-Type: application/octet-stream\r\n\r\n'
          );
          const footer = Buffer.from('\r\n--' + boundary + '--\r\n');
          const body = new Uint8Array(Buffer.concat([header, encryptedBuf, footer]));

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
            activeUploads--;
            setTimeout(() => {
              if (!cancelFlag.cancelled) {
                activeUploads++;
                uploadChunk(index, retryCount);
              }
            }, (retryAfter * 1000));
            return;
          }

          if (!response.ok) {
            throw new Error(`Status ${response.status}: ${text.slice(0, 100)}`);
          }

          const data = JSON.parse(text);
          messageIds[index] = data.id;

          activeUploads--;
          completedChunks++;

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
            console.error(`[upload] Error on chunk ${index}, retry ${retryCount + 1}/10:`, e.message);
            activeUploads--;
            const backoff = (retryCount + 1) * 2000;
            setTimeout(() => {
              if (!cancelFlag.cancelled) {
                activeUploads++;
                uploadChunk(index, retryCount + 1);
              }
            }, backoff);
          } else {
            try { fs.closeSync(fd); } catch (_) {}
            finish(new Error(`Gagal upload chunk ${index} setelah 10 kali coba: ${e.message}`));
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
