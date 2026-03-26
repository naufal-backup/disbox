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
  listDirectory: (dirPath)      => ipcRenderer.invoke('list-directory', dirPath),
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

  // Upload file besar dari path
  uploadFileFromPath: (webhookUrl, nativePath, destPath, onProgress, transferId, chunkSize) => {
    const progressChannel = 'upload-progress-' + transferId;
    const listener = (_, pct) => onProgress(pct);
    ipcRenderer.on(progressChannel, listener);
    return ipcRenderer
      .invoke('upload-file-from-path', webhookUrl, nativePath, destPath, transferId, chunkSize)
      .finally(() => ipcRenderer.removeListener(progressChannel, listener));
  },
  // Download with YT-DLP and Auto Upload
  ytdlpDownloadUpload: (url, type, webhookUrl, transferId, chunkSize, onProgress) => {
    const progressChannel = 'upload-progress-' + transferId;
    const listener = (_, pct) => onProgress(pct);
    ipcRenderer.on(progressChannel, listener);
    return ipcRenderer
      .invoke('ytdlp-download-upload', { url, type, webhookUrl, transferId, chunkSize })
      .finally(() => ipcRenderer.removeListener(progressChannel, listener));
  },


  // Cancel upload
  cancelUpload: (transferId) => ipcRenderer.send('cancel-upload', transferId),

  // Local metadata storage
  loadMetadata: (hash)        => ipcRenderer.invoke('load-metadata', hash),
  saveMetadata: (hash, data, msgId = null) => ipcRenderer.invoke('save-metadata', hash, data, msgId),
  getLatestMetadataMsgId: (hash) => ipcRenderer.invoke('get-latest-metadata-msgid', hash),
  flushMetadata: (webhookUrl, hash) => ipcRenderer.invoke('flush-metadata', webhookUrl, hash),
  setActiveWebhook: (webhookUrl, hash) => ipcRenderer.send('set-active-webhook', webhookUrl, hash),
  loadSyncId: (hash)          => ipcRenderer.invoke('load-syncid', hash),
  saveSyncId: (hash, msgId)   => ipcRenderer.invoke('save-syncid', hash, msgId),

  // Lock & PIN & Star
  setLocked: (id, hash, isLocked) => ipcRenderer.invoke('set-locked', id, hash, isLocked),
  setStarred: (id, hash, isStarred) => ipcRenderer.invoke('set-starred', id, hash, isStarred),
  setPin: (hash, pin)             => ipcRenderer.invoke('set-pin', hash, pin),
  verifyPin: (hash, pin)          => ipcRenderer.invoke('verify-pin', hash, pin),
  hasPin: (hash)                  => ipcRenderer.invoke('has-pin', hash),
  removePin: (hash)               => ipcRenderer.invoke('remove-pin', hash),

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

  // Cloud Save
  cloudsaveGetAll: (hash) => ipcRenderer.invoke('cloudsave-get-all', hash),
  cloudsaveAdd: (hash, entry) => ipcRenderer.invoke('cloudsave-add', hash, entry),
  cloudsaveUpdate: (id, fields) => ipcRenderer.invoke('cloudsave-update', id, fields),
  cloudsaveRemove: (id) => ipcRenderer.invoke('cloudsave-remove', id),
  cloudsaveExportZip: (id) => ipcRenderer.invoke('cloudsave-export-zip', id),
  cloudsaveSyncEntry: (id) => ipcRenderer.invoke('cloudsave-sync-entry', id),
  cloudsaveChooseFolder: () => ipcRenderer.invoke('cloudsave-choose-folder'),

  onCloudSaveSyncStatus: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('cloudsave-sync-status', listener);
    return () => ipcRenderer.removeListener('cloudsave-sync-status', listener);
  },
  onCloudSaveDoUpload: (callback) => {
    const listener = (_, entry) => callback(entry);
    ipcRenderer.on('cloudsave-do-upload', listener);
    return () => ipcRenderer.removeListener('cloudsave-do-upload', listener);
  },
  onCloudSaveDoUploadFile: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('cloudsave-do-upload-file', listener);
    return () => ipcRenderer.removeListener('cloudsave-do-upload-file', listener);
  },
  cloudsaveUploadResult: (id, success) => ipcRenderer.send(`cloudsave-upload-result-${id}`, success),
  cloudsaveUploadFileResult: (id, discordPath, success) => ipcRenderer.send(`cloudsave-upload-file-result-${id}-${discordPath}`, success),

  onCloudsaveLocalMissing: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('cloudsave-local-missing', listener);
    return () => ipcRenderer.removeListener('cloudsave-local-missing', listener);
  },
  cloudsaveGetStatus: (id) => ipcRenderer.invoke('cloudsave-get-status', id),
  cloudsaveRestore: (id, force) => ipcRenderer.invoke('cloudsave-restore', { id, force }),

  // ─── Share & Privacy ────────────────────────────────────────────────────────
  shareGetSettings: (hash) => ipcRenderer.invoke('share-get-settings', hash),
  shareSaveSettings: (hash, settings) => ipcRenderer.invoke('share-save-settings', hash, settings),
  shareDeployWorker: (data) => ipcRenderer.invoke('share-deploy-worker', data),
  shareGetLinks: (hash) => ipcRenderer.invoke('share-get-links', hash),
  shareCreateLink: (hash, data) => ipcRenderer.invoke('share-create-link', hash, data),
  shareRevokeLink: (hash, data) => ipcRenderer.invoke('share-revoke-link', hash, data),
  shareRevokeAll: (hash) => ipcRenderer.invoke('share-revoke-all', hash),
  shareOpenCFTokenPage: () => ipcRenderer.invoke('share-open-cf-token-page'),

  // ─── ffmpeg Video Thumbnail ──────────────────────────────────────────────────
  // Gunakan ffmpeg (system binary) untuk extract frame dari video
  // Lebih reliable dari canvas karena support semua codec dan tidak butuh moov atom di awal
  generateVideoThumbnail: (videoB64, ext) =>
    ipcRenderer.invoke('generate-video-thumbnail', videoB64, ext),
  checkFfmpeg: () =>
    ipcRenderer.invoke('check-ffmpeg'),
});
