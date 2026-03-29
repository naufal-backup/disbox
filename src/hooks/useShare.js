import { useState, useEffect, useCallback } from 'react';
import { ipc } from '@/utils/ipc';

export function useShare(api, webhookUrl) {
  const [shareEnabled, setShareEnabled] = useState(() => localStorage.getItem('disbox_share_enabled') !== 'false');
  const [shareMode, setShareMode] = useState(() => localStorage.getItem('disbox_share_mode') || 'public');
  const [shareLinks, setShareLinks] = useState([]);
  const [cfWorkerUrl, setCfWorkerUrl] = useState('');

  useEffect(() => {
    localStorage.setItem('disbox_share_enabled', shareEnabled.toString());
    localStorage.setItem('disbox_share_mode', shareMode);
  }, [shareEnabled, shareMode]);

  const loadShareLinks = useCallback(async () => {
    if (!api) return;
    try {
      const links = await ipc.shareGetLinks(api.hashedWebhook);
      setShareLinks(links || []);
    } catch (e) { console.error('[share] loadShareLinks error:', e.message); }
  }, [api]);

  const saveShareSettings = useCallback(async (settings) => {
    if (!api) return false;
    const ok = await ipc.shareSaveSettings(api.hashedWebhook, { ...settings, webhook_url: webhookUrl });
    if (ok) {
      if (settings.enabled !== undefined) setShareEnabled(!!settings.enabled);
      if (settings.mode) setShareMode(settings.mode);
      if (settings.cf_worker_url !== undefined) setCfWorkerUrl(settings.cf_worker_url || '');
    }
    return ok;
  }, [api, webhookUrl]);

  const deployWorker = useCallback(async (apiToken) => {
    return await ipc.shareDeployWorker({ apiToken });
  }, []);

  const createShareLink = useCallback(async (filePath, fileId, permission, expiresAt) => {
    if (!api) return { ok: false, reason: 'no_api' };
    const result = await ipc.shareCreateLink(api.hashedWebhook, { filePath, fileId, permission, expiresAt });
    if (result.ok) await loadShareLinks();
    return result;
  }, [api, loadShareLinks]);

  const revokeShareLink = useCallback(async (id, token) => {
    if (!api) return false;
    const ok = await ipc.shareRevokeLink(api.hashedWebhook, { id, token });
    if (ok) await loadShareLinks();
    return ok;
  }, [api, loadShareLinks]);

  const revokeAllLinks = useCallback(async () => {
    if (!api) return false;
    const ok = await ipc.shareRevokeAll(api.hashedWebhook);
    if (ok) setShareLinks([]);
    return ok;
  }, [api]);

  return { shareEnabled, setShareEnabled, shareMode, setShareMode, shareLinks, setShareLinks, cfWorkerUrl, setCfWorkerUrl, loadShareLinks, saveShareSettings, deployWorker, createShareLink, revokeShareLink, revokeAllLinks };
}