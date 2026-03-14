import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { DisboxAPI, buildTree } from './utils/disbox.js';
import { translations } from './utils/i18n.js';

const AppContext = createContext(null);

const SAVED_WEBHOOKS_KEY = 'disbox_saved_webhooks';

function getSavedWebhooks() {
  try { return JSON.parse(localStorage.getItem(SAVED_WEBHOOKS_KEY) || '[]'); }
  catch { return []; }
}

function saveWebhookToList(url, label) {
  const list = getSavedWebhooks();
  const existing = list.findIndex(w => w.url === url);
  const entry = { url, label: label || extractWebhookLabel(url), lastUsed: Date.now() };
  if (existing >= 0) list[existing] = entry;
  else list.unshift(entry);
  localStorage.setItem(SAVED_WEBHOOKS_KEY, JSON.stringify(list.slice(0, 20)));
}

function extractWebhookLabel(url) {
  const parts = url.split('/');
  return parts[parts.length - 2] ? `Webhook #${parts[parts.length - 2].slice(-6)}` : 'Unnamed';
}

export function AppProvider({ children }) {
  const [api, setApi] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem('disbox_webhook') || '');
  
  const [isConnected, setIsConnected] = useState(false);
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState([]);
  
  // Helper to check if any transfer is active
  const isTransferring = transfers.some(t => t.status === 'active');

  const [savedWebhooks, setSavedWebhooks] = useState(getSavedWebhooks);
  const [language, setLanguage] = useState(() => localStorage.getItem('disbox_lang') || 'id');
  const [theme, setTheme] = useState(() => localStorage.getItem('disbox_theme') || 'dark');
  const [uiScale, setUiScale] = useState(() => Number(localStorage.getItem('disbox_ui_scale')) || 1);
  const [chunkSize, setChunkSize] = useState(() => Number(localStorage.getItem('disbox_chunk_size')) || 8 * 1024 * 1024);
  const [showPreviews, setShowPreviews] = useState(() => localStorage.getItem('disbox_show_previews') !== 'false');
  const [showImagePreviews, setShowImagePreviews] = useState(() => localStorage.getItem('disbox_show_image_previews') !== 'false');
  const [showVideoPreviews, setShowVideoPreviews] = useState(() => localStorage.getItem('disbox_show_video_previews') !== 'false');
  const [showRecent, setShowRecent] = useState(() => localStorage.getItem('disbox_show_recent') !== 'false');
  const [autoCloseTransfers, setAutoCloseTransfers] = useState(() => localStorage.getItem('disbox_auto_close_transfers') !== 'false');
  const [animationsEnabled, setAnimationsEnabled] = useState(() => localStorage.getItem('disbox_animations_enabled') !== 'false');
  const [metadataStatus, setMetadataStatus] = useState({ status: 'synced', items: 0 });
  const [closeToTray, setCloseToTray] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [pinExists, setPinExists] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [cloudSaveEnabled, setCloudSaveEnabled] = useState(
    () => localStorage.getItem('disbox_cloudsave_enabled') === 'true'
  );
  const [cloudSaves, setCloudSaves] = useState([]);

  const abortControllersRef = useRef(new Map());

  useEffect(() => {
    localStorage.setItem('disbox_animations_enabled', animationsEnabled.toString());
  }, [animationsEnabled]);

  useEffect(() => {
    if (window.electron?.getPrefs) {
      window.electron.getPrefs().then(p => {
        if (p.closeToTray !== undefined) setCloseToTray(p.closeToTray);
        if (p.startMinimized !== undefined) setStartMinimized(p.startMinimized);
        if (p.autoCloseTransfers !== undefined) setAutoCloseTransfers(p.autoCloseTransfers);
      });
    }
  }, []);

  const updatePrefs = useCallback((prefs) => {
    if (prefs.closeToTray !== undefined) setCloseToTray(prefs.closeToTray);
    if (prefs.startMinimized !== undefined) setStartMinimized(prefs.startMinimized);
    if (prefs.showRecent !== undefined) {
      setShowRecent(prefs.showRecent);
      localStorage.setItem('disbox_show_recent', prefs.showRecent.toString());
    }
    if (prefs.autoCloseTransfers !== undefined) {
      setAutoCloseTransfers(prefs.autoCloseTransfers);
      localStorage.setItem('disbox_auto_close_transfers', prefs.autoCloseTransfers.toString());
    }
    if (prefs.showPreviews !== undefined) {
      setShowPreviews(prefs.showPreviews);
      localStorage.setItem('disbox_show_previews', prefs.showPreviews.toString());
    }
    if (prefs.showImagePreviews !== undefined) {
      setShowImagePreviews(prefs.showImagePreviews);
      localStorage.setItem('disbox_show_image_previews', prefs.showImagePreviews.toString());
    }
    if (prefs.showVideoPreviews !== undefined) {
      setShowVideoPreviews(prefs.showVideoPreviews);
      localStorage.setItem('disbox_show_video_previews', prefs.showVideoPreviews.toString());
    }
    if (window.electron?.setPrefs) window.electron.setPrefs(prefs);
  }, []);

  useEffect(() => {
    if (!window.electron?.onMetadataStatus) return;
    return window.electron.onMetadataStatus((data) => {
      setMetadataStatus(data);
    });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('disbox_theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('disbox_lang', language);
  }, [language]);

  const t = useCallback((key, params = null) => {
    let text = translations[language]?.[key] || translations['en']?.[key] || key;
    if (params) {
      Object.keys(params).forEach(k => {
        text = text.replace(`{${k}}`, params[k]);
      });
    }
    return text;
  }, [language]);

  useEffect(() => {
    document.body.style.zoom = uiScale;
    localStorage.setItem('disbox_ui_scale', uiScale.toString());
  }, [uiScale]);

  useEffect(() => {
    localStorage.setItem('disbox_chunk_size', chunkSize.toString());
    if (api) api.chunkSize = chunkSize;
  }, [chunkSize, api]);

  useEffect(() => {
    localStorage.setItem('disbox_show_previews', showPreviews.toString());
  }, [showPreviews]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const connect = useCallback(async (url, metadataId = null) => {
    setLoading(true);
    setIsConnected(false);
    setPinExists(null);
    setFiles([]);
    setFileTree(null);
    setCurrentPath('/');
    setTransfers([]);
    setMetadataStatus({ status: 'synced', items: 0 });

    abortControllersRef.current.forEach(controller => controller.abort());
    abortControllersRef.current.clear();

    try {
      const instance = new DisboxAPI(url);
      await instance.init(metadataId);
      const fs = await instance.getFileSystem();

      localStorage.setItem('disbox_webhook', url);
      saveWebhookToList(url);
      setSavedWebhooks(getSavedWebhooks());

      window.electron?.setActiveWebhook(url, instance.hashedWebhook);

      setWebhookUrl(url);
      setApi(instance);
      setFiles(fs);
      setFileTree(buildTree(fs));
      setIsConnected(true);
      return { ok: true };
    } catch (e) {
      console.error('Connect failed:', e);
      return { ok: false, reason: 'unknown', message: e.message };
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    abortControllersRef.current.forEach(controller => controller.abort());
    abortControllersRef.current.clear();

    localStorage.removeItem('disbox_webhook');
    setApi(null);
    setWebhookUrl('');
    setIsConnected(false);
    setPinExists(null);
    setFiles([]);
    setFileTree(null);
    setCurrentPath('/');
    setTransfers([]);
  }, []);

  const refresh = useCallback(async (silent = false) => {
    if (!api) return;
    if (!silent) setLoading(true);
    try {
      await api.syncMetadata();
      const fs = await api.getFileSystem();
      setFiles(fs);
      setFileTree(buildTree(fs));
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [api]);

  // Background polling for changes (every 5 seconds)
  useEffect(() => {
    if (!isConnected || !api) return;
    const interval = setInterval(() => {
      refresh(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, api, refresh]);

  useEffect(() => {
    if (!api || !webhookUrl) return;
    window.electron?.setActiveWebhook(webhookUrl, api.hashedWebhook);
  }, [api, webhookUrl]);

  useEffect(() => {
    if (!window.electron?.onMetadataChange || !api) return;
    const cleanup = window.electron.onMetadataChange((hash) => {
      if (api.hashedWebhook === hash) {
        refresh();
      }
    });
    return cleanup;
  }, [api, refresh]);

  const createFolder = useCallback(async (folderName) => {
    if (!api || !folderName.trim()) return false;
    const dirPath = currentPath === '/' ? '' : currentPath.slice(1);
    const folderPath = dirPath ? `${dirPath}/${folderName.trim()}/.keep` : `${folderName.trim()}/.keep`;
    try {
      await api.createFile(folderPath, [], 0);
      await refresh();
      return true;
    } catch (e) {
      console.error('Create folder failed:', e);
      return false;
    }
  }, [api, currentPath, refresh]);

  const movePath = useCallback(async (oldPath, destDir, id = null) => {
    if (!api) return false;
    const name = oldPath.split('/').pop();
    const newPath = destDir ? `${destDir}/${name}` : name;
    try {
      await api.renamePath(oldPath, newPath, id);
      await refresh();
      return true;
    } catch (e) {
      console.error('Move failed:', e);
      return false;
    }
  }, [api, refresh]);

  const copyPath = useCallback(async (oldPath, destDir, id = null) => {
    if (!api) return false;
    const name = oldPath.split('/').pop();
    const newPath = destDir ? `${destDir}/${name}` : name;
    try {
      await api.copyPath(oldPath, newPath, id);
      await refresh();
      return true;
    } catch (e) {
      console.error('Copy failed:', e);
      return false;
    }
  }, [api, refresh]);

  const deletePath = useCallback(async (path, id = null) => {
    if (!api) return false;
    try {
      await api.deletePath(path, id);
      await refresh();
      return true;
    } catch (e) {
      console.error('Delete failed:', e);
      return false;
    }
  }, [api, refresh]);

  const bulkDelete = useCallback(async (paths) => {
    if (!api) return false;
    try {
      await api.bulkDelete(paths);
      await refresh();
      return true;
    } catch (e) {
      console.error('Bulk delete failed:', e);
      return false;
    }
  }, [api, refresh]);

  const bulkMove = useCallback(async (paths, destDir) => {
    if (!api) return false;
    try {
      await api.bulkMove(paths, destDir);
      await refresh();
      return true;
    } catch (e) {
      console.error('Bulk move failed:', e);
      return false;
    }
  }, [api, refresh]);

  const bulkCopy = useCallback(async (paths, destDir) => {
    if (!api) return false;
    try {
      await api.bulkCopy(paths, destDir);
      await refresh();
      return true;
    } catch (e) {
      console.error('Bulk copy failed:', e);
      return false;
    }
  }, [api, refresh]);

  const setLocked = useCallback(async (id, isLocked) => {
    if (!api) return false;
    try {
      const hash = api.hashedWebhook;
      
      // Find the item to check if it's a folder
      const target = files.find(f => f.id === id);
      if (target) {
        // It's a file
        await window.electron.setLocked(id, hash, isLocked);
      } else {
        // It's a folder path
        const folderPath = id; 
        const affectedFiles = files.filter(f => f.path === folderPath || f.path.startsWith(folderPath + '/'));
        for (const f of affectedFiles) {
          await window.electron.setLocked(f.id, hash, isLocked);
        }
      }
      
      await refresh();
      return true;
    } catch (e) {
      console.error('Set locked failed:', e);
      return false;
    }
  }, [api, files, refresh]);

  const verifyPin = useCallback(async (pin) => {
    if (!api) return false;
    const ok = await window.electron.verifyPin(api.hashedWebhook, pin);
    if (ok) setIsVerified(true);
    return ok;
  }, [api]);

  const setPin = useCallback(async (pin) => {
    if (!api) return false;
    return await window.electron.setPin(api.hashedWebhook, pin);
  }, [api]);

  const hasPin = useCallback(async () => {
    if (!api) return false;
    const exists = await window.electron.hasPin(api.hashedWebhook);
    setPinExists(exists);
    return exists;
  }, [api]);

  useEffect(() => {
    if (isConnected) hasPin();
  }, [isConnected, hasPin]);

  // Background check for PIN (useful if metadata syncs in background)
  useEffect(() => {
    if (!isConnected || !api) return;
    const interval = setInterval(() => {
      hasPin();
    }, 10000);
    return () => clearInterval(interval);
  }, [isConnected, api, hasPin]);

  const removePin = useCallback(async (pin) => {
    if (!api) return false;
    const ok = await window.electron.verifyPin(api.hashedWebhook, pin);
    if (ok) {
      await window.electron.removePin(api.hashedWebhook);
      setIsVerified(false);
      return true;
    }
    return false;
  }, [api]);

  const setStarred = useCallback(async (id, isStarred) => {
    if (!api) return false;
    try {
      const hash = api.hashedWebhook;
      const target = files.find(f => f.id === id);
      if (target) {
        // It's a file
        await window.electron.setStarred(id, hash, isStarred);
      } else {
        // It's a folder path (id is the path)
        // Find the .keep file for this folder
        const keepFile = files.find(f => f.path === (id ? `${id}/.keep` : '.keep'));
        if (keepFile) {
          await window.electron.setStarred(keepFile.id, hash, isStarred);
        }
      }
      await refresh();
      return true;
    } catch (e) {
      console.error('Set starred failed:', e);
      return false;
    }
  }, [api, files, refresh]);

  const getAllDirs = useCallback(() => {
    const dirs = new Set(['/']);
    files.forEach(f => {
      const parts = f.path.split('/').filter(Boolean);
      for (let i = 1; i <= parts.length - 1; i++) {
        dirs.add('/' + parts.slice(0, i).join('/'));
      }
    });
    return [...dirs].sort();
  }, [files]);

  const addTransfer = useCallback((t) => {
    const controller = new AbortController();
    abortControllersRef.current.set(t.id, controller);
    setTransfers(p => [...p, { ...t, signal: controller.signal }]);
    return controller.signal;
  }, []);

  const updateTransfer = useCallback((id, u) => {
    setTransfers(p => p.map(t => t.id === id ? { ...t, ...u } : t));
  }, []);

  const removeTransfer = useCallback((id) => {
    abortControllersRef.current.delete(id);
    setTransfers(p => p.filter(t => t.id !== id));
  }, []);

  const cancelTransfer = useCallback((id) => {
    const controller = abortControllersRef.current.get(id);
    if (controller) {
      controller.abort();
    }

    if (window.electron?.cancelUpload) {
      window.electron.cancelUpload(id);
    }

    setTransfers(p => p.map(t =>
      t.id === id ? { ...t, status: 'cancelled' } : t
    ));
    setTimeout(() => {
      abortControllersRef.current.delete(id);
      setTransfers(p => p.filter(t => t.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    localStorage.setItem('disbox_cloudsave_enabled', cloudSaveEnabled.toString());
  }, [cloudSaveEnabled]);

  const loadCloudSaves = useCallback(async () => {
    if (!api) return;
    const entries = await window.electron.cloudsaveGetAll(api.hashedWebhook);
    setCloudSaves(entries);
  }, [api]);

  useEffect(() => {
    if (isConnected) loadCloudSaves();
  }, [isConnected, loadCloudSaves]);

  const addCloudSave = useCallback(async (name, localPath) => {
    if (!api) return;
    const discordPath = `cloudsave/${name}/`;
    const id = await window.electron.cloudsaveAdd(api.hashedWebhook, {
      name,
      local_path: localPath,
      discord_path: discordPath
    });
    await loadCloudSaves();
    return id;
  }, [api, loadCloudSaves]);

  const removeCloudSave = useCallback(async (id) => {
    await window.electron.cloudsaveRemove(id);
    await loadCloudSaves();
  }, [loadCloudSaves]);

  const syncCloudSave = useCallback(async (id) => {
    return await window.electron.cloudsaveSyncEntry(id);
  }, []);

  const setLocalPath = useCallback(async (id, localPath) => {
    await window.electron.cloudsaveUpdate(id, { local_path: localPath });
    await loadCloudSaves();
  }, [loadCloudSaves]);

  // Handle Cloud Save Upload trigger from main process
  useEffect(() => {
    if (!window.electron?.onCloudSaveDoUpload || !api) return;
    
    const cleanup = window.electron.onCloudSaveDoUpload(async (entry) => {
      console.log('[cloudsave] Uploading folder:', entry.local_path);
      try {
        const uploadRecursive = async (localDir, remoteDir) => {
          const contents = await window.electron.listDirectory(localDir);
          for (const item of contents) {
            const remotePath = `${remoteDir}${item.name}`;
            if (item.isDirectory) {
              await uploadRecursive(item.path, `${remotePath}/`);
            } else {
              const transferId = `cloudsave-${entry.id}-${Date.now()}`;
              // Use api.uploadFile which handles both upload and metadata registration
              await api.uploadFile(
                { nativePath: item.path }, 
                remotePath,
                (p) => console.log(`[cloudsave] ${item.name} progress: ${p}`),
                null,
                transferId
              );
            }
          }
        };

        await uploadRecursive(entry.local_path, entry.discord_path);
        
        // Final flush and sync
        if (window.electron?.flushMetadata) {
          await window.electron.flushMetadata(webhookUrl, api.hashedWebhook);
        }
        await api.syncMetadata();
        
        window.electron.cloudsaveUploadResult(entry.id, true);
        await loadCloudSaves();
      } catch (e) {
        console.error('[cloudsave] Upload failed:', e);
        window.electron.cloudsaveUploadResult(entry.id, false);
      }
    });
    
    return cleanup;
  }, [api, webhookUrl, chunkSize, loadCloudSaves]);

  // Handle single file upload from chokidar
  useEffect(() => {
    if (!window.electron?.onCloudSaveDoUploadFile || !api) return;
    
    const cleanup = window.electron.onCloudSaveDoUploadFile(async ({ id, filePath, discordPath }) => {
      try {
        const transferId = `cloudsave-file-${id}-${Date.now()}`;
        const result = await window.electron.uploadFileFromPath(
          webhookUrl,
          filePath,
          discordPath,
          (p) => {},
          transferId,
          chunkSize
        );
        
        if (result.ok) {
          // Update metadata in Disbox
          const { messageIds, size } = result;
          await api.createFile(discordPath, messageIds, size);
          await api.syncMetadata();
          window.electron.cloudsaveUploadFileResult(id, discordPath, true);
          await loadCloudSaves();
        } else {
          window.electron.cloudsaveUploadFileResult(id, discordPath, false);
        }
      } catch (e) {
        console.error('[cloudsave] Single file upload failed:', e);
        window.electron.cloudsaveUploadFileResult(id, discordPath, false);
      }
    });
    
    return cleanup;
  }, [api, webhookUrl, chunkSize, loadCloudSaves]);

  useEffect(() => {
    if (!window.electron?.onCloudsaveLocalMissing) return;
    const cleanup = window.electron.onCloudsaveLocalMissing(({ id }) => {
      setCloudSaves(prev => prev.map(s => s.id === id ? { ...s, local_path: null, status: 'local_missing' } : s));
    });
    return cleanup;
  }, []);

  useEffect(() => {
    if (!window.electron?.onCloudSaveSyncStatus) return;
    const cleanup = window.electron.onCloudSaveSyncStatus((data) => {
      setCloudSaves(prev => prev.map(s => s.id === data.id ? { ...s, ...data } : s));
    });
    return cleanup;
  }, []);

  const restoreCloudSave = useCallback(async (id, force = false) => {
    if (!api) return { ok: false, reason: 'api_not_initialized' };

    // Ensure metadata is fresh before restore
    setLoading(true);
    try {
      await api.syncMetadata();
      const res = await window.electron.cloudsaveRestore(id, force);
      if (res.ok) await loadCloudSaves();
      return res;
    } catch (e) {
      console.error('[cloudsave] restoreCloudSave failed:', e);
      return { ok: false, reason: e.message };
    } finally {
      setLoading(false);
    }
  }, [api, loadCloudSaves]);

  const exportCloudSave = useCallback(async (id) => {
    if (!api) return { ok: false, reason: 'api_not_initialized' };

    setLoading(true);
    try {
      await api.syncMetadata();
      return await window.electron.cloudsaveExportZip(id);
    } catch (e) {
      console.error('[cloudsave] exportCloudSave failed:', e);
      return { ok: false, reason: e.message };
    } finally {
      setLoading(false);
    }
  }, [api]);

  const getCloudSaveStatus = useCallback(async (id) => {
    return await window.electron.cloudsaveGetStatus(id);
  }, []);

  const getTransferSignal = useCallback((id) => {
    return abortControllersRef.current.get(id)?.signal ?? null;
  }, []);

  return (
    <AppContext.Provider value={{
      api, webhookUrl, isConnected, files, fileTree,
      currentPath, setCurrentPath,
      loading, transfers, savedWebhooks,
      language, setLanguage, t,
      theme, toggleTheme,
      uiScale, setUiScale,
      chunkSize, setChunkSize,
      showPreviews, setShowPreviews,
      showImagePreviews, setShowImagePreviews,
      showVideoPreviews, setShowVideoPreviews,
      showRecent, setShowRecent,
      autoCloseTransfers, setAutoCloseTransfers,
      animationsEnabled, setAnimationsEnabled,
      metadataStatus,
      closeToTray, startMinimized, updatePrefs,
      isVerified, setIsVerified,
      pinExists, setPinExists,
      isSidebarOpen, setIsSidebarOpen,
      isTransferring,
      cloudSaveEnabled, setCloudSaveEnabled,
      cloudSaves, loadCloudSaves, addCloudSave, removeCloudSave,
      exportCloudSave, syncCloudSave, setLocalPath,
      restoreCloudSave, getCloudSaveStatus,
      connect, disconnect, refresh,
      createFolder, movePath, copyPath, deletePath,
      bulkDelete, bulkMove, bulkCopy,
      setLocked, setStarred, verifyPin, setPin, hasPin, removePin,
      getAllDirs,
      addTransfer, updateTransfer, removeTransfer,
      cancelTransfer, getTransferSignal,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
