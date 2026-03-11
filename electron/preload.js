const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Window controls
  minimize:    () => ipcRenderer.send('window-minimize'),
  maximize:    () => ipcRenderer.send('window-maximize'),
  close:       () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Network (no CORS — goes through Node.js in main process)
  fetch:         (url, options) => ipcRenderer.invoke('net-fetch', url, options),
  proxyDownload: (url, transferId) => ipcRenderer.invoke('proxy-download', url, transferId),

  // File I/O
  openFiles:  ()               => ipcRenderer.invoke('dialog-open-files'),
  saveFile:   (filename)       => ipcRenderer.invoke('dialog-save-file', filename),
  readFile:   (filePath)       => ipcRenderer.invoke('read-file', filePath),
  statFile:   (filePath)       => ipcRenderer.invoke('stat-file', filePath),
  writeFile:  (savePath, data) => ipcRenderer.invoke('save-file', { savePath, data }),
  openPath:   (filePath)       => ipcRenderer.invoke('open-path', filePath),

  getVersion: () => ipcRenderer.invoke('get-version'),

  confirm: (options) => ipcRenderer.invoke('dialog-confirm', options),

  getPrefs: () => ipcRenderer.invoke('get-prefs'),
  setPrefs: (prefs) => ipcRenderer.invoke('set-prefs', prefs),

  // Upload single chunk (dari renderer buffer)
  uploadChunk: (webhookUrl, chunkB64, filename) =>
    ipcRenderer.invoke('upload-chunk', webhookUrl, chunkB64, filename),

  // Upload file besar dari path — pakai transferId unik per transfer
  // sehingga progress channel dan cancel bisa diidentifikasi
  uploadFileFromPath: (webhookUrl, nativePath, destPath, onProgress, transferId, chunkSize) => {
    const progressChannel = 'upload-progress-' + transferId;
    const listener = (_, p) => onProgress?.(p);
    ipcRenderer.on(progressChannel, listener);
    return ipcRenderer
      .invoke('upload-file-from-path', webhookUrl, nativePath, destPath, transferId, chunkSize)
      .finally(() => ipcRenderer.removeListener(progressChannel, listener));
  },

  // Cancel upload yang sedang berjalan di main process
  cancelUpload: (transferId) => ipcRenderer.send('cancel-upload', transferId),

  // Local metadata storage
  loadMetadata: (hash)        => ipcRenderer.invoke('load-metadata', hash),
  saveMetadata: (hash, data, msgId = null) => ipcRenderer.invoke('save-metadata', hash, data, msgId),
  getLatestMetadataMsgId: (hash) => ipcRenderer.invoke('get-latest-metadata-msgid', hash),
  flushMetadata: (webhookUrl, hash) => ipcRenderer.invoke('flush-metadata', webhookUrl, hash),
  setActiveWebhook: (webhookUrl, hash) => ipcRenderer.send('set-active-webhook', webhookUrl, hash),
  loadSyncId: (hash)          => ipcRenderer.invoke('load-syncid', hash),
  saveSyncId: (hash, msgId)   => ipcRenderer.invoke('save-syncid', hash, msgId),
  onMetadataChange: (callback) => {
    const listener = (_, hash) => callback(hash);
    ipcRenderer.on('metadata-external-change', listener);
    return () => ipcRenderer.removeListener('metadata-external-change', listener);
  },
  onMetadataStatus: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('metadata-status', listener);
    return () => ipcRenderer.removeListener('metadata-status', listener);
  },

});
