import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import { useApp } from '@/AppContext.jsx';
import { getMimeType } from '@/utils/disbox.js';
import { ipc } from '@/utils/ipc';
import useRubberBand from './useRubberBand.js';

export default function useFileGrid({ isLockedView = false, isStarredView = false, isRecentView = false, onNavigate }) {
  const { 
    api, files, currentPath, setCurrentPath, 
    addTransfer, updateTransfer, removeTransfer, cancelTransfer, 
    refresh, loading, movePath, copyPath, deletePath, 
    bulkDelete, bulkMove, bulkCopy, uiScale,
    setLocked, setStarred, verifyPin, hasPin, isVerified, t, animationsEnabled,
    shareEnabled,
    setCurrentTrack, setPlaylist
  } = useApp();

  const [viewMode, setViewMode] = useState('grid');
  const [zoom, setZoom] = useState(1);
  const [sortMode, setSortMode] = useState(() => localStorage.getItem('disbox_sort') || 'name');

  // Load per-folder settings when currentPath changes
  useEffect(() => {
    const folderZoomKey = `disbox_zoom_${currentPath}`;
    const folderViewKey = `disbox_viewMode_${currentPath}`;

    const savedZoom = localStorage.getItem(folderZoomKey);
    setZoom(savedZoom ? Number(savedZoom) : 1);

    const savedView = localStorage.getItem(folderViewKey);
    setViewMode(savedView || 'grid');
  }, [currentPath]);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Simpan zoom per folder
  useEffect(() => {
    localStorage.setItem(`disbox_zoom_${currentPath}`, zoom.toString());
  }, [zoom, currentPath]);

  // Simpan viewMode per folder
  useEffect(() => {
    localStorage.setItem(`disbox_viewMode_${currentPath}`, viewMode);
  }, [viewMode, currentPath]);

  // Reset zoom & view mode saat ganti folder (jika belum ada setting untuk folder baru)
  useEffect(() => {
    const folderZoomKey = `disbox_zoom_${currentPath}`;
    const folderViewKey = `disbox_viewMode_${currentPath}`;
    // Hanya set default jika belum ada
    if (!localStorage.getItem(folderZoomKey)) {
      // Gunakan global zoom sebagai default, atau 1
      const globalZoom = localStorage.getItem('disbox_zoom');
      setZoom(globalZoom ? Number(globalZoom) : 1);
    }
    if (!localStorage.getItem(folderViewKey)) {
      const globalView = localStorage.getItem('disbox_view_mode');
      setViewMode(globalView || 'grid');
    }
  }, [currentPath]);

  useEffect(() => {
    localStorage.setItem('disbox_sort', sortMode);
  }, [sortMode]);

  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [moveModal, setMoveModal] = useState(null);
  const [dragSource, setDragSource] = useState(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [pinPrompt, setPinPrompt] = useState(null);
  const [showBreadcrumbMenu, setShowBreadcrumbMenu] = useState(false);
  const [shareDialog, setShareDialog] = useState(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isLastPartTruncated, setIsLastPartTruncated] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [ghostUploads, setGhostUploads] = useState([]); // { id, name, path, progress }

  const activeFolderRef = useRef(null);
  const contextMenuRef = useRef(null);
  const contentRef = useRef(null);

  useRubberBand(contentRef, { uiScale, selectedFiles, setSelectedFiles, setIsSelectionMode });

  const formatItemDate = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const menu = contextMenuRef.current;
      const rect = menu.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      let { x, y } = contextMenu;
      
      if (x + rect.width > winW - 10) {
        x = winW - rect.width - 10;
      }
      
      if (y + rect.height > winH - 10) {
        y = winH - rect.height - 10;
      }

      if (x !== contextMenu.x || y !== contextMenu.y) {
        setContextMenu(prev => ({ ...prev, x, y }));
      }
    }
  }, [contextMenu]);

  useEffect(() => {
    if (activeFolderRef.current) {
      const el = activeFolderRef.current;
      setIsLastPartTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [currentPath, files]);

  useEffect(() => {
    if (selectedFiles.size === 0) setIsSelectionMode(false);
  }, [selectedFiles]);

  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);
  const dirPath = currentPath === '/' ? '' : currentPath.slice(1);

  const { processedFiles, processedDirs, folderSizes, folderLocks, folderStars } = useMemo(() => {
    const fileList = [];
    const dirsMap = new Map();
    const sizes = new Map();
    const locks = new Map(); 
    const dates = new Map(); 
    const starredFolders = new Set();
    const ghostFolders = new Set(); // track optimistic ghost folders
    const q = debouncedSearch.toLowerCase();

    files.forEach(f => {
      if (f.path.startsWith('cloudsave/')) return;

      const parts = f.path.split('/').filter(Boolean);
      const name = parts[parts.length - 1];

      // Track ghost folders (from optimistic createFolder)
      if (f.__ghost && name === '.keep') {
        const folderPath = parts.slice(0, -1).join('/');
        ghostFolders.add(folderPath);
      }

      let tempPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        tempPath = tempPath ? `${tempPath}/${parts[i]}` : parts[i];
        sizes.set(tempPath, (sizes.get(tempPath) || 0) + (f.size || 0));
        
        const currentMax = dates.get(tempPath) || 0;
        if ((f.createdAt || 0) > currentMax) dates.set(tempPath, f.createdAt);

        if (!locks.has(tempPath)) locks.set(tempPath, { count: 0, lockedCount: 0 });
        const l = locks.get(tempPath);
        l.count++;
        if (f.isLocked) l.lockedCount++;
      }

      if (f.isStarred && name === '.keep') {
        const folderPath = parts.slice(0, -1).join('/');
        starredFolders.add(folderPath);
      }

      const isInside = dirPath === '' || f.path.startsWith(dirPath + '/');
      const matchesSearch = !q || name.toLowerCase().includes(q);
      
      let shouldIncludeFile = false;
      if (isStarredView) {
        if (f.isStarred && !f.isLocked && name !== '.keep') shouldIncludeFile = true;
      } else if (isRecentView) {
        const isRecent = (Date.now() - (f.createdAt || 0)) < (7 * 24 * 60 * 60 * 1000);
        if (isRecent && !f.isLocked && name !== '.keep') shouldIncludeFile = true;
      } else if (isLockedView) {
        if (f.isLocked && name !== '.keep') shouldIncludeFile = true;
      } else {
        // Exclude ghost files from file list (ghost folders only show in dirs)
        if (!f.isLocked && name !== '.keep' && !f.__ghost) shouldIncludeFile = true;
      }

      if (shouldIncludeFile && matchesSearch) {
        const fileDirStr = parts.slice(0, -1).join('/');
        const isDirectChild = fileDirStr === dirPath;
        
        if (q || isDirectChild || isStarredView || isRecentView) {
          fileList.push(f);
        }
      }

      let currentAcc = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const dirName = parts[i];
        const parentPath = currentAcc;
        currentAcc = currentAcc ? `${currentAcc}/${dirName}` : dirName;
        const isChildOfCurrent = parentPath === dirPath;

        const l = locks.get(currentAcc);
        const folderIsLocked = l && l.count > 0 && l.lockedCount === l.count;
        const folderIsStarred = starredFolders.has(currentAcc);

        let shouldIncludeDir = false;
        if (isStarredView) {
          if (folderIsStarred) shouldIncludeDir = true;
        } else if (isRecentView) {
          shouldIncludeDir = false;
        } else if (isLockedView) {
          if (folderIsLocked) shouldIncludeDir = true;
        } else {
          if (!folderIsLocked) shouldIncludeDir = true;
        }

        if (shouldIncludeDir) {
          if (q) {
            if (dirName.toLowerCase().includes(q)) {
              dirsMap.set(currentAcc, dirName);
            }
          } else if (isStarredView) {
            dirsMap.set(currentAcc, dirName);
          } else if (isChildOfCurrent) {
            dirsMap.set(currentAcc, dirName);
          }
        }
      }
    });

    const dirList = Array.from(dirsMap.entries()).map(([fullPath, name]) => ({
      name,
      fullPath,
      createdAt: dates.get(fullPath) || 0,
      size: sizes.get(fullPath) || 0,
      __ghost: ghostFolders.has(fullPath)
    }));

    const sortFn = (a, b) => {
      if (sortMode === 'name') {
        const nameA = (a.name || a.path.split('/').pop()).toLowerCase();
        const nameB = (b.name || b.path.split('/').pop()).toLowerCase();
        return nameA.localeCompare(nameB);
      }
      if (sortMode === 'date') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortMode === 'size') return (b.size || 0) - (a.size || 0);
      return 0;
    };

    if (isRecentView) {
      fileList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else {
      fileList.sort(sortFn);
      dirList.sort(sortFn);
    }

    return {
      processedFiles: fileList,
      processedDirs: dirList,
      folderSizes: sizes,
      folderLocks: locks,
      folderStars: starredFolders
    };
  }, [files, dirPath, debouncedSearch, isLockedView, isStarredView, isRecentView, sortMode]);

  const navigate = useCallback((path) => {
    setCurrentPath(path);
    setSelectedFiles(new Set());
    setContextMenu(null);
    setSearchQuery('');
  }, [setCurrentPath]);

  const handleFolderClick = useCallback((fullPath) => {
    const l = folderLocks.get(fullPath);
    const isLocked = l && l.count > 0 && l.lockedCount === l.count;
    
    const performNavigate = () => {
      if (isStarredView || isRecentView) {
        onNavigate?.('drive');
      }
      navigate('/' + fullPath);
    };

    if (isLocked && !isVerified) {
      setPinPrompt({ title: 'Buka Folder Terkunci', onSuccess: performNavigate });
    } else {
      performNavigate();
    }
  }, [folderLocks, isVerified, isStarredView, isRecentView, onNavigate, navigate]);

  const handleFileClick = useCallback((file) => {
    const ext = file.path.split('.').pop().toLowerCase();
    const isAudio = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(ext);

    if (isAudio) {
      if (file.isLocked && !isVerified) {
        setPinPrompt({ 
          title: 'Putar Musik Terkunci', 
          onSuccess: () => {
            setCurrentTrack(file);
            setPlaylist(processedFiles.filter(f => {
              const fext = f.path.split('.').pop().toLowerCase();
              return ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(fext);
            }));
          } 
        });
      } else {
        setCurrentTrack(file);
        setPlaylist(processedFiles.filter(f => {
          const fext = f.path.split('.').pop().toLowerCase();
          return ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(fext);
        }));
      }
      return;
    }

    if (file.isLocked && !isVerified) {
      setPinPrompt({ title: 'Buka File Terkunci', onSuccess: () => setPreviewFile(file) });
    } else {
      setPreviewFile(file);
    }
  }, [isVerified, setCurrentTrack, setPlaylist, processedFiles]);

  const downloadFile = useCallback(async (file) => {
    const fileName = file.path.split('/').pop();
    const transferId = crypto.randomUUID();
    const totalBytes = file.size || 0;
    const CHUNK_SIZE = 7.5 * 1024 * 1024;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE) || 1;
    const signal = addTransfer({ id: transferId, name: fileName, progress: 0, type: 'download', status: 'active', totalBytes, totalChunks, chunk: 0 });
    try {
      const buffer = await api.downloadFile(file, (p) => {
        if (!signal.aborted) {
          const chunk = totalChunks ? Math.min(Math.floor(p * totalChunks), totalChunks - 1) : 0;
          updateTransfer(transferId, { progress: p, chunk });
        }
      }, signal, transferId);
      if (signal.aborted) return;
      const blob = new Blob([buffer], { type: getMimeType(fileName) });
      const url = URL.createObjectURL(blob);
      if (ipc) {
        const savePath = await ipc.saveFile(fileName);
        if (savePath) await ipc.writeFile(savePath, new Uint8Array(buffer));
      } else {
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
      }
      URL.revokeObjectURL(url);
      updateTransfer(transferId, { status: 'done', progress: 1 });
    } catch (e) {
      if (e.name !== 'AbortError' && !signal.aborted) updateTransfer(transferId, { status: 'error', error: e.message });
    }
  }, [addTransfer, api, updateTransfer]);

  const handleDownloadClick = useCallback((file) => {
    if (file.isLocked && !isVerified) {
      setPinPrompt({ title: 'Download File Terkunci', onSuccess: () => downloadFile(file) });
    } else {
      downloadFile(file);
    }
  }, [isVerified, downloadFile]);

  const handleToggleLock = useCallback(async (itemPath, id, isLocked) => {
    if (!isLocked) {
      setPinPrompt({ 
        title: 'Konfirmasi Buka Kunci', 
        onSuccess: async () => {
          setMoveModal({
            id,
            path: itemPath,
            mode: 'unlock',
            onUnlock: async () => {
              const ok = await setLocked(id || itemPath, false);
              if (ok) toast.success('Kunci dibuka dan item dipindahkan');
              else toast.error('Berhasil pindah tapi gagal membuka kunci');
            }
          });
        } 
      });
      setContextMenu(null);
      return;
    }

    const ok = await setLocked(id || itemPath, isLocked);
    if (ok) {
      toast.success(isLocked ? 'Item dikunci' : 'Kunci dibuka');
      setContextMenu(null);
    } else {
      toast.error('Gagal mengubah status kunci');
    }
  }, [setLocked]);

  const handleToggleStar = useCallback(async (itemPath, id, isStarred) => {
    const ok = await setStarred(id || itemPath, isStarred);
    if (ok) {
      toast.success(isStarred ? 'Ditambahkan ke Starred' : 'Dihapus dari Starred');
      setContextMenu(null);
    } else {
      toast.error('Gagal mengubah status star');
    }
  }, [setStarred]);

  const handleDelete = useCallback(async (targetPath, id = null) => {
    const name = targetPath.split('/').pop();
    setConfirmAction({
      title: 'Hapus Item',
      message: `Apakah Anda yakin ingin menghapus "${name}"? Semua isi di dalamnya akan ikut terhapus.`,
      danger: true,
      onConfirm: async () => {
        try {
          await deletePath(targetPath, id);
          setContextMenu(null);
          toast.success('Dihapus');
        } catch (e) { toast.error('Gagal hapus: ' + e.message); }
      }
    });
  }, [deletePath]);

  const clearSelection = useCallback(() => { setSelectedFiles(new Set()); setIsSelectionMode(false); }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedFiles.size === 0) return;
    setConfirmAction({
      title: 'Hapus Beberapa Item',
      message: `Apakah Anda yakin ingin menghapus ${selectedFiles.size} item terpilih?`,
      danger: true,
      onConfirm: async () => {
        try {
          await bulkDelete([...selectedFiles]);
          clearSelection();
          toast.success(`${selectedFiles.size} item dihapus`);
        } catch (e) { toast.error('Gagal hapus: ' + e.message); }
      }
    });
  }, [selectedFiles, bulkDelete, clearSelection]);

  const handleBulkMove = useCallback((mode = 'move') => {
    if (selectedFiles.size === 0) return;
    setMoveModal({ paths: [...selectedFiles], mode });
  }, [selectedFiles]);

  const startRename = useCallback((path, isFolder = false, id = null) => {
    setRenameTarget({ path, isFolder, id });
    setRenameValue(path.split('/').pop());
    setContextMenu(null);
  }, []);

  const commitRename = useCallback(async () => {
    if (!renameTarget || !renameValue.trim()) { setRenameTarget(null); return; }
    const oldPath = renameTarget.path;
    const parts = oldPath.split('/');
    const newName = renameValue.trim();
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');
    if (oldPath === newPath) { setRenameTarget(null); return; }

    const parentDirPath = parts.slice(0, -1).join('/');
    const exists = files.some(f => {
      const fParts = f.path.split('/');
      const fParent = fParts.slice(0, -1).join('/');
      const fName = fParts[fParts.length - 1];
      
      if (fParent === parentDirPath) {
        if (fName === '.keep') {
          const folderName = fParts[fParts.length - 2];
          return folderName === newName;
        }
        return fName === newName;
      }
      return false;
    });

    if (exists) {
      toast.error('Nama sudah digunakan di folder ini');
      return;
    }

    try {
      await api.renamePath(oldPath, newPath, renameTarget.id);
      refresh();
    } catch (e) { toast.error('Gagal rename: ' + e.message); }
    setRenameTarget(null);
  }, [renameTarget, renameValue, files, api, refresh]);

  const handleUpload = useCallback(async (selectedFiles) => {
    if (!api || !selectedFiles?.length) return;
    setUploading(true);
    for (const file of selectedFiles) {
      const transferId = crypto.randomUUID();
      const isStringPath = typeof file === 'string';
      const nativePath = isStringPath ? file : file.path;
      const fileName = isStringPath ? file.split('/').pop() : file.name;
      const uploadPath = dirPath ? `${dirPath}/${fileName}` : fileName;
      let totalBytes = 0;
      if (nativePath && ipc) {
        try { const info = await ipc.statFile(nativePath); totalBytes = info.size || 0; } catch (_) {}
      } else if (file.size) { totalBytes = file.size; }
      const CHUNK_SIZE = 7.5 * 1024 * 1024;
      const totalChunks = totalBytes > 0 ? Math.ceil(totalBytes / CHUNK_SIZE) || 1 : null;
      const signal = addTransfer({ id: transferId, name: fileName, progress: 0, type: 'upload', status: 'active', totalBytes, totalChunks, chunk: 0 });

      // Add ghost upload item immediately
      const ghostId = `ghost-upload-${transferId}`;
      setGhostUploads(prev => [...prev, { id: ghostId, name: fileName, path: uploadPath, progress: 0 }]);

      try {
        let resultFile = null;
        if (nativePath) {
          resultFile = await api.uploadFile({ nativePath, name: fileName }, uploadPath, (progress) => {
            const chunk = totalChunks ? Math.min(Math.floor(progress * totalChunks), totalChunks - 1) : 0;
            updateTransfer(transferId, { progress, chunk });
            setGhostUploads(prev => prev.map(g => g.id === ghostId ? { ...g, progress } : g));
          }, signal, transferId);
        } else {
          const buffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
          });
          const tc = Math.ceil(buffer.byteLength / CHUNK_SIZE) || 1;
          updateTransfer(transferId, { totalBytes: buffer.byteLength, totalChunks: tc });
          resultFile = await api.uploadFile({ buffer, name: fileName, size: buffer.byteLength }, uploadPath, (progress) => {
            const chunk = Math.min(Math.floor(progress * tc), tc - 1);
            updateTransfer(transferId, { progress, chunk });
            setGhostUploads(prev => prev.map(g => g.id === ghostId ? { ...g, progress } : g));
          }, signal);
        }
        if (isLockedView && resultFile?.id) {
          await ipc.setLocked(resultFile.id, api.hashedWebhook, 1);
        }
        if (!signal.aborted) updateTransfer(transferId, { status: 'done', progress: 1 });
        setGhostUploads(prev => prev.map(g => g.id === ghostId ? { ...g, progress: 1 } : g));
      } catch (e) {
        if (e.name !== 'AbortError' && !signal.aborted) {
          updateTransfer(transferId, { status: 'error', error: e.message });
          setTimeout(() => removeTransfer(transferId), 3000);
        }
        setGhostUploads(prev => prev.filter(g => g.id !== ghostId));
      }
    }
    setUploading(false);
    // Remove ghost items after refresh completes so no flash of duplicate
    await refresh();
    setGhostUploads([]);
  }, [api, dirPath, addTransfer, updateTransfer, isLockedView, refresh]);

  const handlePickFiles = useCallback(async () => {
    if (ipc) {
      const paths = await ipc.openFiles();
      if (paths) handleUpload(paths);
    } else {
      const input = document.createElement('input');
      input.type = 'file'; input.multiple = true;
      input.onchange = (e) => handleUpload(Array.from(e.target.files));
      input.click();
    }
  }, [handleUpload]);

  const handleDropZone = useCallback((e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) handleUpload(droppedFiles);
  }, [handleUpload]);

  const toggleSelect = useCallback((id, e) => {
    e.stopPropagation();
    if (!e.ctrlKey && !isSelectionMode) { setSelectedFiles(new Set()); return; }
    setIsSelectionMode(true);
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, [isSelectionMode]);

  const handleDragStart = useCallback((e, itemPath, id = null) => {
    const itemKey = id || itemPath;
    if (isSelectionMode && selectedFiles.has(itemKey)) {
      const payload = { bulk: true, items: [...selectedFiles] };
      const payloadStr = JSON.stringify(payload);
      e.dataTransfer.setData('text/plain', payloadStr);
      e.dataTransfer.effectAllowed = 'move';
      setDragSource(payload);
      return;
    }
    const dragData = id || itemPath;
    setDragSource(dragData);
    e.dataTransfer.setData('text/plain', dragData);
    e.dataTransfer.effectAllowed = 'move';
  }, [isSelectionMode, selectedFiles]);

  const handleDropMove = useCallback(async (e, destDir) => {
    e.preventDefault();
    let raw = e.dataTransfer.getData('text/plain');
    let data = raw;

    if (!data || data === '') {
      data = dragSource;
    } else {
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') data = parsed;
      } catch (_) {
      }
    }

    if (!data) return;
    if (e.dataTransfer.files.length > 0) return;
    const normalizedDest = destDir.startsWith('/') ? destDir.slice(1) : destDir;

    if (data.bulk && Array.isArray(data.items)) {
      const items = data.items;
      for (const target of items) {
        const isId = target.includes('-') && target.length > 30;
        let srcPath = target;
        if (isId) { const f = files.find(x => x.id === target); if (f) srcPath = f.path; }
        if (normalizedDest === srcPath || normalizedDest.startsWith(srcPath + '/')) {
          toast.error('Tidak bisa memindahkan ke dalam folder itu sendiri');
          setDragSource(null); return;
        }
      }
      const ok = await bulkMove(items, normalizedDest);
      if (ok) {
        toast.success(`${items.length} item dipindahkan`);
        clearSelection();
      } else {
        toast.error('Gagal memindahkan beberapa item');
      }
      setDragSource(null); return;
    }

    const source = typeof data === 'string' ? data : null;
    if (!source || source.startsWith('http')) { setDragSource(null); return; }
    
    const isId = source.includes('-') && source.length > 30;
    let sourcePath = source;
    if (isId) { const f = files.find(x => x.id === source); if (f) sourcePath = f.path; }
    
    const sourceParent = sourcePath.split('/').slice(0, -1).join('/');
    if (sourceParent === normalizedDest) { setDragSource(null); return; }
    if (sourcePath === normalizedDest || normalizedDest.startsWith(sourcePath + '/')) {
      toast.error('Tidak bisa memindahkan ke folder yang sama atau sub-folder');
      setDragSource(null); return;
    }
    
    const ok = await (isId ? bulkMove([source], normalizedDest) : movePath(sourcePath, normalizedDest));
    if (ok) {
      toast.success('Dipindahkan');
    } else {
      toast.error('Gagal pindah');
    }
    setDragSource(null);
  }, [dragSource, files, bulkMove, clearSelection, movePath]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (selectedFiles.size > 0) handleBulkDelete();
        else if (contextMenu) handleDelete(contextMenu.path, contextMenu.file?.id);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFiles, contextMenu, handleBulkDelete, handleDelete]);

  return {
    // State
    viewMode, setViewMode,
    zoom, setZoom,
    sortMode, setSortMode,
    searchQuery, setSearchQuery,
    selectedFiles, setSelectedFiles,
    contextMenu, setContextMenu,
    renameTarget, setRenameTarget,
    renameValue, setRenameValue,
    uploading,
    showCreateFolder, setShowCreateFolder,
    moveModal, setMoveModal,
    dragSource, setDragSource,
    isSelectionMode, setIsSelectionMode,
    confirmAction, setConfirmAction,
    dragOverTarget, setDragOverTarget,
    previewFile, setPreviewFile,
    pinPrompt, setPinPrompt,
    showBreadcrumbMenu, setShowBreadcrumbMenu,
    shareDialog, setShareDialog,
    showSortMenu, setShowSortMenu,
    isLastPartTruncated,
    isDragOver, setIsDragOver,
    ghostUploads,
    
    // Refs
    activeFolderRef,
    contextMenuRef,
    contentRef,

    // Handlers
    formatItemDate,
    navigate,
    handleFolderClick,
    handleFileClick,
    handleDownloadClick,
    handleToggleLock,
    handleToggleStar,
    handleDelete,
    handleBulkDelete,
    handleBulkMove,
    startRename,
    commitRename,
    handleUpload,
    handlePickFiles,
    handleDropZone,
    downloadFile,
    toggleSelect,
    clearSelection,
    handleDragStart,
    handleDropMove,

    // Processed data
    pathParts,
    dirPath,
    processedFiles,
    processedDirs,
    folderSizes,
    folderLocks,
    folderStars,

    // App Context (passthrough for convenience if needed)
    loading,
    refresh,
    t,
    uiScale,
    animationsEnabled,
    shareEnabled,
    currentPath
  };
}
