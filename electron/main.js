const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, session, net } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    frame: true,
    backgroundColor: '#0d0d12',
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
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setAutoHideMenuBar(true);
    mainWindow.setMenuBarVisibility(false);
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, '../src/assets/icon.png');
  if (fs.existsSync(iconPath)) {
    tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16 }));
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Open Disbox', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setContextMenu(contextMenu);
    tray.setToolTip('Disbox — Discord Cloud Storage');
    tray.on('click', () => mainWindow?.show());
  }
}

app.whenReady().then(() => {
  // Bypass CORS for all renderer requests
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
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── Electron net.fetch — handles redirects, TLS, cookies natively ────────────
// This is the correct way to make HTTP requests in modern Electron (v21+)

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

// Binary download via net.fetch — returns Buffer directly
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
  const buffer = fs.readFileSync(filePath);
  const stats = fs.statSync(filePath);
  return {
    data: buffer.toString('base64'),
    name: path.basename(filePath),
    size: stats.size,
  };
});

ipcMain.handle('save-file', async (_, { savePath, data }) => {
  try {
    // data can be Uint8Array from renderer or base64 string
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

// ─── IPC: Metadata lokal (menggantikan software.disbox.app) ──────────────────
const { app: electronApp } = require('electron');
const METADATA_DIR = require('path').join(require('os').homedir(), '.config', 'disbox');

// Watch metadata directory for external changes (manual edits, sync, etc)
if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });
fs.watch(METADATA_DIR, (eventType, filename) => {
  if (filename && filename.endsWith('.json')) {
    const hash = filename.replace('.json', '');
    mainWindow?.webContents.send('metadata-external-change', hash);
  }
});

ipcMain.handle('load-metadata', async (_, hash) => {
  try {
    if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });
    const file = require('path').join(METADATA_DIR, `${hash}.json`);
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('[metadata] load error:', e.message);
    return [];
  }
});

ipcMain.handle('save-metadata', async (_, hash, data) => {
  try {
    if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });
    const file = require('path').join(METADATA_DIR, `${hash}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.error('[metadata] save error:', e.message);
    return false;
  }
});

// ─── IPC: Upload chunk ke Discord webhook (dari main process, non-blocking) ──
ipcMain.handle('upload-chunk', async (_, webhookUrl, chunkB64, filename) => {
  try {
    const buffer = Buffer.from(chunkB64, 'base64');

    // Buat multipart/form-data manual — net.fetch Electron butuh Uint8Array body
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

    console.log('[upload-chunk] sending', filename, bodyBuf.length, 'bytes to', webhookUrl.slice(0, 60));

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

// ─── IPC: Upload file besar langsung dari path (Parallel 8 Chunks with Throttle) ──
ipcMain.handle('upload-file-from-path', async (event, webhookUrl, nativePath, destName) => {
  try {
    const stats = fs.statSync(nativePath);
    const totalSize = stats.size;
    const CHUNK = 8 * 1024 * 1024; // 8MB
    const numChunks = Math.ceil(totalSize / CHUNK) || 1;
    const filename = destName || require('path').basename(nativePath);
    const messageIds = new Array(numChunks);
    const fd = fs.openSync(nativePath, 'r');

    let completedChunks = 0;
    let activeUploads = 0;
    let nextChunkIndex = 0;

    return new Promise((resolve, reject) => {
      async function uploadNext() {
        if (completedChunks === numChunks) {
          fs.closeSync(fd);
          return resolve({ ok: true, messageIds, size: totalSize });
        }

        while (activeUploads < 8 && nextChunkIndex < numChunks) {
          const index = nextChunkIndex++;
          activeUploads++;
          uploadChunk(index);
        }
      }

      async function uploadChunk(index, retryCount = 0) {
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

          const response = await net.fetch(webhookUrl + '?wait=true', {
            method: 'POST',
            headers: {
              'Content-Type': 'multipart/form-data; boundary=' + boundary,
              'User-Agent': 'Mozilla/5.0 Disbox/2.0',
            },
            body,
          });

          const text = await response.text();

          if (response.status === 429) {
            const retryAfter = JSON.parse(text).retry_after || 5;
            console.warn(`[upload] Rate limited on chunk ${index}, retrying in ${retryAfter}s...`);
            setTimeout(() => uploadChunk(index, retryCount + 1), (retryAfter * 1000) + 500);
            return;
          }

          if (!response.ok) {
            throw new Error(`Status ${response.status}: ${text.slice(0, 100)}`);
          }

          const data = JSON.parse(text);
          messageIds[index] = data.id;
          
          activeUploads--;
          completedChunks++;
          event.sender.send('upload-progress', completedChunks / numChunks);
          uploadNext();
        } catch (e) {
          if (retryCount < 3) {
            console.error(`[upload] Error on chunk ${index}, retry ${retryCount + 1}:`, e.message);
            setTimeout(() => uploadChunk(index, retryCount + 1), 2000);
          } else {
            fs.closeSync(fd);
            reject(new Error(`Gagal upload chunk ${index} setelah 3 kali coba: ${e.message}`));
          }
        }
      }

      uploadNext();
    });
  } catch (e) {
    console.error('[upload-path] Fatal error:', e.message);
    return { ok: false, error: e.message };
  }
});
