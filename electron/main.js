const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, session, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// ─── Tangkap SIGINT/SIGTERM agar before-quit terpicu ─────────────────────────
// Ctrl+C di terminal mengirim SIGINT yang bypass before-quit Electron.
// Dengan menangkapnya dan memanggil app.quit(), before-quit akan terpicu.
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

// ─── Metadata lokal ───────────────────────────────────────────────────────────
const METADATA_DIR = path.join(os.homedir(), '.config', 'disbox-linux');
if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });

// Preferensi default
let prefs = {
  closeToTray: false,
  startMinimized: false
};

// Muat preferensi dari file (jika ada)
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

// ... (createWindow remains similar)

function createWindow() {
  const iconPath = path.join(__dirname, '../src/assets/icon.png');
  
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
  // Cari icon di beberapa lokasi umum
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

  // Jika tidak ketemu, buat icon kosong sederhana (atau gunakan icon bawaan jika ada)
  if (!trayIcon) {
    // Buat buffer icon 16x16 warna ungu (brand disbox) sebagai fallback
    trayIcon = nativeImage.createFromNamedImage('folder', [1, 1, 1]); // Placeholder
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
  // ... existing session headers logic
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

// IPC untuk preferensi
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
  if (isQuitting && !metadataUploadTimer) return; // Sudah dalam proses quit
  
  if (!activeWebhookUrl || !activeWebhookHash || !metadataUploadTimer) {
    isQuitting = true;
    return;
  }

  // Ada upload yang belum jalan
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

// ─── flush-metadata IPC (update activeWebhook saja) ──────────────────────────
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

// ─── Electron net.fetch ───────────────────────────────────────────────────────
ipcMain.handle('net-fetch', async (_, url, options = {}) => {
  try {
    const response = await net.fetch(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 Disbox/2.0',
        ...(options.headers || {}),
      },
      body: options.body || undefined,
    });
    const body = await response.text();
    return { status: response.status, body, ok: response.ok };
  } catch (e) {
    console.error('[net-fetch] error:', url, e.message);
    return { status: 0, body: '', ok: false, error: e.message };
  }
});

// Binary download via net.fetch
ipcMain.handle('proxy-download', async (_, url) => {
  try {
    const response = await net.fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Disbox/2.0' },
    });
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    throw new Error(`Download failed: ${e.message}`);
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

// ─── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('window-close', () => mainWindow?.close());
ipcMain.handle('window-is-maximized', () => mainWindow?.isMaximized());

// ─── File dialogs ─────────────────────────────────────────────────────────────
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

// ─── File I/O ─────────────────────────────────────────────────────────────────
ipcMain.handle('read-file', async (_, filePath) => {
  const stats = fs.statSync(filePath);
  // Batasi 512MB agar tidak OOM — file besar pakai upload-file-from-path
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

// Hanya ambil ukuran file — aman untuk file berukuran apapun termasuk >2GB
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

// ─── Helper: cari file metadata terbaru untuk hash tertentu ──────────────────
// Format nama file: <hash>.<msgId>.json  (msgId = Discord Snowflake, terbesar = terbaru)
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
  const latest = findLatestMetadataFile(hash);
  if (!latest) return null;
  
  try {
    const filePath = path.join(METADATA_DIR, latest.file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    
    // Jika ada perubahan lokal yang belum diupload, anggap sebagai 'pending'
    if (parsed && parsed.isDirty) return 'pending';
    
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed.lastMsgId || null;
    }
  } catch (e) {
    console.error('[metadata] get-latest-msgid error:', e.message);
  }
  return null;
});

ipcMain.handle('load-metadata', async (_, hash) => {
  try {
    const latest = findLatestMetadataFile(hash);
    if (!latest) return null;

    const filePath = path.join(METADATA_DIR, latest.file);
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    
    let files = [];
    if (Array.isArray(parsed)) files = parsed;
    else if (parsed && typeof parsed === 'object') files = parsed.files || [];

    return files.length > 0 ? files : null;
  } catch (e) {
    return null;
  }
});

// ─── Upload metadata ke Discord ──────────────────────────────────────────────
let metadataUploadTimer = null;

async function uploadMetadataToDiscord(hash) {
  if (!activeWebhookUrl || activeWebhookHash !== hash) return;
  const finalFile = path.join(METADATA_DIR, `${hash}.json`);
  if (!fs.existsSync(finalFile)) return;

  let files;
  try {
    const parsed = JSON.parse(fs.readFileSync(finalFile, 'utf8'));
    files = Array.isArray(parsed) ? parsed : parsed.files;
    if (!Array.isArray(files) || files.length === 0) return;
  } catch { return; }

  console.log(`[metadata] UPLOADING …${hash.slice(-8)} (${files.length} items)`);
  mainWindow?.webContents.send('metadata-status', { hash, status: 'uploading', items: files.length });
  try {
    const bodyBuf = buildMetadataFormData(Buffer.from(JSON.stringify(files)), 'disbox_metadata.json');
    const response = await net.fetch(activeWebhookUrl + '?wait=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=----DisboxFlushBoundary',
        'User-Agent': 'Mozilla/5.0 Disbox/2.0',
      },
      body: new Uint8Array(bodyBuf),
    });

    if (!response.ok) {
      mainWindow?.webContents.send('metadata-status', { hash, status: 'error' });
      return;
    }
    const data = JSON.parse(await response.text());
    const newMsgId = data.id;

    // Update file yang sama: set isDirty = false dan update lastMsgId
    const content = { lastMsgId: newMsgId, files: files, isDirty: false, updatedAt: Date.now() };
    fs.writeFileSync(finalFile, JSON.stringify(content, null, 2));
    console.log(`[metadata] UPLOAD DONE ✓ ID: ${newMsgId}`);
    mainWindow?.webContents.send('metadata-status', { hash, status: 'synced', items: files.length });

    // Update Webhook Name untuk discovery
    await net.fetch(activeWebhookUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `dbx: ${newMsgId}` }),
    }).catch(() => {});
  } catch (e) {
    console.error('[metadata] UPLOAD error:', e.message);
  }
}

ipcMain.handle('save-metadata', async (_, hash, data, msgId = null) => {
  try {
    if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });
    const finalFile = path.join(METADATA_DIR, `${hash}.json`);

    if (msgId) {
      // Hasil sync dari cloud: replace file utama
      const content = { lastMsgId: msgId, files: data, isDirty: false, updatedAt: Date.now() };
      fs.writeFileSync(finalFile, JSON.stringify(content, null, 2));
      console.log(`[metadata] SYNCED & RESTORED …${hash.slice(-8)} → ${data.length} items`);
      mainWindow?.webContents.send('metadata-status', { hash, status: 'synced', items: data.length });
      return true;
    }

    // Perubahan lokal: simpan dengan flag isDirty = true
    let lastId = null;
    if (fs.existsSync(finalFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(finalFile, 'utf8'));
        lastId = existing.lastMsgId;
      } catch (_) {}
    }

    const content = { lastMsgId: lastId, files: data, isDirty: true, updatedAt: Date.now() };
    fs.writeFileSync(finalFile, JSON.stringify(content, null, 2));
    console.log(`[metadata] LOCAL SAVE …${hash.slice(-8)} → ${data.length} items (dirty)`);
    mainWindow?.webContents.send('metadata-status', { hash, status: 'dirty', items: data.length });

    if (metadataUploadTimer) clearTimeout(metadataUploadTimer);
    metadataUploadTimer = setTimeout(() => {
      metadataUploadTimer = null;
      uploadMetadataToDiscord(hash);
    }, 2000);

    return true;
  } catch (e) {
    return false;
  }
});

// ─── Upload chunk (single chunk, dari renderer buffer) ────────────────────────
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

    console.log('[upload-chunk] sending', filename, bodyBuf.length, 'bytes');

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

// ─── Cancel upload ────────────────────────────────────────────────────────────
// Renderer memanggil ini sebelum/sesudah minta cancel, main process set flag.
ipcMain.on('cancel-upload', (_, transferId) => {
  const flag = uploadCancelFlags.get(transferId);
  if (flag) {
    flag.cancelled = true;
    console.log('[upload] Cancelled by user:', transferId);
  }
});

// ─── Upload file dari path (parallel 8 chunks) ───────────────────────────────
ipcMain.handle('upload-file-from-path', async (event, webhookUrl, nativePath, destName, transferId, chunkSize) => {
  // Buat flag cancel untuk transfer ini
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
      // Cek cancel flag secara periodik — jika dicancel, tutup fd dan reject
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

        while (activeUploads < 8 && nextChunkIndex < numChunks) {
          const index = nextChunkIndex++;
          activeUploads++;
          uploadChunk(index);
        }
      }

      async function uploadChunk(index, retryCount = 0) {
        // Cek cancel sebelum mulai chunk
        if (cancelFlag.cancelled) {
          activeUploads--;
          return;
        }

        try {
          const start = index * CHUNK;
          const size = Math.min(CHUNK, totalSize - start);
          const buf = Buffer.alloc(size);
          fs.readSync(fd, buf, 0, size, start);

          const boundary = '----DisboxBoundary' + Date.now().toString(36) + index;
          const header = Buffer.from(
            '--' + boundary + '\r\n' +
            'Content-Disposition: form-data; name="file"; filename="' + filename + '.part' + index + '"\r\n' +
            'Content-Type: application/octet-stream\r\n\r\n'
          );
          const footer = Buffer.from('\r\n--' + boundary + '--\r\n');
          const body = new Uint8Array(Buffer.concat([header, buf, footer]));

          // Cek cancel lagi sebelum network call
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

          // Cek cancel setelah network call selesai
          if (cancelFlag.cancelled) {
            activeUploads--;
            return;
          }

          const text = await response.text();

          if (response.status === 429) {
            const retryAfter = JSON.parse(text).retry_after || 5;
            console.warn(`[upload] Rate limited on chunk ${index}, retrying in ${retryAfter}s...`);
            activeUploads--;
            setTimeout(() => {
              if (!cancelFlag.cancelled) {
                activeUploads++;
                uploadChunk(index, retryCount + 1);
              }
            }, (retryAfter * 1000) + 500);
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

          if (retryCount < 3) {
            console.error(`[upload] Error on chunk ${index}, retry ${retryCount + 1}:`, e.message);
            activeUploads--;
            setTimeout(() => {
              if (!cancelFlag.cancelled) {
                activeUploads++;
                uploadChunk(index, retryCount + 1);
              }
            }, 2000);
          } else {
            try { fs.closeSync(fd); } catch (_) {}
            finish(new Error(`Gagal upload chunk ${index} setelah 3 kali coba: ${e.message}`));
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
