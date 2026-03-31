import { useState, useCallback } from 'react';
import { ipc } from '@/utils/ipc';

export function useFiles(api, refresh) {
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');

  const createFolder = useCallback(async (folderName, onOptimistic) => {
    if (!api || !folderName.trim()) return false;
    try {
      // Optimistic: add a ghost .keep placeholder so folder appears instantly
      const dirPath = currentPath === '/' ? '' : currentPath.slice(1);
      const ghostPath = dirPath ? `${dirPath}/${folderName.trim()}/.keep` : `${folderName.trim()}/.keep`;
      const ghostFile = { id: `ghost-folder-${Date.now()}`, path: ghostPath, size: 0, createdAt: Date.now(), __ghost: true };
      setFiles(prev => [...prev, ghostFile]);
      onOptimistic?.();

      await api.createFolder(folderName.trim(), currentPath);
      await refresh();
      return true;
    }
    catch (e) { console.error('Create folder failed:', e); await refresh(); return false; }
  }, [api, currentPath, refresh, setFiles]);

  const movePath = useCallback(async (oldPath, destDir, id = null) => {
    if (!api) return false;
    const name = oldPath.split('/').pop();
    const newPath = destDir ? `${destDir}/${name}` : name;
    try { await api.renamePath(oldPath, newPath, id); await refresh(); return true; }
    catch (e) { console.error('Move failed:', e); await refresh(); return false; }
  }, [api, refresh]);

  const copyPath = useCallback(async (oldPath, destDir, id = null) => {
    if (!api) return false;
    const name = oldPath.split('/').pop();
    const newPath = destDir ? `${destDir}/${name}` : name;
    try { await api.copyPath(oldPath, newPath, id); await refresh(); return true; }
    catch (e) { console.error('Copy failed:', e); await refresh(); return false; }
  }, [api, refresh]);

  const deletePath = useCallback(async (path, id = null) => {
    if (!api) return false;
    // Optimistic: immediately remove from local state
    setFiles(prev => prev.filter(f => {
      if (id) return f.id !== id;
      return f.path !== path && !f.path.startsWith(path + '/');
    }));
    try { await api.deletePath(path, id); await refresh(); return true; }
    catch (e) { console.error('Delete failed:', e); await refresh(); return false; }
  }, [api, refresh, setFiles]);

  const bulkDelete = useCallback(async (paths) => {
    if (!api) return false;
    // Optimistic: immediately remove from local state
    const pathSet = new Set(paths);
    setFiles(prev => prev.filter(f => {
      const idKey = f.id;
      const pathKey = f.path;
      if (pathSet.has(idKey) || pathSet.has(pathKey)) return false;
      // Also remove children of deleted folders
      for (const p of pathSet) {
        if (!p.includes('-') && pathKey.startsWith(p + '/')) return false;
      }
      return true;
    }));
    try { await api.bulkDelete(paths); await refresh(); return true; }
    catch (e) { console.error('Bulk delete failed:', e); await refresh(); return false; }
  }, [api, refresh, setFiles]);

  const bulkMove = useCallback(async (paths, destDir) => {
    if (!api) return false;
    try { await api.bulkMove(paths, destDir); await refresh(); return true; }
    catch (e) { console.error('Bulk move failed:', e); return false; }
  }, [api, refresh]);

  const bulkCopy = useCallback(async (paths, destDir) => {
    if (!api) return false;
    try { await api.bulkCopy(paths, destDir); await refresh(); return true; }
    catch (e) { console.error('Bulk copy failed:', e); return false; }
  }, [api, refresh]);

  const setLocked = useCallback(async (id, isLocked) => {
    if (!api) return false;
    try {
      const hash = api.hashedWebhook;
      const target = files.find(f => f.id === id);
      if (target) { await ipc.setLocked(id, hash, isLocked); } else {
        const folderPath = id;
        const affectedFiles = files.filter(f => f.path === folderPath || f.path.startsWith(folderPath + '/'));
        for (const f of affectedFiles) { await ipc.setLocked(f.id, hash, isLocked); }
      }
      await refresh(); return true;
    } catch (e) { console.error('Set locked failed:', e); return false; }
  }, [api, files, refresh]);

  const setStarred = useCallback(async (id, isStarred) => {
    if (!api) return false;
    try {
      const hash = api.hashedWebhook;
      const target = files.find(f => f.id === id);
      if (target) { await ipc.setStarred(id, hash, isStarred); } else {
        const keepFile = files.find(f => f.path === (id ? `${id}/.keep` : '.keep'));
        if (keepFile) await ipc.setStarred(keepFile.id, hash, isStarred);
      }
      await refresh(); return true;
    } catch (e) { console.error('Set starred failed:', e); return false; }
  }, [api, files, refresh]);

  const getAllDirs = useCallback(() => {
    const dirs = new Set(['/']);
    files.forEach(f => {
      const parts = f.path.split('/').filter(Boolean);
      for (let i = 1; i <= parts.length - 1; i++) { dirs.add('/' + parts.slice(0, i).join('/')); }
    });
    return [...dirs].sort();
  }, [files]);

  return { files, setFiles, fileTree, setFileTree, currentPath, setCurrentPath, createFolder, movePath, copyPath, deletePath, bulkDelete, bulkMove, bulkCopy, setLocked, setStarred, getAllDirs };
}