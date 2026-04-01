import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { DisboxAPI, buildTree } from './utils/disbox.js';
import { translations } from './utils/i18n.js';
import { clearThumbCache } from './utils/thumbnailCache.js';
import { AppContext } from './context/AppContextBase.jsx';
import { 
  getSavedWebhooks, saveWebhookToList, updateWebhookLabel, removeWebhook 
} from './utils/webhookHelpers.js';

export function AppProvider({ children }) {
  // ─── 1. States & Refs ──────────────────────────────────────────────────────
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
  const [pinHash, setPinHash] = useState(null);

  const [currentTrack, setCurrentTrack] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [pendingOperations, setPendingOperations] = useState({}); // { [path]: { type, progress, tempItem? } }

  const abortControllersRef = useRef(new Map());

  const hashPin = async (pin) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + 'disbox_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

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
    if (prefs.showPreviews !== undefined) setShowPreviews(prefs.showPreviews);
    if (prefs.showImagePreviews !== undefined) setShowImagePreviews(prefs.showImagePreviews);
    if (prefs.showVideoPreviews !== undefined) setShowVideoPreviews(prefs.showVideoPreviews);
    if (prefs.showAudioPreviews !== undefined) setShowAudioPreviews(prefs.showAudioPreviews);
    if (prefs.autoCloseTransfers !== undefined) setAutoCloseTransfers(prefs.autoCloseTransfers);
    if (prefs.showRecent !== undefined) setShowRecent(prefs.showRecent);
    if (window.electron?.setPrefs) window.electron.setPrefs(prefs);
  }, []);

  // ─── 3. Intermediate Callbacks (Depend on leaf callbacks) ───────────────────
  const refresh = useCallback(async (silent = false) => {
    if (!api) return;
    if (!silent) setLoading(true);
    try {
      // Background sync from server
      const container = await api.syncMetadata({ force: true });
      const fsSync = container?.files || await api.getFileSystem();
      if (container?.pinHash) {
        setPinHash(container.pinHash);
        setPinExists(true);
      }
      if (container?.shareLinks) setShareLinks(container.shareLinks);

      setFiles(fsSync);
      setFileTree(buildTree(fsSync));
      setMetadataStatus({ status: 'synced', items: fsSync.length });
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
      const isCloudAccount = !!localStorage.getItem('dbx_username');
      const instance = new DisboxAPI(url);
      
      if (!isCloudAccount) {
        const authRes = await fetch('https://disbox-web-weld.vercel.app/api/auth/webhook', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ webhook_url: url.trim() })
        });
        if (!authRes.ok) {
          const err = await authRes.json();
          throw new Error(err.error || 'Gagal membuat sesi API');
        }
      }
      
      await instance.init(options);
      const container = await instance.syncMetadata(options);
      const fs = container?.files || [];
      if (container?.pinHash) {
        setPinHash(container.pinHash);
        setPinExists(true);
      } else {
        setPinHash(null);
        setPinExists(false);
      }
      if (container?.shareLinks) setShareLinks(container.shareLinks);

      const normalizedUrl = instance.webhookUrl;
      localStorage.setItem('disbox_webhook', normalizedUrl);
      
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
    const oldFiles = [...files];
    const updatedFiles = files.map(f => {
      if (f.id === id || f.path === id) return { ...f, isLocked };
      if (typeof id === 'string' && f.path.startsWith(id + '/')) return { ...f, isLocked };
      return f;
    });

    setFiles(updatedFiles);
    setFileTree(buildTree(updatedFiles));

    try {
      await api.setLocked(id, isLocked);
      return true;
    } catch (e) {
      console.error('Failed to set lock:', e);
      setFiles(oldFiles);
      setFileTree(buildTree(oldFiles));
      return false;
    }
  }, [api, files]);

  const setStarred = useCallback(async (id, isStarred) => {
    if (!api) return false;
    const oldFiles = [...files];
    const updatedFiles = files.map(f => {
      if (f.id === id) return { ...f, isStarred };
      // Folder logic: starred if its .keep file is starred
      if (f.path === (id ? `${id}/.keep` : '.keep')) return { ...f, isStarred };
      return f;
    });

    setFiles(updatedFiles);
    setFileTree(buildTree(updatedFiles));

    try {
      await api.setStarred(id, isStarred);
      return true;
    } catch (e) {
      console.error('Failed to set starred:', e);
      setFiles(oldFiles);
      setFileTree(buildTree(oldFiles));
      return false;
    }
  }, [api, files]);

  const verifyPin = useCallback(async (pin) => {
    if (!api) return false;
    const h = await hashPin(pin);
    const ok = h === pinHash;
    if (ok) setIsVerified(true);
    return ok;
  }, [api, pinHash]);

  const setPin = useCallback(async (pin) => {
    if (!api) return false;
    const h = await hashPin(pin);
    setPinHash(h);
    setPinExists(true);
    if (api && files) await api.uploadMetadataToDiscord(files, { pinHash: h });
    return true;
  }, [api, files]);

  const hasPin = useCallback(async () => {
    const exists = !!pinHash;
    setPinExists(exists);
    return exists;
  }, [pinHash]);

  const removePin = useCallback(async (pin) => {
    if (!api) return false;
    const h = await hashPin(pin);
    if (h === pinHash) {
      setPinHash(null);
      setPinExists(false);
      setIsVerified(false);
      if (api && files) await api.uploadMetadataToDiscord(files, { pinHash: null });
      return true;
    }
    return false;
  }, [api, files, pinHash]);

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
    if (!isConnected || !api) return;
    const interval = setInterval(() => { refresh(true); }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, api, refresh]);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('disbox_theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('disbox_lang', language); }, [language]);
  useEffect(() => { document.body.style.zoom = uiScale; localStorage.setItem('disbox_ui_scale', uiScale.toString()); }, [uiScale]);
  useEffect(() => { localStorage.setItem('disbox_chunk_size', chunkSize.toString()); if (api) api.chunkSize = chunkSize; }, [chunkSize, api]);
  useEffect(() => { localStorage.setItem('disbox_show_previews', showPreviews.toString()); }, [showPreviews]);
  useEffect(() => { localStorage.setItem('disbox_show_image_previews', showImagePreviews.toString()); }, [showImagePreviews]);
  useEffect(() => { localStorage.setItem('disbox_show_video_previews', showVideoPreviews.toString()); }, [showVideoPreviews]);
  useEffect(() => { localStorage.setItem('disbox_show_audio_previews', showAudioPreviews.toString()); }, [showAudioPreviews]);
  useEffect(() => { localStorage.setItem('disbox_show_recent', showRecent.toString()); }, [showRecent]);
  useEffect(() => { localStorage.setItem('disbox_auto_close_transfers', autoCloseTransfers.toString()); }, [autoCloseTransfers]);
  useEffect(() => { localStorage.setItem('disbox_chunks_per_message', chunksPerMessage.toString()); }, [chunksPerMessage]);
  useEffect(() => { localStorage.setItem('disbox_app_lock_enabled', appLockEnabled.toString()); }, [appLockEnabled]);
  useEffect(() => { localStorage.setItem('disbox_app_lock_pin', appLockPin); }, [appLockPin]);

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
    }}>
      {children}
    </AppContext.Provider>
  );
}
