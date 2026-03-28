const fs = require('fs');
const content = \`const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, session, net, Notification, protocol } = require('electron');
protocol.registerSchemesAsPrivileged([
  { scheme: 'disbox-stream', privileges: { stream: true, bypassCSP: true, supportFetchAPI: true, corsEnabled: true } }
]);
const path = require('path');
const fs = require('fs');
const os = require('os');
const chokidar = require('chokidar');
const archiver = require('archiver');
const cryptoNode = require('crypto');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
let tray;
let isQuitting = false;
var uploadCancelFlags = new Map();
const abortControllers = new Map();

const MAGIC_HEADER = Buffer.from('DBX_ENC:');

function normalizeUrl(url) {
  if (!url) return '';
  return url.split('?')[0].trim().replace(/\\/+$/, '');
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

const METADATA_DIR = process.platform === 'win32'
  ? path.join(app.getPath('userData'), 'metadata')
  : path.join(os.homedir(), '.config', 'disbox-linux');

if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });

const Database = require('better-sqlite3');
const DB_PATH = path.join(METADATA_DIR, 'disbox.db');
let db;

function initDatabase() {
  if (db) { try { db.close(); } catch(e) {} }
  db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  db.exec(\\\`
    CREATE TABLE IF NOT EXISTS files (
      id TEXT NOT NULL, hash TEXT NOT NULL, path TEXT NOT NULL, parent_path TEXT NOT NULL,
      name TEXT NOT NULL, size INTEGER DEFAULT 0, created_at INTEGER, message_ids TEXT NOT NULL,
      is_locked INTEGER DEFAULT 0, is_starred INTEGER DEFAULT 0, PRIMARY KEY (id, hash)
    );
    CREATE TABLE IF NOT EXISTS metadata_sync (
      hash TEXT PRIMARY KEY, last_msg_id TEXT, snapshot_history TEXT DEFAULT '[]',
      is_dirty INTEGER DEFAULT 0, updated_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS settings (hash TEXT NOT NULL, key TEXT NOT NULL, value TEXT, PRIMARY KEY (hash, key));
    CREATE TABLE IF NOT EXISTS cloudsave_entries (
      id TEXT PRIMARY KEY, webhook_hash TEXT NOT NULL, name TEXT NOT NULL, local_path TEXT,
      discord_path TEXT NOT NULL, last_synced INTEGER DEFAULT 0, last_modified INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS share_settings (
      hash TEXT PRIMARY KEY, mode TEXT DEFAULT 'public', cf_worker_url TEXT, cf_api_token TEXT, webhook_url TEXT, enabled INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY, hash TEXT NOT NULL, file_path TEXT NOT NULL, file_id TEXT,
      token TEXT NOT NULL, permission TEXT NOT NULL, expires_at INTEGER, created_at INTEGER NOT NULL
    );
  \\\`);
}
initDatabase();

function migrateLegacyJsonDataToSqlite(hash, data) {
  const filesToSave = Array.isArray(data) ? data : (data.files || []);
  db.transaction(() => {
    db.prepare('DELETE FROM files WHERE hash = ?').run(hash);
    const insertFile = db.prepare(\\\`INSERT INTO files (id, hash, path, parent_path, name, size, created_at, message_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?)\\\`);
    for (const f of filesToSave) {
      const parts = f.path.split('/');
      const name = parts.pop();
      const parent_path = parts.join('/') || '/';
      insertFile.run(f.id || Math.random().toString(36).substring(7), hash, f.path, parent_path, name, f.size || 0, f.createdAt || Date.now(), JSON.stringify(f.messageIds || []));
    }
  })();
}

function markMetadataDirty(hash) {
  db.prepare('INSERT INTO metadata_sync (hash, is_dirty, updated_at) VALUES (?, 1, ?) ON CONFLICT(hash) DO UPDATE SET is_dirty=1').run(hash, Date.now());
  if (global.metadataUploadTimer) clearTimeout(global.metadataUploadTimer);
  global.metadataUploadTimer = setTimeout(() => uploadMetadataToDiscord(hash), 2000);
}

async function uploadMetadataToDiscord(hash) {
  if (!activeWebhookUrl) return;
  const key = getEncryptionKey(activeWebhookUrl);
  const dbBuffer = fs.readFileSync(DB_PATH);
  const encryptedBuf = encrypt(dbBuffer, key);
  console.log(\\\`[sync-lifecycle] upload disbox metadata: \\\${dbBuffer.length} bytes\\\`);
  const boundary = '----DisboxFlushBoundary';
  const bodyBuf = Buffer.concat([
    Buffer.from('--' + boundary + '\\\\r\\\\nContent-Disposition: form-data; name="file"; filename="disbox_metadata.json"\\\\r\\\\nContent-Type: application/json\\\\r\\\\n\\\\r\\\\n'),
    encryptedBuf,
    Buffer.from('\\\\r\\\\n--' + boundary + '--\\\\r\\\\n')
  ]);
  const res = await net.fetch(activeWebhookUrl + '?wait=true', {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    body: new Uint8Array(bodyBuf)
  });
  if (res.ok) {
    const data = JSON.parse(await res.text());
    db.prepare("UPDATE metadata_sync SET last_msg_id = ?, is_dirty = 0 WHERE hash = ?").run(data.id, hash);
  }
}

let activeWebhookUrl = null;
let activeWebhookHash = null;

ipcMain.on('set-active-webhook', (_, url, hash) => {
  activeWebhookUrl = url; activeWebhookHash = hash;
  console.log(\\\`[sync-lifecycle] load webhook: \\\${url?.slice(0, 40)}... | hash: \\\${hash?.slice(-8)}\\\`);
});

ipcMain.handle('get-latest-metadata-msgid', async (_, hash, webhookUrl) => {
  const meta = db.prepare('SELECT last_msg_id, is_dirty FROM metadata_sync WHERE hash = ?').get(hash);
  if (meta?.is_dirty) return 'pending';
  let webhookMsgId = null;
  if (webhookUrl) {
    const res = await net.fetch(normalizeUrl(webhookUrl));
    if (res.ok) {
      const info = JSON.parse(await res.text());
      webhookMsgId = info.name?.match(/(?:dbx|disbox|db)[:\\\\s]+(\\\\d+)/i)?.[1];
    }
  }
  return { lastMsgId: webhookMsgId || meta?.last_msg_id, snapshotHistory: [] };
});

ipcMain.handle('save-metadata', async (_, hash, data, msgId) => {
  if (msgId) {
    console.log(\\\`[sync-lifecycle] download disbox metadata json: ID \\\${msgId}\\\`);
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (buffer.slice(0, 16).toString().startsWith('SQLite format 3')) {
      console.log(\\\`[sync-lifecycle] load file disbox metadata (SQLite): \\\${buffer.length} bytes\\\`);
      initDatabase(); fs.writeFileSync(DB_PATH, buffer); initDatabase();
    } else {
      console.log(\\\`[sync-lifecycle] load file disbox metadata (Legacy JSON): \\\${buffer.length} bytes\\\`);
      try { migrateLegacyJsonDataToSqlite(hash, JSON.parse(buffer.toString())); markMetadataDirty(hash); } catch(e) {}
    }
    db.prepare("INSERT INTO metadata_sync (hash, last_msg_id, is_dirty) VALUES (?, ?, 0) ON CONFLICT(hash) DO UPDATE SET last_msg_id=excluded.last_msg_id, is_dirty=0").run(hash, msgId);
  } else { markMetadataDirty(hash); }
  return true;
});

ipcMain.handle('load-metadata', async (_, hash) => {
  const rows = db.prepare('SELECT * FROM files WHERE hash = ?').all(hash);
  return rows.map(r => ({ ...r, messageIds: JSON.parse(r.message_ids) }));
});

ipcMain.handle('net-fetch', async (_, url, opts) => {
  const res = await net.fetch(url, { method: opts.method || 'GET', body: opts.body });
  return { status: res.status, body: await res.text(), ok: res.ok };
});

ipcMain.handle('proxy-download', async (_, url) => {
  const res = await net.fetch(url);
  return Buffer.from(await res.arrayBuffer());
});

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  if (isDev) mainWindow.loadURL('http://localhost:5173');
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('window-all-closed', () => app.quit());

ipcMain.handle('upload-chunk', async () => ({ ok: true }));
ipcMain.handle('upload-file-from-path', async () => ({ ok: true }));
\`;
fs.writeFileSync('electron/main.js', content);
