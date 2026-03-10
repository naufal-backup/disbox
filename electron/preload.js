const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close:    () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Network (no CORS — goes through Node.js in main process)
  fetch: (url, options) => ipcRenderer.invoke('net-fetch', url, options),
  proxyDownload: (url) => ipcRenderer.invoke('proxy-download', url),

  // File I/O
  openFiles:  ()             => ipcRenderer.invoke('dialog-open-files'),
  saveFile:   (filename)     => ipcRenderer.invoke('dialog-save-file', filename),
  readFile:   (filePath)     => ipcRenderer.invoke('read-file', filePath),
  writeFile:  (savePath, data) => ipcRenderer.invoke('save-file', { savePath, data }),
  openPath:   (filePath)     => ipcRenderer.invoke('open-path', filePath),

  getVersion: () => ipcRenderer.invoke('get-version'),

  // Upload chunk via main process (non-blocking, no UI freeze)
  uploadChunk: (webhookUrl, chunkB64, filename) =>
    ipcRenderer.invoke('upload-chunk', webhookUrl, chunkB64, filename),

  // Upload file besar langsung dari path — tidak load ke RAM
  uploadFileFromPath: (webhookUrl, nativePath, destPath, onProgress) => {
    const listener = (_, p) => onProgress?.(p);
    ipcRenderer.on('upload-progress', listener);
    return ipcRenderer.invoke('upload-file-from-path', webhookUrl, nativePath, destPath)
      .finally(() => ipcRenderer.removeListener('upload-progress', listener));
  },

  // Local metadata storage (replaces software.disbox.app)
  loadMetadata: (hash) => ipcRenderer.invoke('load-metadata', hash),
  saveMetadata: (hash, data) => ipcRenderer.invoke('save-metadata', hash, data),
  onMetadataChange: (callback) => {
    const listener = (_, hash) => callback(hash);
    ipcRenderer.on('metadata-external-change', listener);
    return () => ipcRenderer.removeListener('metadata-external-change', listener);
  }
});
