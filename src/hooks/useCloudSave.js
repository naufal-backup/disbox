import { useState, useEffect, useCallback } from 'react';
import { ipc } from '@/utils/ipc';

export function useCloudSave(api, isConnected, webhookUrl, chunkSize) {
  const [cloudSaveEnabled, setCloudSaveEnabled] = useState(() => localStorage.getItem('disbox_cloudsave_enabled') === 'true');
  const [cloudSaves, setCloudSaves] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { localStorage.setItem('disbox_cloudsave_enabled', cloudSaveEnabled.toString()); }, [cloudSaveEnabled]);

  const loadCloudSaves = useCallback(async () => {
    if (!api) return;
    const entries = await ipc.cloudsaveGetAll(api.hashedWebhook);
    setCloudSaves(entries);
  }, [api]);

  useEffect(() => { if (isConnected) loadCloudSaves(); }, [isConnected, loadCloudSaves]);

  const addCloudSave = useCallback(async (name, localPath) => {
    if (!api) return;
    const discordPath = `cloudsave/${name}/`;
    const id = await ipc.cloudsaveAdd(api.hashedWebhook, { name, local_path: localPath, discord_path: discordPath });
    await loadCloudSaves();
    return id;
  }, [api, loadCloudSaves]);

  const removeCloudSave = useCallback(async (id) => {
    await ipc.cloudsaveRemove(id);
    await loadCloudSaves();
  }, [loadCloudSaves]);

  const syncCloudSave = useCallback(async (id) => {
    return await ipc.cloudsaveSyncEntry(id);
  }, []);

  const setLocalPath = useCallback(async (id, localPath) => {
    await ipc.cloudsaveUpdate(id, { local_path: localPath });
    await loadCloudSaves();
  }, [loadCloudSaves]);

  useEffect(() => {
    if (!ipc?.onCloudSaveDoUpload || !api) return;
    const cleanup = ipc.onCloudSaveDoUpload(async (entry) => {
      try {
        const uploadRecursive = async (localDir, remoteDir) => {
          const contents = await ipc.listDirectory(localDir);
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
        if (ipc?.flushMetadata) await ipc.flushMetadata(webhookUrl, api.hashedWebhook);
        await api.syncMetadata();
        ipc.cloudsaveUploadResult(entry.id, true);
        await loadCloudSaves();
      } catch (e) { console.error('[cloudsave] Upload failed:', e); ipc.cloudsaveUploadResult(entry.id, false); }
    });
    return cleanup;
  }, [api, webhookUrl, chunkSize, loadCloudSaves]);

  useEffect(() => {
    if (!ipc?.onCloudSaveDoUploadFile || !api) return;
    const cleanup = ipc.onCloudSaveDoUploadFile(async ({ id, filePath, discordPath }) => {
      try {
        const transferId = `cloudsave-file-${id}-${Date.now()}`;
        const result = await ipc.uploadFileFromPath(webhookUrl, filePath, discordPath, () => {}, transferId, chunkSize);
        if (result.ok) {
          await api.createFile(discordPath, result.messageIds, result.size);
          await api.syncMetadata();
          ipc.cloudsaveUploadFileResult(id, discordPath, true);
          await loadCloudSaves();
        } else { ipc.cloudsaveUploadFileResult(id, discordPath, false); }
      } catch (e) { console.error('[cloudsave] Single file upload failed:', e); ipc.cloudsaveUploadFileResult(id, discordPath, false); }
    });
    return cleanup;
  }, [api, webhookUrl, chunkSize, loadCloudSaves]);

  useEffect(() => {
    if (!ipc?.onCloudsaveLocalMissing) return;
    const cleanup = ipc.onCloudsaveLocalMissing(({ id }) => {
      setCloudSaves(prev => prev.map(s => s.id === id ? { ...s, local_path: null, status: 'local_missing' } : s));
    });
    return cleanup;
  }, []);

  useEffect(() => {
    if (!ipc?.onCloudSaveSyncStatus) return;
    const cleanup = ipc.onCloudSaveSyncStatus((data) => {
      setCloudSaves(prev => prev.map(s => s.id === data.id ? { ...s, ...data } : s));
    });
    return cleanup;
  }, []);

  const restoreCloudSave = useCallback(async (id, force = false) => {
    if (!api) return { ok: false, reason: 'api_not_initialized' };
    setLoading(true);
    try {
      await api.syncMetadata();
      const res = await ipc.cloudsaveRestore(id, force);
      if (res.ok) await loadCloudSaves();
      return res;
    } catch (e) { return { ok: false, reason: e.message }; }
    finally { setLoading(false); }
  }, [api, loadCloudSaves]);

  const exportCloudSave = useCallback(async (id) => {
    if (!api) return { ok: false, reason: 'api_not_initialized' };
    setLoading(true);
    try { await api.syncMetadata(); return await ipc.cloudsaveExportZip(id); }
    catch (e) { return { ok: false, reason: e.message }; }
    finally { setLoading(false); }
  }, [api]);

  const getCloudSaveStatus = useCallback(async (id) => { return await ipc.cloudsaveGetStatus(id); }, []);

  return { cloudSaveEnabled, setCloudSaveEnabled, cloudSaves, loadCloudSaves, addCloudSave, removeCloudSave, syncCloudSave, setLocalPath, restoreCloudSave, exportCloudSave, getCloudSaveStatus, loading };
}