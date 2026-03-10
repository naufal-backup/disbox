import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { DisboxAPI, buildTree } from './utils/disbox.js';

const AppContext = createContext(null);

// Simpan daftar webhook yang pernah dipakai
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
  const [savedWebhooks, setSavedWebhooks] = useState(getSavedWebhooks);
  const [theme, setTheme] = useState(() => localStorage.getItem('disbox_theme') || 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('disbox_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  const connect = useCallback(async (url) => {
    setLoading(true);
    try {
      const instance = new DisboxAPI(url);
      await instance.init();
      const fs = await instance.getFileSystem();

      localStorage.setItem('disbox_webhook', url);
      saveWebhookToList(url);
      setSavedWebhooks(getSavedWebhooks());

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
    localStorage.removeItem('disbox_webhook');
    setApi(null);
    setWebhookUrl('');
    setIsConnected(false);
    setFiles([]);
    setFileTree(null);
    setCurrentPath('/');
    setTransfers([]);
  }, []);

  const refresh = useCallback(async (syncToDiscord = false) => {
    if (!api) return;
    setLoading(true);
    try {
      const fs = await api.getFileSystem();
      setFiles(fs);
      setFileTree(buildTree(fs));
      if (syncToDiscord) {
        await api.uploadMetadataToDiscord(fs);
      }
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setLoading(false);
    }
  }, [api]);

  // Listen for external changes to JSON metadata (manual edits etc)
  useEffect(() => {
    if (!window.electron?.onMetadataChange || !api) return;
    const cleanup = window.electron.onMetadataChange((hash) => {
      if (api.hashedWebhook === hash) {
        refresh(true); // Reload and sync to Discord
      }
    });
    return cleanup;
  }, [api, refresh]);

  // ─── Create folder ──────────────────────────────────────────────────────────
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

  // ─── Move path (file/folder) ────────────────────────────────────────────────
  const movePath = useCallback(async (oldPath, destDir) => {
    if (!api) return false;
    const name = oldPath.split('/').pop();
    const newPath = destDir ? `${destDir}/${name}` : name;
    try {
      await api.renamePath(oldPath, newPath);
      await refresh();
      return true;
    } catch (e) {
      console.error('Move failed:', e);
      return false;
    }
  }, [api, refresh]);

  // ─── Copy path (file/folder) ────────────────────────────────────────────────
  const copyPath = useCallback(async (oldPath, destDir) => {
    if (!api) return false;
    const name = oldPath.split('/').pop();
    const newPath = destDir ? `${destDir}/${name}` : name;
    try {
      await api.copyPath(oldPath, newPath);
      await refresh();
      return true;
    } catch (e) {
      console.error('Copy failed:', e);
      return false;
    }
  }, [api, refresh]);

  // ─── Delete path (file/folder) ──────────────────────────────────────────────
  const deletePath = useCallback(async (path) => {
    if (!api) return false;
    try {
      await api.deletePath(path);
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

  // ─── Get all directories ────────────────────────────────────────────────────
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

  const addTransfer = useCallback((t) => setTransfers(p => [...p, t]), []);
  const updateTransfer = useCallback((id, u) => setTransfers(p => p.map(t => t.id === id ? { ...t, ...u } : t)), []);
  const removeTransfer = useCallback((id) => setTransfers(p => p.filter(t => t.id !== id)), []);

  return (
    <AppContext.Provider value={{
      api, webhookUrl, isConnected, files, fileTree,
      currentPath, setCurrentPath,
      loading, transfers, savedWebhooks,
      theme, toggleTheme,
      connect, disconnect, refresh,
      createFolder, movePath, copyPath, deletePath, 
      bulkDelete, bulkMove, bulkCopy,
      getAllDirs,
      addTransfer, updateTransfer, removeTransfer,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
