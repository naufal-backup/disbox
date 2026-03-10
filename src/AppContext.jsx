import { createContext, useContext, useState, useCallback } from 'react';
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

  const refresh = useCallback(async () => {
    if (!api) return;
    setLoading(true);
    try {
      const fs = await api.getFileSystem();
      setFiles(fs);
      setFileTree(buildTree(fs));
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      setLoading(false);
    }
  }, [api]);

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

  // ─── Move file ──────────────────────────────────────────────────────────────
  const moveFile = useCallback(async (file, destDir) => {
    if (!api) return false;
    const fileName = file.path.split('/').pop();
    const newPath = destDir ? `${destDir}/${fileName}` : fileName;
    try {
      await api.renameFile(file.path, newPath);
      await refresh();
      return true;
    } catch (e) {
      console.error('Move failed:', e);
      return false;
    }
  }, [api, refresh]);

  // ─── Copy file ──────────────────────────────────────────────────────────────
  const copyFile = useCallback(async (file, destDir) => {
    if (!api) return false;
    const fileName = file.path.split('/').pop();
    const newPath = destDir ? `${destDir}/${fileName}` : fileName;
    try {
      // Copy = create new record with same messageIds
      await api.createFile(newPath, file.messageIds, file.size);
      await refresh();
      return true;
    } catch (e) {
      console.error('Copy failed:', e);
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
      connect, disconnect, refresh,
      createFolder, moveFile, copyFile, getAllDirs,
      addTransfer, updateTransfer, removeTransfer,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
