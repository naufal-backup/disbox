import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { DisboxAPI, buildTree } from './utils/disbox.js';

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
  const [theme, setTheme] = useState(() => localStorage.getItem('disbox_theme') || 'dark');
  const [uiScale, setUiScale] = useState(() => Number(localStorage.getItem('disbox_ui_scale')) || 1);
  const [chunkSize, setChunkSize] = useState(() => Number(localStorage.getItem('disbox_chunk_size')) || 8 * 1024 * 1024);
  const [showPreviews, setShowPreviews] = useState(() => localStorage.getItem('disbox_show_previews') !== 'false');
  const [metadataStatus, setMetadataStatus] = useState({ status: 'synced', items: 0 });
  const [closeToTray, setCloseToTray] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);

  const abortControllersRef = useRef(new Map());

  useEffect(() => {
    if (window.electron?.getPrefs) {
      window.electron.getPrefs().then(p => {
        setCloseToTray(p.closeToTray);
        setStartMinimized(p.startMinimized);
      });
    }
  }, []);

  const updatePrefs = useCallback((newPrefs) => {
    if (window.electron?.setPrefs) {
      window.electron.setPrefs(newPrefs).then(p => {
        if (p.closeToTray !== undefined) setCloseToTray(p.closeToTray);
        if (p.startMinimized !== undefined) setStartMinimized(p.startMinimized);
      });
    }
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

  // Background polling for changes (every 30 seconds)
  useEffect(() => {
    if (!isConnected || !api) return;
    const interval = setInterval(() => {
      refresh(true);
    }, 30000);
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

  const getTransferSignal = useCallback((id) => {
    return abortControllersRef.current.get(id)?.signal ?? null;
  }, []);

  return (
    <AppContext.Provider value={{
      api, webhookUrl, isConnected, files, fileTree,
      currentPath, setCurrentPath,
      loading, transfers, savedWebhooks,
      theme, toggleTheme,
      uiScale, setUiScale,
      chunkSize, setChunkSize,
      showPreviews, setShowPreviews,
      metadataStatus,
      closeToTray, startMinimized, updatePrefs,
      isTransferring,
      connect, disconnect, refresh,
      createFolder, movePath, copyPath, deletePath,
      bulkDelete, bulkMove, bulkCopy,
      getAllDirs,
      addTransfer, updateTransfer, removeTransfer,
      cancelTransfer, getTransferSignal,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
