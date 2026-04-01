import { useState, useCallback, useEffect, useRef } from 'react';
import { DisboxAPI, buildTree } from './utils/disbox.js';
import { translations } from './utils/i18n.js';
import { clearThumbCache } from './utils/thumbnailCache.js';
import { AppContext } from './context/AppContextBase.jsx';
import {
  getSavedWebhooks, saveWebhookToList, updateWebhookLabel, removeWebhook
} from './utils/webhookHelpers.js';
import { useCloudSave } from './hooks/useCloudSave.js';

export function AppProvider({ children }) {  // ─── 1. States & Refs ──────────────────────────────────────────────────────
  const [api, setApi] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem('disbox_webhook') || '');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const isTransferring = transfers.some(t => t.status === 'active');

  const [savedWebhooks, setSavedWebhooks] = useState(getSavedWebhooks);
  const [language, setLanguage] = useState(() => localStorage.getItem('disbox_lang') || 'id');
  const [theme, setTheme] = useState(() => localStorage.getItem('disbox_theme') || 'dark');
  const [uiScale, setUiScale] = useState(() => Number(localStorage.getItem('disbox_ui_scale')) || 1);
  const [chunkSize, setChunkSize] = useState(() => {
    const saved = localStorage.getItem('disbox_chunk_size');
    if (!saved) return 7.5 * 1024 * 1024;
    let val = Number(saved);
    if (val >= 8 * 1024 * 1024) return 7.5 * 1024 * 1024;
    return val;
  });
  const [showPreviews, setShowPreviews] = useState(() => localStorage.getItem('disbox_show_previews') !== 'false');
  const [showImagePreviews, setShowImagePreviews] = useState(() => localStorage.getItem('disbox_show_image_previews') !== 'false');
  const [showVideoPreviews, setShowVideoPreviews] = useState(() => localStorage.getItem('disbox_show_video_previews') !== 'false');
  const [showAudioPreviews, setShowAudioPreviews] = useState(() => localStorage.getItem('disbox_show_audio_previews') !== 'false');
  const [showRecent, setShowRecent] = useState(() => localStorage.getItem('disbox_show_recent') !== 'false');
  const [autoCloseTransfers, setAutoCloseTransfers] = useState(() => localStorage.getItem('disbox_auto_close_transfers') !== 'false');
  const [animationsEnabled, setAnimationsEnabled] = useState(() => localStorage.getItem('disbox_animations_enabled') !== 'false');
  const [metadataStatus, setMetadataStatus] = useState({ status: 'synced', items: 0 });
  const [closeToTray, setCloseToTray] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);
  const [chunksPerMessage, setChunksPerMessage] = useState(1);
  const [isVerified, setIsVerified] = useState(false);
  const [pinExists, setPinExists] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [appLockEnabled, setAppLockEnabled] = useState(() => localStorage.getItem('disbox_app_lock_enabled') === 'true');
  const [appLockPin, setAppLockPin] = useState(() => localStorage.getItem('disbox_app_lock_pin') || '');
  const [isAppUnlocked, setIsAppUnlocked] = useState(false);
  const [cloudSaveEnabled, setCloudSaveEnabled] = useState(false);
  const [cloudSaves, setCloudSaves] = useState([]);
  const [shareEnabled, setShareEnabled] = useState(() => localStorage.getItem('disbox_share_enabled') !== 'false');
  const [shareMode, setShareMode] = useState(() => localStorage.getItem('disbox_share_mode') || 'public');
  const [shareLinks, setShareLinks] = useState([]);
  const [cfWorkerUrl, setCfWorkerUrl] = useState('');

  const [currentTrack, setCurrentTrack] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [pendingOperations, setPendingOperations] = useState({}); // { [path]: { type, progress, tempItem? } }

  const abortControllersRef = useRef(new Map());

  // ─── 2. Leaf Callbacks (No dependencies on other callbacks) ────────────────
  const t = useCallback((key, params = null) => {
    let text = translations[language]?.[key] || translations['en']?.[key] || key;
    if (params) { Object.keys(params).forEach(k => { text = text.replace(`{${k}}`, params[k]); }); }
    return text;
  }, [language]);

  const toggleTheme = useCallback(() => { setTheme(prev => prev === 'dark' ? 'light' : 'dark'); }, []);

  const unmarkPending = useCallback((path) => {
    setPendingOperations(prev => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  }, []);

  const addPendingItem = useCallback((path, tempItem, operationType = 'create') => {
    setPendingOperations(prev => ({
      ...prev,
      [path]: { type: operationType, progress: 0, tempItem }
    }));
  }, []);

  const updatePendingProgress = useCallback((path, progress) => {
    setPendingOperations(prev => {
      const current = prev[path];
      if (current) {
        return {
          ...prev,
          [path]: { ...current, progress }
        };
      }
      return prev;
    });
  }, []);

  const handleUpdateLabel = useCallback((url, label) => {
    if (updateWebhookLabel(url, label)) setSavedWebhooks(getSavedWebhooks());
  }, []);

  const handleRemoveWebhook = useCallback((url) => {
    removeWebhook(url);
    setSavedWebhooks(getSavedWebhooks());
  }, []);

  const handleAddWebhook = useCallback((url, label) => {
    saveWebhookToList(url, label);
    setSavedWebhooks(getSavedWebhooks());
  }, []);

  const updatePrefs = useCallback((prefs) => {
    if (prefs.closeToTray !== undefined) setCloseToTray(prefs.closeToTray);
    if (prefs.startMinimized !== undefined) setStartMinimized(prefs.startMinimized);
    if (prefs.chunksPerMessage !== undefined) setChunksPerMessage(prefs.chunksPerMessage);
    if (window.electron?.setPrefs) window.electron.setPrefs(prefs);
  }, []);

  // ─── 3. Intermediate Callbacks (Depend on leaf callbacks) ───────────────────
  const refresh = useCallback(async (silent = false) => {
    if (!api) return;
    if (!silent) setLoading(true);
    try {
      // 1. Ambil data lokal dulu agar instant (setelah local operation seperti create/delete)
      const fsLocal = await window.electron.loadMetadata(api.hashedWebhook);
      if (fsLocal) {
        setFiles(fsLocal);
        setFileTree(buildTree(fsLocal));
      }

      // 2. Sync background untuk memastikan data terbaru dari server
      await api.syncMetadata({ force: true });
      const fsSync = await api.getFileSystem();
      setFiles(fsSync);
      setFileTree(buildTree(fsSync));
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [api]);

  const loadShareLinks = useCallback(async () => {
    if (!api) return;
    try { const links = await window.electron.shareGetLinks(api.hashedWebhook); setShareLinks(links || []); }
    catch (e) { console.error('[share] loadShareLinks error:', e.message); }
  }, [api]);

  const createShareLink = useCallback(async (filePath, fileId, permission, expiresAt) => {
    if (!api) return { ok: false, reason: 'no_api' };
    const result = await window.electron.shareCreateLink(api.hashedWebhook, { filePath, fileId, permission, expiresAt });
    if (result.ok) await loadShareLinks();
    return result;
  }, [api, loadShareLinks]);

  const revokeShareLink = useCallback(async (id, token) => {
    if (!api) return false;
    const ok = await window.electron.shareRevokeLink(api.hashedWebhook, { id, token });
    if (ok) await loadShareLinks();
    return ok;
  }, [api, loadShareLinks]);

  const revokeAllLinks = useCallback(async () => {
    if (!api) return false;
    const ok = await window.electron.shareRevokeAll(api.hashedWebhook);
    if (ok) setShareLinks([]);
    return ok;
  }, [api]);

  const deployWorker = useCallback(async (apiToken) => {
    return await window.electron.shareDeployWorker({ apiToken });
  }, []);

  // ─── 4. High-level Callbacks (Business logic) ───────────────────────────────
  const connect = useCallback(async (url, options = {}) => {
    setIsConnecting(true);
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
      await instance.init(options);
      const fs = await instance.getFileSystem();

      const normalizedUrl = instance.webhookUrl;

      localStorage.setItem('disbox_webhook', normalizedUrl);
      
      const isCloudAccount = !!localStorage.getItem('dbx_username');
      if (!isCloudAccount) {
        saveWebhookToList(normalizedUrl);
        setSavedWebhooks(getSavedWebhooks());
      }

      window.electron?.setActiveWebhook(normalizedUrl, instance.hashedWebhook);

      setWebhookUrl(normalizedUrl);
      setApi(instance);
      setFiles(fs);
      setFileTree(buildTree(fs));
      setIsConnected(true);

      try {
        const shareSettings = await window.electron.shareGetSettings(instance.hashedWebhook);
        if (shareSettings) {
          setShareEnabled(!!shareSettings.enabled);
          setShareMode(shareSettings.mode || 'public');
          setCfWorkerUrl(shareSettings.cf_worker_url || '');
          
          await window.electron.shareSaveSettings(instance.hashedWebhook, {
            enabled: shareSettings.enabled,
            mode: shareSettings.mode || 'public',
            cf_worker_url: shareSettings.cf_worker_url || '',
            webhook_url: normalizedUrl
          });
        } else {
          await window.electron.shareSaveSettings(instance.hashedWebhook, {
            enabled: 1,
            mode: 'public',
            cf_worker_url: '',
            webhook_url: normalizedUrl
          });
          setShareEnabled(true);
          setShareMode('public');
          setCfWorkerUrl('');
        }
        const links = await window.electron.shareGetLinks(instance.hashedWebhook);
        setShareLinks(links || []);
      } catch (e) {
        console.warn('[share] Failed to load share settings:', e.message);
      }

      return { ok: true, instance };
    } catch (e) {
      console.error('Connect failed:', e);
      return { ok: false, reason: 'error', message: e.message };
    } finally {
      setIsConnecting(false);
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    abortControllersRef.current.forEach(controller => controller.abort());
    abortControllersRef.current.clear();

    clearThumbCache();
    localStorage.removeItem('disbox_webhook');
    localStorage.removeItem('dbx_username');
    setApi(null);
    setWebhookUrl('');
    setIsConnected(false);
    setPinExists(null);
    setIsVerified(false);
    setFiles([]);
    setFileTree(null);
    setCurrentPath('/');
    setTransfers([]);
    setShareLinks([]);
  }, []);

  const createFolder = useCallback(async (folderName) => {
    if (!api || !folderName.trim()) return false;
    const newFolderPath = (currentPath === '/' ? '' : currentPath.slice(1)) + folderName.trim();
    const placeholder = { path: newFolderPath + '/.keep', name: '.keep', size: 0, createdAt: Date.now() };
    
    addPendingItem(newFolderPath, placeholder, 'create');
    
    try {
      const entry = await api.createFolder(folderName.trim(), currentPath);
      if (entry) {
        setFiles(prev => {
          const exists = prev.some(f => f.path === entry.path);
          if (exists) return prev;
          const newList = [...prev, entry];
          setFileTree(buildTree(newList));
          return newList;
        });
      }
      await refresh(true);
      return true;
    }
    catch (e) { console.error('Create folder failed:', e); await refresh(); return false; }
    finally { unmarkPending(newFolderPath); }
  }, [api, currentPath, refresh, addPendingItem, unmarkPending]);

  const movePath = useCallback(async (oldPath, destDir, id = null) => {
    if (!api) return false;
    const name = oldPath.split('/').pop();
    const newPath = destDir ? `${destDir}/${name}` : name;
    try { await api.renamePath(oldPath, newPath, id); await refresh(true); return true; }
    catch (e) { console.error('Move failed:', e); await refresh(); return false; }
  }, [api, refresh]);

  const copyPath = useCallback(async (oldPath, destDir, id = null) => {
    if (!api) return false;
    const name = oldPath.split('/').pop();
    const newPath = destDir ? `${destDir}/${name}` : name;
    try { await api.copyPath(oldPath, newPath, id); await refresh(true); return true; }
    catch (e) { console.error('Copy failed:', e); await refresh(); return false; }
  }, [api, refresh]);

  const deletePath = useCallback(async (path, id = null) => {
    if (!api) return false;
    try { 
      await api.deletePath(path, id); 
      setFiles(prev => prev.filter(f => {
        if (id) return f.id !== id;
        return f.path !== path && !f.path.startsWith(path + '/');
      }));
      await refresh(true);
      return true; 
    }
    catch (e) { console.error('Delete failed:', e); await refresh(); return false; }
  }, [api, refresh]);

  const bulkDelete = useCallback(async (paths) => {
    if (!api) return false;
    try { 
      await api.bulkDelete(paths); 
      const pathSet = new Set(paths);
      setFiles(prev => prev.filter(f => {
        if (pathSet.has(f.id) || pathSet.has(f.path)) return false;
        for (const p of pathSet) {
          if (!p.includes('-') && f.path.startsWith(p + '/')) return false;
        }
        return true;
      }));
      await refresh(true);
      return true; 
    }
    catch (e) { console.error('Bulk delete failed:', e); await refresh(); return false; }
  }, [api, refresh]);

  const bulkMove = useCallback(async (paths, destDir) => {
    if (!api) return false;
    try { await api.bulkMove(paths, destDir); await refresh(true); return true; }
    catch (e) { console.error('Bulk move failed:', e); await refresh(); return false; }
  }, [api, refresh]);

  const bulkCopy = useCallback(async (paths, destDir) => {
    if (!api) return false;
    try { await api.bulkCopy(paths, destDir); await refresh(true); return true; }
    catch (e) { console.error('Bulk copy failed:', e); await refresh(); return false; }
  }, [api, refresh]);

  const setLocked = useCallback(async (id, isLocked) => {
    if (!api) return false;
    try {
      const hash = api.hashedWebhook;
      const target = files.find(f => f.id === id);
      if (target) {
        await window.electron.setLocked(id, hash, isLocked);
      } else {
        const folderPath = id;
        const affectedFiles = files.filter(f => f.path === folderPath || f.path.startsWith(folderPath + '/'));
        for (const f of affectedFiles) {
          await window.electron.setLocked(f.id, hash, isLocked);
        }
      }
      await refresh(); return true;
    } catch (e) { console.error('Set locked failed:', e); return false; }
  }, [api, files, refresh]);

  const setStarred = useCallback(async (id, isStarred) => {
    if (!api) return false;
    try {
      const hash = api.hashedWebhook;
      const target = files.find(f => f.id === id);
      if (target) {
        await window.electron.setStarred(id, hash, isStarred);
      } else {
        const keepFile = files.find(f => f.path === (id ? `${id}/.keep` : '.keep'));
        if (keepFile) await window.electron.setStarred(keepFile.id, hash, isStarred);
      }
      await refresh(); return true;
    } catch (e) { console.error('Set starred failed:', e); return false; }
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

  const saveShareSettings = useCallback(async (settings) => {
    if (!api) return false;
    const ok = await window.electron.shareSaveSettings(api.hashedWebhook, { ...settings, webhook_url: webhookUrl });
    if (ok) {
      if (settings.enabled !== undefined) setShareEnabled(!!settings.enabled);
      if (settings.mode) setShareMode(settings.mode);
      if (settings.cf_worker_url !== undefined) setCfWorkerUrl(settings.cf_worker_url || '');
    }
    return ok;
  }, [api, webhookUrl]);

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
    if (controller) controller.abort();
    setTransfers(p => p.map(t => t.id === id ? { ...t, status: 'cancelled' } : t));
    setTimeout(() => {
      abortControllersRef.current.delete(id);
      setTransfers(p => p.filter(t => t.id !== id));
    }, 2000);
  }, []);

  const getTransferSignal = useCallback((id) => {
    return abortControllersRef.current.get(id)?.signal ?? null;
  }, []);

  // ─── 5. Effects ─────────────────────────────────────────────────────────────
  useEffect(() => { localStorage.setItem('disbox_animations_enabled', animationsEnabled.toString()); }, [animationsEnabled]);

  useEffect(() => {
    if (!window.electron?.onMetadataStatus) return;
    return window.electron.onMetadataStatus((data) => {
      setMetadataStatus(data);
    });
  }, []);

  useEffect(() => {
    if (!isConnected || !api) return;
    const interval = setInterval(() => { refresh(true); }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, api, refresh]);

  useEffect(() => {
    if (!api || !webhookUrl) return;
    window.electron?.setActiveWebhook(webhookUrl, api.hashedWebhook);
  }, [api, webhookUrl]);

  useEffect(() => {
    if (!window.electron?.onMetadataChange || !api) return;
    const cleanup = window.electron.onMetadataChange((hash) => { if (api.hashedWebhook === hash) refresh(); });
    return cleanup;
  }, [api, refresh]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('disbox_theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('disbox_lang', language); }, [language]);
  useEffect(() => { document.body.style.zoom = uiScale; localStorage.setItem('disbox_ui_scale', uiScale.toString()); }, [uiScale]);
  useEffect(() => { localStorage.setItem('disbox_chunk_size', chunkSize.toString()); if (api) api.chunkSize = chunkSize; }, [chunkSize, api]);
  useEffect(() => { localStorage.setItem('disbox_show_previews', showPreviews.toString()); }, [showPreviews]);

  useEffect(() => {
    if (window.electron?.getPrefs) {
      window.electron.getPrefs().then(p => {
        if (p.closeToTray !== undefined) setCloseToTray(p.closeToTray);
        if (p.startMinimized !== undefined) setStartMinimized(p.startMinimized);
        if (p.chunksPerMessage !== undefined) setChunksPerMessage(p.chunksPerMessage);
      });
    }
  }, []);

  // ─── 8. Cloud Save Integration ──────────────────────────────────────────────
  const cloudSave = useCloudSave(api, isConnected, webhookUrl, chunkSize);

  return (
    <AppContext.Provider value={{
      api, webhookUrl, isConnected, isConnecting, files, fileTree,
      currentPath, setCurrentPath,
      currentTrack, setCurrentTrack,
      playlist, setPlaylist,
      loading, transfers, savedWebhooks,
      language, setLanguage, t,
      theme, toggleTheme, setTheme,
      uiScale, setUiScale,
      chunkSize, setChunkSize,
      showPreviews, setShowPreviews,
      showImagePreviews, setShowImagePreviews,
      showVideoPreviews, setShowVideoPreviews,
      showAudioPreviews, setShowAudioPreviews,
      showRecent, setShowRecent,
      autoCloseTransfers, setAutoCloseTransfers,
      animationsEnabled, setAnimationsEnabled,
      metadataStatus,
      closeToTray, startMinimized, chunksPerMessage, updatePrefs,
      isVerified, setIsVerified,
      appLockEnabled, setAppLockEnabled,
      appLockPin, setAppLockPin,
      isAppUnlocked, setIsAppUnlocked,
      pinExists, setPinExists,
      isSidebarOpen, setIsSidebarOpen,
      isTransferring,
      shareEnabled, setShareEnabled,
      shareMode, setShareMode,
      shareLinks, cfWorkerUrl, setCfWorkerUrl,
      loadShareLinks, saveShareSettings, deployWorker,
      createShareLink, revokeShareLink, revokeAllLinks,
      connect, disconnect, refresh,
      createFolder, movePath, copyPath, deletePath,
      bulkDelete, bulkMove, bulkCopy,
      setLocked, setStarred, verifyPin, setPin, hasPin, removePin,
      getAllDirs,
      addTransfer, updateTransfer, removeTransfer,
      cancelTransfer, getTransferSignal,
      // Pending operations
      pendingOperations, addPendingItem, updatePendingProgress, unmarkPending,
      updateWebhookLabel: handleUpdateLabel,
      removeWebhook: handleRemoveWebhook,
      addWebhook: handleAddWebhook,
      ...cloudSave
    }}>
      {children}
    </AppContext.Provider>
  );
}
