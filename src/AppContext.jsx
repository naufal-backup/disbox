import { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { DisboxAPI, buildTree } from '@/utils/disbox.js';
import { ipc } from '@/utils/ipc';

import { useCore, saveWebhookToList, getSavedWebhooks } from './hooks/useCore.js';
import { usePreferences } from './hooks/usePreferences.js';
import { useAuth } from './hooks/useAuth.js';
import { useFiles } from './hooks/useFiles.js';
import { useTransfers } from './hooks/useTransfers.js';
import { useCloudSave } from './hooks/useCloudSave.js';
import { useShare } from './hooks/useShare.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const core = useCore();
  const { api, setApi, webhookUrl, setWebhookUrl, isConnected, setIsConnected, isConnecting, setIsConnecting, loading, setLoading, setMetadataStatus, setSavedWebhooks } = core;

  const prefs = usePreferences(api);
  const transfers = useTransfers();
  const { abortControllersRef, setTransfers } = transfers;

  const setFilesRef = useRef();
  const setFileTreeRef = useRef();

  const refresh = useCallback(async (silent = false) => {
    if (!api) return;
    if (!silent) setLoading(true);
    try {
      await api.syncMetadata();
      const fs = await api.getFileSystem();
      setFilesRef.current?.(fs);
      setFileTreeRef.current?.(buildTree(fs));
    } catch (e) {
      console.error('Refresh failed:', e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [api, setLoading]);

  const files = useFiles(api, refresh);
  setFilesRef.current = files.setFiles;
  setFileTreeRef.current = files.setFileTree;

  const auth = useAuth(api, isConnected);
  const share = useShare(api, webhookUrl);
  const cloudSave = useCloudSave(api, isConnected, webhookUrl, prefs.chunkSize);

  const { setFiles, setFileTree, setCurrentPath } = files;
  const { setPinExists } = auth;
  const { setShareEnabled, setShareMode, setCfWorkerUrl, setShareLinks } = share;

  useEffect(() => {
    if (!ipc?.onMetadataStatus) return;
    return ipc.onMetadataStatus((data) => {
      setMetadataStatus(data);
    });
  }, [setMetadataStatus]);

  useEffect(() => {
    if (!isConnected || !api) return;
    const interval = setInterval(() => { refresh(true); }, 5000);
    return () => clearInterval(interval);
  }, [isConnected, api, refresh]);

  useEffect(() => {
    if (!api || !webhookUrl) return;
    ipc?.setActiveWebhook(webhookUrl, api.hashedWebhook);
  }, [api, webhookUrl]);

  useEffect(() => {
    if (!ipc?.onMetadataChange || !api) return;
    const cleanup = ipc.onMetadataChange((hash) => {
      if (api.hashedWebhook === hash) refresh();
    });
    return cleanup;
  }, [api, refresh]);

  const connect = useCallback(async (url, metadataId = null) => {
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
      await instance.init(metadataId);
      const fs = await instance.getFileSystem();

      localStorage.setItem('disbox_webhook', url);
      saveWebhookToList(url);
      setSavedWebhooks(getSavedWebhooks());

      ipc?.setActiveWebhook(url, instance.hashedWebhook);

      setWebhookUrl(url);
      setApi(instance);
      setFiles(fs);
      setFileTree(buildTree(fs));
      setIsConnected(true);

      try {
        const shareSettings = await ipc.shareGetSettings(instance.hashedWebhook);
        if (shareSettings) {
          setShareEnabled(!!shareSettings.enabled);
          setShareMode(shareSettings.mode || 'public');
          setCfWorkerUrl(shareSettings.cf_worker_url || '');
          
          await ipc.shareSaveSettings(instance.hashedWebhook, {
            enabled: shareSettings.enabled,
            mode: shareSettings.mode || 'public',
            cf_worker_url: shareSettings.cf_worker_url || '',
            webhook_url: url
          });
        } else {
          await ipc.shareSaveSettings(instance.hashedWebhook, {
            enabled: 1,
            mode: 'public',
            cf_worker_url: '',
            webhook_url: url
          });
          setShareEnabled(true);
          setShareMode('public');
          setCfWorkerUrl('');
        }
        const links = await ipc.shareGetLinks(instance.hashedWebhook);
        setShareLinks(links || []);
      } catch (e) {
        console.warn('[share] Failed to load share settings:', e.message);
      }

      return { ok: true };
    } catch (e) {
      console.error('Connect failed:', e);
      return { ok: false, reason: 'unknown', message: e.message };
    } finally {
      setIsConnecting(false);
      setLoading(false);
    }
  }, [setApi, setWebhookUrl, setIsConnected, setIsConnecting, setLoading, setFiles, setFileTree, setCurrentPath, setTransfers, setMetadataStatus, setSavedWebhooks, setPinExists, setShareEnabled, setShareMode, setCfWorkerUrl, setShareLinks, abortControllersRef]);

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
    setShareLinks([]);
  }, [setApi, setWebhookUrl, setIsConnected, setPinExists, setFiles, setFileTree, setCurrentPath, setTransfers, setShareLinks, abortControllersRef]);

  const combinedContext = {
    ...core,
    ...prefs,
    ...auth,
    ...files,
    ...transfers,
    ...cloudSave,
    ...share,
    connect,
    disconnect,
    refresh
  };

  return (
    <AppContext.Provider value={combinedContext}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
