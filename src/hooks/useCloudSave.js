import { useState, useEffect, useCallback } from 'react';

export function useCloudSave(api, isConnected, webhookUrl, chunkSize) {
  const [cloudSaveEnabled, setCloudSaveEnabled] = useState(() => localStorage.getItem('disbox_cloudsave_enabled') === 'true');
  const [cloudSaves, setCloudSaves] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { localStorage.setItem('disbox_cloudsave_enabled', cloudSaveEnabled.toString()); }, [cloudSaveEnabled]);

  const loadCloudSaves = useCallback(async () => {
    if (!api || !window.electron) return;
    const entries = await window.electron.cloudsaveGetAll(api.hashedWebhook);
    setCloudSaves(entries);
  }, [api]);

  useEffect(() => { if (isConnected) loadCloudSaves(); }, [isConnected, loadCloudSaves]);

  const addCloudSave = useCallback(async (name, localPath) => {
    if (!api || !window.electron) return;
    const discordPath = `cloudsave/${name}/`;
    const id = await window.electron.cloudsaveAdd(api.hashedWebhook, { name, local_path: localPath, discord_path: discordPath });
    await loadCloudSaves();
    return id;
  }, [api, loadCloudSaves]);

  const removeCloudSave = useCallback(async (id) => {
    if (!window.electron) return;
    await window.electron.cloudsaveRemove(id);
    await loadCloudSaves();
  }, [loadCloudSaves]);

  const syncCloudSave = useCallback(async (id) => {
    if (!window.electron) return;
    return await window.electron.cloudsaveSyncEntry(id);
  }, []);

  const setLocalPath = useCallback(async (id, localPath) => {
    if (!window.electron) return;
    await window.electron.cloudsaveUpdate(id, { local_path: localPath });
    await loadCloudSaves();
  }, [loadCloudSaves]);

  useEffect(() => {
    if (!window.electron?.onCloudSaveDoUpload || !api) return;
    const cleanup = window.electron.onCloudSaveDoUpload(async (entry) => {
      try {
        const uploadRecursive = async (localDir, remoteDir) => {
          const contents = await window.electron.listDirectory(localDir);
          for (const item of contents) {
            const remotePath = `${remoteDir}${item.name}`;
            if (item.isDirectory) {
              await uploadRecursive(item.path, `${remotePath}/`);
            } else {
              const transferId = `cloudsave-${entry.id}-${Date.now()}`;
              await api.uploadFile({ nativePath: item.path }, remotePath, (p) => {}, null, transferId);
            }
          }
        };
        await uploadRecursive(entry.local_path, entry.discord_path);
        if (window.electron?.flushMetadata) await window.electron.flushMetadata(webhookUrl, api.hashedWebhook);
        await api.syncMetadata();
        window.electron.cloudsaveUploadResult(entry.id, true);
        await loadCloudSaves();
      } catch (e) { console.error('[cloudsave] Upload failed:', e); window.electron.cloudsaveUploadResult(entry.id, false); }
    });
    return cleanup;
  }, [api, webhookUrl, chunkSize, loadCloudSaves]);

  useEffect(() => {
    if (!window.electron?.onCloudSaveDoUploadFile || !api) return;
    const cleanup = window.electron.onCloudSaveDoUploadFile(async ({ id, filePath, discordPath }) => {
      try {
        const transferId = `cloudsave-file-${id}-${Date.now()}`;
        const result = await window.electron.uploadFileFromPath(webhookUrl, filePath, discordPath, () => {}, transferId, chunkSize);
        if (result.ok) {
          await api.createFile(discordPath, result.messageIds, result.size);
          await api.syncMetadata();
          window.electron.cloudsaveUploadFileResult(id, discordPath, true);
          await loadCloudSaves();
        } else { window.electron.cloudsaveUploadFileResult(id, discordPath, false); }
      } catch (e) { console.error('[cloudsave] Single file upload failed:', e); window.electron.cloudsaveUploadFileResult(id, discordPath, false); }
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
    setLoading(true);
    try {
      await api.syncMetadata();
      const res = await window.electron.cloudsaveRestore(id, force);
      if (res.ok) await loadCloudSaves();
      return res;
    } catch (e) { return { ok: false, reason: e.message }; }
    finally { setLoading(false); }
  }, [api, loadCloudSaves]);

  const exportCloudSave = useCallback(async (id) => {
    if (!api) return { ok: false, reason: 'api_not_initialized' };
    setLoading(true);
    try { await api.syncMetadata(); return await window.electron.cloudsaveExportZip(id); }
    catch (e) { return { ok: false, reason: e.message }; }
    finally { setLoading(false); }
  }, [api]);

  const getCloudSaveStatus = useCallback(async (id) => { 
    if (!window.electron) return null;
    return await window.electron.cloudsaveGetStatus(id); 
  }, []);

  return { cloudSaveEnabled, setCloudSaveEnabled, cloudSaves, loadCloudSaves, addCloudSave, removeCloudSave, syncCloudSave, setLocalPath, restoreCloudSave, exportCloudSave, getCloudSaveStatus, loading };
}
