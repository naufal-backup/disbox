import { useState, useCallback, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { DisboxAPI, buildTree } from './utils/disbox.js';
import { translations } from './utils/i18n.js';
import { clearThumbCache } from './utils/thumbnailCache.js';
import { AppContext } from './context/AppContextBase.jsx';
import { 
  getSavedWebhooks, saveWebhookToList, updateWebhookLabel, removeWebhook 
} from './utils/webhookHelpers.js';

export function AppProvider({ children }) {
  const queryClient = useQueryClient();

  // ─── 1. States & Refs ──────────────────────────────────────────────────────
  const [api, setApi] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem('disbox_webhook') || '');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Local state for optimistic UI and immediate display
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
  const lastMutationRef = useRef(0);
  const mutationQueueRef = useRef(Promise.resolve());
  const isMutatingRef = useRef(false);

  // ─── 2. React Query Configuration ──────────────────────────────────────────
  const { data: serverContainer, isLoading: isQueryLoading } = useQuery({
    queryKey: ['files', api?.hashedWebhook],
    queryFn: async () => {
      if (!api) return null;
      console.log('[query] Fetching metadata from cloud...');
      return await api.syncMetadata({ force: true });
    },
    enabled: !!api && isConnected,
    refetchInterval: (query) => {
      // Pause polling if mutating or just mutated
      if (isMutatingRef.current || Date.now() - lastMutationRef.current < 8000) return false;
      return 10000; // Poll every 10 seconds
    },
  });

  const syncSettingsToCloud = useCallback(async (newSettings) => {
    if (!api || !isConnected) return;
    try {
      await api.persistCloud(files, { settings: newSettings });
      await api.uploadMetadataToDiscord(files, { settings: newSettings });
    } catch (e) { console.error('[settings-sync] Failed:', e); }
  }, [api, isConnected, files]);

  // Sync server data to local state when query returns
  useEffect(() => {
    if (serverContainer && !isMutatingRef.current && Date.now() - lastMutationRef.current > 2000) {
      const fs = serverContainer.files || [];
      setFiles(fs);
      setFileTree(buildTree(fs));
      
      // Apply cloud settings
      if (serverContainer.settings) {
        const s = serverContainer.settings;
        if (s.language) setLanguage(s.language);
        if (s.theme) setTheme(s.theme);
        if (s.uiScale) setUiScale(s.uiScale);
        if (s.chunkSize) setChunkSize(s.chunkSize);
        if (s.showPreviews !== undefined) setShowPreviews(s.showPreviews);
        if (s.showImagePreviews !== undefined) setShowImagePreviews(s.showImagePreviews);
        if (s.showVideoPreviews !== undefined) setShowVideoPreviews(s.showVideoPreviews);
        if (s.showAudioPreviews !== undefined) setShowAudioPreviews(s.showAudioPreviews);
        if (s.autoCloseTransfers !== undefined) setAutoCloseTransfers(s.autoCloseTransfers);
        if (s.animationsEnabled !== undefined) setAnimationsEnabled(s.animationsEnabled);
        if (s.showRecent !== undefined) setShowRecent(s.showRecent);
      }

      if (serverContainer.pinHash) {
        setPinHash(serverContainer.pinHash);
        setPinExists(true);
      }
      if (serverContainer.shareLinks) setShareLinks(serverContainer.shareLinks);
      setMetadataStatus({ status: 'synced', items: fs.length });
    }
  }, [serverContainer]);

  const hashPin = async (pin) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin + 'disbox_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const enqueueMutation = (mutationFn) => {
    lastMutationRef.current = Date.now();
    isMutatingRef.current = true;
    mutationQueueRef.current = mutationQueueRef.current.then(async () => {
      try { await mutationFn(); }
      catch (e) { console.error('[mutation-queue] Mutation failed:', e); }
      finally { 
        lastMutationRef.current = Date.now();
        isMutatingRef.current = false;
      }
    });
    return mutationQueueRef.current;
  };

  // ─── 3. Leaf Callbacks (No dependencies on other callbacks) ────────────────
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

  // ─── 4. Intermediate Callbacks (Depend on leaf callbacks) ───────────────────
  const refresh = useCallback(async (silent = false) => {
    if (!api) return;
    if (!silent) {
      setLoading(true);
      await queryClient.invalidateQueries({ queryKey: ['files', api.hashedWebhook] });
      setLoading(false);
    } else {
      queryClient.refetchQueries({ queryKey: ['files', api.hashedWebhook] });
    }
  }, [api, queryClient]);

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

  // ─── 5. High-level Callbacks (Business logic) ───────────────────────────────
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
      
      // Load initial local data for desktop
      if (window.electron) {
        const fsLocal = await window.electron.loadMetadata(instance.hashedWebhook);
        if (fsLocal) {
          setFiles(fsLocal);
          setFileTree(buildTree(fsLocal));
        }
      }

      setApi(instance);
      setIsConnected(true);

      const normalizedUrl = instance.webhookUrl;
      localStorage.setItem('disbox_webhook', normalizedUrl);
      
      if (!isCloudAccount) {
        saveWebhookToList(normalizedUrl);
        setSavedWebhooks(getSavedWebhooks());
      }

      window.electron?.setActiveWebhook(normalizedUrl, instance.hashedWebhook);
      setWebhookUrl(normalizedUrl);

      // Handle share settings
      try {
        const shareSettings = await window.electron.shareGetSettings(instance.hashedWebhook);
        if (shareSettings) {
          setShareEnabled(!!shareSettings.enabled);
          setShareMode(shareSettings.mode || 'public');
          setCfWorkerUrl(shareSettings.cf_worker_url || '');
        }
      } catch (e) { console.warn('[share] Failed to load share settings:', e.message); }

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
    queryClient.clear();
  }, [queryClient]);

  const createFolder = useCallback(async (folderName) => {
    if (!api || !folderName.trim()) return false;
    const cleanName = folderName.trim();
    const newFolderPath = (currentPath === '/' ? '' : currentPath.slice(1)) + cleanName;
    const entry = { path: newFolderPath + '/.keep', name: '.keep', size: 0, createdAt: Date.now(), id: crypto.randomUUID() };
    
    const oldFiles = [...files];
    setFiles(prev => {
      const newList = [...prev, entry];
      setFileTree(buildTree(newList));
      return newList;
    });
    
    enqueueMutation(async () => {
      await api.createFolder(cleanName, currentPath);
    });
    return true;
  }, [api, currentPath, files]);

  const movePath = useCallback(async (oldPath, destDir, id = null) => {
    if (!api) return false;
    const name = oldPath.split('/').pop();
    const newPath = destDir ? `${destDir}/${name}` : name;
    const oldFiles = [...files];
    
    setFiles(prev => {
      const next = prev.map(f => {
        if ((id && f.id === id) || (!id && f.path === oldPath)) return { ...f, path: newPath };
        if (f.path.startsWith(oldPath + '/')) return { ...f, path: f.path.replace(oldPath + '/', newPath + '/') };
        return f;
      });
      setFileTree(buildTree(next));
      return next;
    });

    enqueueMutation(async () => {
      await api.renamePath(oldPath, newPath, id);
    });
    return true;
  }, [api, files]);

  const copyPath = useCallback(async (oldPath, destDir, id = null) => {
    if (!api) return false;
    enqueueMutation(async () => {
      await api.copyPath(oldPath, destDir, id);
    });
    return true;
  }, [api]);

  const deletePath = useCallback(async (path, id = null) => {
    if (!api) return false;
    const oldFiles = [...files];
    setFiles(prev => {
      const next = prev.filter(f => {
        if (id) return f.id !== id;
        return f.path !== path && !f.path.startsWith(path + '/');
      });
      setFileTree(buildTree(next));
      return next;
    });

    enqueueMutation(async () => {
      await api.deletePath(path, id);
    });
    return true;
  }, [api, files]);

  const bulkDelete = useCallback(async (paths) => {
    if (!api) return false;
    const oldFiles = [...files];
    const pathSet = new Set(paths);
    setFiles(prev => {
      const next = prev.filter(f => {
        if (pathSet.has(f.id) || pathSet.has(f.path)) return false;
        for (const p of pathSet) {
          if (!p.includes('-') && f.path.startsWith(p + '/')) return false;
        }
        return true;
      });
      setFileTree(buildTree(next));
      return next;
    });

    enqueueMutation(async () => {
      await api.bulkDelete(paths);
    });
    return true;
  }, [api, files]);

  const bulkMove = useCallback(async (paths, destDir) => {
    if (!api) return false;
    const oldFiles = [...files];
    setFiles(prev => {
      const next = prev.map(f => {
        for (const target of paths) {
          if (f.id === target || f.path === target) {
            const name = f.path.split('/').pop();
            return { ...f, path: destDir ? `${destDir}/${name}` : name };
          }
          if (f.path.startsWith(target + '/')) {
            const name = target.split('/').pop();
            const newBase = destDir ? `${destDir}/${name}` : name;
            return { ...f, path: f.path.replace(target + '/', newBase + '/') };
          }
        }
        return f;
      });
      setFileTree(buildTree(next));
      return next;
    });

    enqueueMutation(async () => {
      await api.bulkMove(paths, destDir);
    });
    return true;
  }, [api, files]);

  const bulkCopy = useCallback(async (paths, destDir) => {
    if (!api) return false;
    enqueueMutation(async () => {
      await api.bulkCopy(paths, destDir);
    });
    return true;
  }, [api]);

  const setLocked = useCallback(async (id, isLocked) => {
    if (!api) return false;
    const oldFiles = [...files];
    const updatedFiles = files.map(f => {
      if (f.id === id) return { ...f, isLocked };
      if (f.path === id || f.path.startsWith(id + '/')) return { ...f, isLocked };
      return f;
    });

    setFiles(updatedFiles);
    setFileTree(buildTree(updatedFiles));

    enqueueMutation(async () => {
      await api.setLocked(id, isLocked);
    });
    return true;
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

    enqueueMutation(async () => {
      await api.setStarred(id, isStarred);
    });
    return true;
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
    if (api && files) {
      await api.persistCloud(files, { pinHash: h });
      await api.uploadMetadataToDiscord(files, { pinHash: h });
    }
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
      if (api && files) {
        await api.persistCloud(files, { pinHash: null });
        await api.uploadMetadataToDiscord(files, { pinHash: null });
      }
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
      
      // Update cloud sync with latest share links
      const currentLinks = await window.electron.shareGetLinks(api.hashedWebhook);
      if (currentLinks) {
        setShareLinks(currentLinks);
        await api.persistCloud(files, { shareLinks: currentLinks });
      }
    }
    return ok;
  }, [api, webhookUrl, files]);

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

  // ─── 6. Effects ─────────────────────────────────────────────────────────────
  useEffect(() => { 
    localStorage.setItem('disbox_animations_enabled', animationsEnabled.toString());
    syncSettingsToCloud({ animationsEnabled });
  }, [animationsEnabled]);

  useEffect(() => { 
    document.documentElement.setAttribute('data-theme', theme); 
    localStorage.setItem('disbox_theme', theme);
    syncSettingsToCloud({ theme });
  }, [theme]);

  useEffect(() => { 
    localStorage.setItem('disbox_lang', language);
    syncSettingsToCloud({ language });
  }, [language]);

  useEffect(() => { 
    document.body.style.zoom = uiScale; 
    localStorage.setItem('disbox_ui_scale', uiScale.toString());
    syncSettingsToCloud({ uiScale });
  }, [uiScale]);

  useEffect(() => { 
    localStorage.setItem('disbox_chunk_size', chunkSize.toString()); 
    if (api) api.chunkSize = chunkSize;
    syncSettingsToCloud({ chunkSize });
  }, [chunkSize, api]);

  useEffect(() => { 
    localStorage.setItem('disbox_show_previews', showPreviews.toString());
    syncSettingsToCloud({ showPreviews });
  }, [showPreviews]);

  useEffect(() => { 
    localStorage.setItem('disbox_show_image_previews', showImagePreviews.toString());
    syncSettingsToCloud({ showImagePreviews });
  }, [showImagePreviews]);

  useEffect(() => { 
    localStorage.setItem('disbox_show_video_previews', showVideoPreviews.toString());
    syncSettingsToCloud({ showVideoPreviews });
  }, [showVideoPreviews]);

  useEffect(() => { 
    localStorage.setItem('disbox_show_audio_previews', showAudioPreviews.toString());
    syncSettingsToCloud({ showAudioPreviews });
  }, [showAudioPreviews]);

  useEffect(() => { 
    localStorage.setItem('disbox_show_recent', showRecent.toString());
    syncSettingsToCloud({ showRecent });
  }, [showRecent]);

  useEffect(() => { 
    localStorage.setItem('disbox_auto_close_transfers', autoCloseTransfers.toString());
    syncSettingsToCloud({ autoCloseTransfers });
  }, [autoCloseTransfers]);
  useEffect(() => { localStorage.setItem('disbox_chunks_per_message', chunksPerMessage.toString()); }, [chunksPerMessage]);
  useEffect(() => { localStorage.setItem('disbox_app_lock_enabled', appLockEnabled.toString()); }, [appLockEnabled]);
  useEffect(() => { localStorage.setItem('disbox_app_lock_pin', appLockPin); }, [appLockPin]);

  return (
    <AppContext.Provider value={{
      api, webhookUrl, isConnected, isConnecting, files, fileTree,
      currentPath, setCurrentPath,
      currentTrack, setCurrentTrack,
      playlist, setPlaylist,
      loading: loading || isQueryLoading, transfers, savedWebhooks,
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
