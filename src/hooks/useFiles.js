import { useState, useCallback } from 'react';
import { ipc } from '@/utils/ipc';

export function useFiles(api, refresh) {
  const [files, setFiles] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [currentPath, setCurrentPath] = useState('/');

  const createFolder = useCallback(async (folderName) => {
    if (!api || !folderName.trim()) return false;
    const name = folderName.trim();
    const folderPath = currentPath === '/' ? `${name}/.keep` : `${currentPath.replace(/^\//, '')}/${name}/.keep`;
    
    // --- OPTIMISTIC ---
    const tempId = 'temp-' + Date.now();
    const optFolder = { path: folderPath, messageIds: [], size: 0, id: tempId, isOptimistic: true, createdAt: Date.now() };
    setFiles(prev => [...prev, optFolder]);

    try { 
      await api.createFolder(name, currentPath); 
      setFiles(prev => prev.map(f => f.id === tempId ? { ...f, isOptimistic: false } : f));
      return true; 
    }
    catch (e) { 
      console.error('Create folder failed:', e);
      setFiles(prev => prev.filter(f => f.id !== tempId));
      return false; 
    }
  }, [api, currentPath, refresh]);

  const deletePath = useCallback(async (path, id = null) => {
    if (!api) return false;
    
    // --- OPTIMISTIC ---
    const backup = [...files];
    const filtered = files.filter(f => {
      if (id && f.id === id) return false;
      if (!id && f.path === path) return false;
      if (f.path.startsWith(path + '/')) return false;
      return true;
    });
    setFiles(filtered);

    try { 
      await api.deletePath(path, id); 
      return true; 
    }
    catch (e) { 
      console.error('Delete failed:', e);
      setFiles(backup);
      return false; 
    }
  }, [api, files]);

  const bulkDelete = useCallback(async (paths) => {
    if (!api) return false;
    try { await api.bulkDelete(paths); await refresh(); return true; }
    catch (e) { console.error('Bulk delete failed:', e); return false; }
  }, [api, refresh]);

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