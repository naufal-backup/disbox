import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  Upload, FolderPlus, Grid3x3, List, Search,
  Download, Trash2, Edit3, Folder, Lock, Unlock, Star,
  ChevronRight, Home, Move, Copy, Check, AlertCircle, ZoomIn, Link2,
  RefreshCw, ArrowUpDown, ChevronDown, MoreVertical,
  FileText, FileAudio, FileArchive, File as FileGeneric, FileCode, FileSpreadsheet
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../context/useAppHook.js';
import { formatSize, getFileIcon, getMimeType } from '../utils/disbox.js';
import { renderFileIcon, formatItemDate } from '../utils/fileHelpers.jsx';
import { CreateFolderModal, MoveModal, ConfirmModal } from './FolderModal.jsx';
import ShareDialog from './ShareDialog.jsx';
import FilePreview from './FilePreview.jsx';
import FileThumbnail from './FileThumbnail.jsx';
import PinPromptModal from './PinPromptModal.jsx';
import styles from './FileGrid.module.css';
import './FileGrid.rubberband.patch.css';
import { motion, AnimatePresence } from 'framer-motion';
import useRubberBand from '../hooks/useRubberBand.js';

export default function FileGrid({ isLockedView = false, isStarredView = false, isRecentView = false, onNavigate }) {
  const {
    api, files, currentPath, setCurrentPath,
    addTransfer, updateTransfer, removeTransfer, cancelTransfer,
    refresh, loading, movePath, copyPath, deletePath,
    bulkDelete, bulkMove, bulkCopy, uiScale,
    setLocked, setStarred, verifyPin, hasPin, isVerified, t, animationsEnabled,
    shareEnabled,
    setCurrentTrack, setPlaylist,
    pendingOperations, addPendingItem, updatePendingProgress, unmarkPending
  } = useApp();

  const [viewMode, setViewMode] = useState('grid');
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('disbox_zoom')) || 1);
  const [sortMode, setSortMode] = useState(() => localStorage.getItem('disbox_sort') || 'name');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => { localStorage.setItem('disbox_zoom', zoom.toString()); }, [zoom]);
  useEffect(() => { localStorage.setItem('disbox_sort', sortMode); }, [sortMode]);

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
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [pinPrompt, setPinPrompt] = useState(null);
  const [showBreadcrumbMenu, setShowBreadcrumbMenu] = useState(false);
  const [shareDialog, setShareDialog] = useState(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isLastPartTruncated, setIsLastPartTruncated] = useState(false);
  const activeFolderRef = useRef(null);
  const contextMenuRef = useRef(null);
  const contentRef = useRef(null);

  useRubberBand(contentRef, { uiScale, selectedFiles, setSelectedFiles, setIsSelectionMode });

  useEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const menu = contextMenuRef.current;
      const rect = menu.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      let { x, y } = contextMenu;
      if (x + rect.width > winW - 10) x = winW - rect.width - 10;
      if (y + rect.height > winH - 10) y = winH - rect.height - 10;
      if (x !== contextMenu.x || y !== contextMenu.y) setContextMenu(prev => ({ ...prev, x, y }));
    }
  }, [contextMenu]);

  useEffect(() => {
    if (activeFolderRef.current) {
      const el = activeFolderRef.current;
      setIsLastPartTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [currentPath, files]);

  useEffect(() => { if (selectedFiles.size === 0) setIsSelectionMode(false); }, [selectedFiles]);

  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);
  const dirPath = currentPath === '/' ? '' : currentPath.slice(1);

  const { processedFiles, processedDirs, folderSizes, folderLocks, folderStars } = useMemo(() => {
    const fileList = [];
    const dirsMap = new Map();
    const sizes = new Map();
    const locks = new Map(); 
    const dates = new Map(); 
    const starredFolders = new Set();
    const q = debouncedSearch.toLowerCase();

    const combinedItems = [];
    files.forEach(f => {
      const pending = pendingOperations[f.path];
      if (pending?.type !== 'delete') combinedItems.push(f);
    });

    Object.values(pendingOperations).forEach(op => {
      if (op.type === 'upload' && op.tempItem) {
        if (!combinedItems.find(f => f.path === op.tempItem.path)) combinedItems.push(op.tempItem);
      }
    });

    combinedItems.forEach(item => {
      if (item.path.startsWith('cloudsave/')) return;
      const parts = item.path.split('/').filter(Boolean);
      const name = parts[parts.length - 1];
      let tempPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        tempPath = tempPath ? `${tempPath}/${parts[i]}` : parts[i];
        sizes.set(tempPath, (sizes.get(tempPath) || 0) + (item.size || 0));
        const currentMax = dates.get(tempPath) || 0;
        if ((item.createdAt || 0) > currentMax) dates.set(tempPath, item.createdAt);
        if (!locks.has(tempPath)) locks.set(tempPath, { count: 0, lockedCount: 0 });
        const l = locks.get(tempPath);
        l.count++;
        if (item.isLocked) l.lockedCount++;
      }
      if (item.isStarred && name === '.keep') {
        const folderPath = parts.slice(0, -1).join('/');
        starredFolders.add(folderPath);
      }
      const matchesSearch = !q || name.toLowerCase().includes(q);
      let includeBasedOnView = false;
      if (isLockedView) {
        includeBasedOnView = item.isLocked;
      } else if (isStarredView) {
        includeBasedOnView = item.isStarred;
      } else if (isRecentView) {
        const isRecent = (Date.now() - (item.createdAt || 0)) < (7 * 24 * 60 * 60 * 1000);
        includeBasedOnView = isRecent;
      } else {
        includeBasedOnView = !item.isLocked;
      }

      if (includeBasedOnView && matchesSearch && name !== '.keep') {
        const fileDirStr = parts.slice(0, -1).join('/');
        const isDirectChild = fileDirStr === dirPath;
        if (q || isStarredView || isRecentView || isLockedView || isDirectChild) {
          fileList.push(item);
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
        
        let includeDirBasedOnView = false;
        if (isLockedView) {
          includeDirBasedOnView = folderIsLocked;
        } else if (isStarredView) {
          includeDirBasedOnView = folderIsStarred;
        } else if (isRecentView) {
          includeDirBasedOnView = false;
        } else {
          includeDirBasedOnView = !folderIsLocked;
        }

        if (includeDirBasedOnView && (q ? dirName.toLowerCase().includes(q) : (isStarredView || isLockedView || isChildOfCurrent))) {
          dirsMap.set(currentAcc, dirName);
        }
      }
    });

    Object.keys(pendingOperations).forEach(path => {
      const op = pendingOperations[path];
      if (op.type === 'create') {
        const parts = path.split('/').filter(Boolean);
        const dirName = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');
        if (parentPath === dirPath) dirsMap.set(path, dirName);
      }
    });

    const dirList = Array.from(dirsMap.entries()).map(([fullPath, name]) => {
      const pending = pendingOperations[fullPath];
      return {
        name, fullPath,
        createdAt: dates.get(fullPath) || 0,
        size: sizes.get(fullPath) || 0,
        _pending: pending
      };
    }).filter(dir => dir._pending?.type !== 'delete');

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

    if (isRecentView) fileList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    else { fileList.sort(sortFn); dirList.sort(sortFn); }

    return { processedFiles: fileList, processedDirs: dirList, folderSizes: sizes, folderLocks: locks, folderStars: starredFolders };
  }, [files, pendingOperations, dirPath, debouncedSearch, isLockedView, isStarredView, isRecentView, sortMode]);

  const navigate = (path) => { setCurrentPath(path); setSelectedFiles(new Set()); setContextMenu(null); setSearchQuery(''); };

  const handleFolderClick = (fullPath) => {
    const l = folderLocks.get(fullPath);
    const isLocked = l && l.count > 0 && l.lockedCount === l.count;
    const performNavigate = () => { if (isStarredView || isRecentView) onNavigate?.('drive'); navigate('/' + fullPath); };
    if (isLocked && !isVerified) setPinPrompt({ title: 'Buka Folder Terkunci', onSuccess: performNavigate });
    else performNavigate();
  };

  const handleFileClick = (file) => {
    const ext = file.path.split('.').pop().toLowerCase();
    const isAudio = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(ext);
    if (isAudio) {
      if (file.isLocked && !isVerified) {
        setPinPrompt({ title: 'Putar Musik Terkunci', onSuccess: () => { setCurrentTrack(file); setPlaylist(processedFiles.filter(f => ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(f.path.split('.').pop().toLowerCase()))); } });
      } else { setCurrentTrack(file); setPlaylist(processedFiles.filter(f => ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(f.path.split('.').pop().toLowerCase()))); }
      return;
    }
    if (file.isLocked && !isVerified) setPinPrompt({ title: 'Buka File Terkunci', onSuccess: () => setPreviewFile(file) });
    else setPreviewFile(file);
  };

  const downloadFile = async (file) => {
    const fileName = file.path.split('/').pop();
    const transferId = crypto.randomUUID();
    const totalBytes = file.size || 0;
    const CHUNK_SIZE = 7.5 * 1024 * 1024;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE) || 1;
    const signal = addTransfer({ id: transferId, name: fileName, progress: 0, type: 'download', status: 'active', totalBytes, totalChunks, chunk: 0 });
    try {
      const buffer = await api.downloadFile(file, (p) => { if (!signal.aborted) { const chunk = totalChunks ? Math.min(Math.floor(p * totalChunks), totalChunks - 1) : 0; updateTransfer(transferId, { progress: p, chunk }); } }, signal, transferId);
      if (signal.aborted) return;
      const blob = new Blob([buffer], { type: getMimeType(fileName) });
      const url = URL.createObjectURL(blob);
      if (window.electron) { const savePath = await window.electron.saveFile(fileName); if (savePath) await window.electron.writeFile(savePath, new Uint8Array(buffer)); }
      else { const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); }
      URL.revokeObjectURL(url);
      updateTransfer(transferId, { status: 'done', progress: 1 });
    } catch (e) { if (e.name !== 'AbortError' && !signal.aborted) updateTransfer(transferId, { status: 'error', error: e.message }); }
  };

  const handleDownloadClick = (file) => { if (file.isLocked && !isVerified) setPinPrompt({ title: 'Download File Terkunci', onSuccess: () => downloadFile(file) }); else downloadFile(file); };

  const handleToggleLock = async (itemPath, id, isLocked) => {
    if (!isLocked) {
      setPinPrompt({ title: 'Konfirmasi Buka Kunci', onSuccess: async () => { setMoveModal({ id, path: itemPath, mode: 'unlock', onUnlock: async () => { const ok = await setLocked(id || itemPath, false); if (ok) toast.success('Kunci dibuka dan item dipindahkan'); else toast.error('Berhasil pindah tapi gagal membuka kunci'); } }); } });
      setContextMenu(null); return;
    }
    const ok = await setLocked(id || itemPath, isLocked);
    if (ok) { toast.success(isLocked ? 'Item dikunci' : 'Kunci dibuka'); setContextMenu(null); }
    else toast.error('Gagal mengubah status kunci');
  };

  const handleToggleStar = async (itemPath, id, isStarred) => {
    const ok = await setStarred(id || itemPath, isStarred);
    if (ok) { toast.success(isStarred ? 'Ditambahkan ke Starred' : 'Dihapus dari Starred'); setContextMenu(null); }
    else toast.error('Gagal mengubah status star');
  };

  const handleDelete = async (targetPath, id = null) => {
    const name = targetPath.split('/').pop();
    setConfirmAction({
      title: 'Hapus Item',
      message: `Apakah Anda yakin ingin menghapus "${name}"? Semua isi di dalamnya akan ikut terhapus.`,
      danger: true,
      onConfirm: async () => {
        try {
          const foldersToMark = [];
          files.forEach(f => { if (f.path.startsWith(targetPath + '/')) foldersToMark.push(f.path); });
          [targetPath, ...foldersToMark].forEach(p => addPendingItem(p, null, 'delete'));
          await deletePath(targetPath, id);
          setContextMenu(null);
          toast.success('Dihapus');
        } catch (e) { toast.error('Gagal hapus: ' + e.message); }
        finally { unmarkPending(targetPath); }
      }
    });
  };

  const clearSelection = () => { setSelectedFiles(new Set()); setIsSelectionMode(false); };

  const handleBulkDelete = async () => {
    if (selectedFiles.size === 0) return;
    setConfirmAction({
      title: 'Hapus Beberapa Item',
      message: `Apakah Anda yakin ingin menghapus ${selectedFiles.size} item terpilih?`,
      danger: true,
      onConfirm: async () => {
        try {
          const items = [...selectedFiles];
          items.forEach(p => addPendingItem(p, null, 'delete'));
          await bulkDelete(items);
          clearSelection();
          toast.success(`${items.length} item dihapus`);
        } catch (e) { toast.error('Gagal hapus: ' + e.message); }
        finally { selectedFiles.forEach(p => unmarkPending(p)); }
      }
    });
  };

  const handleBulkMove = (mode = 'move') => { if (selectedFiles.size === 0) return; setMoveModal({ paths: [...selectedFiles], mode }); };

  const startRename = (path, isFolder = false, id = null) => { setRenameTarget({ path, isFolder, id }); setRenameValue(path.split('/').pop()); setContextMenu(null); };

  const commitRename = async () => {
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
        if (fName === '.keep') { const folderName = fParts[fParts.length - 2]; return folderName === newName; }
        return fName === newName;
      }
      return false;
    });
    if (exists) { toast.error('Nama sudah digunakan di folder ini'); return; }
    try { await api.renamePath(oldPath, newPath, renameTarget.id); refresh(); }
    catch (e) { toast.error('Gagal rename: ' + e.message); }
    setRenameTarget(null);
  };

  const handleUpload = async (selectedFiles) => {
    if (!api || !selectedFiles?.length) return;
    setUploading(true);
    const latestFiles = await api.getFileSystem();
    for (const file of selectedFiles) {
      const transferId = crypto.randomUUID();
      const isStringPath = typeof file === 'string';
      const fileName = isStringPath ? file.split('/').pop() : file.name;
      const uploadPath = dirPath ? `${dirPath}/${fileName}` : fileName;
      const isDuplicate = latestFiles.some(f => f.path === uploadPath) || Object.keys(pendingOperations).some(p => p === uploadPath);
      if (isDuplicate) { toast.error(`File "${fileName}" sudah ada di folder ini.`, { icon: <AlertCircle size={16} style={{ color: 'var(--amber)' }} /> }); continue; }
      const placeholder = { path: uploadPath, name: fileName, size: 0, createdAt: Date.now(), _pending: { type: 'upload', progress: 0 } };
      addPendingItem(uploadPath, placeholder, 'upload');
      let totalBytes = 0;
      const nativePath = isStringPath ? file : null;
      if (nativePath && window.electron) { try { const info = await window.electron.statFile(nativePath); totalBytes = info.size || 0; } catch (_) {} }
      else if (file.size) totalBytes = file.size;
      const CHUNK_SIZE = 7.5 * 1024 * 1024;
      const totalChunks = totalBytes > 0 ? Math.ceil(totalBytes / CHUNK_SIZE) || 1 : null;
      const signal = addTransfer({ id: transferId, name: fileName, progress: 0, type: 'upload', status: 'active', totalBytes, totalChunks, chunk: 0 });
      try {
        if (nativePath) { await api.uploadFile({ nativePath, name: fileName }, uploadPath, (progress) => { updateTransfer(transferId, { progress, chunk: totalChunks ? Math.min(Math.floor(progress * totalChunks), totalChunks - 1) : 0 }); updatePendingProgress(uploadPath, progress); }, signal, transferId); }
        else {
          const buffer = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = e => resolve(e.target.result); reader.onerror = reject; reader.readAsArrayBuffer(file); });
          const tc = Math.ceil(buffer.byteLength / CHUNK_SIZE) || 1;
          updateTransfer(transferId, { totalBytes: buffer.byteLength, totalChunks: tc });
          await api.uploadFile({ buffer, name: fileName, size: buffer.byteLength }, uploadPath, (progress) => { updateTransfer(transferId, { progress, chunk: Math.min(Math.floor(progress * tc), tc - 1) }); updatePendingProgress(uploadPath, progress); }, signal);
        }
        updateTransfer(transferId, { status: 'done', progress: 1 });
      } catch (e) { if (e.name !== 'AbortError' && !signal.aborted) { updateTransfer(transferId, { status: 'error', error: e.message }); setTimeout(() => removeTransfer(transferId), 3000); } }
      finally { unmarkPending(uploadPath); }
    }
    setUploading(false);
    await refresh();
  };

  const handlePickFiles = async () => {
    if (window.electron) { const paths = await window.electron.openFiles(); if (paths) handleUpload(paths); }
    else { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.onchange = (e) => handleUpload(Array.from(e.target.files)); input.click(); }
  };

  const handleDropZone = (e) => { e.preventDefault(); const droppedFiles = Array.from(e.dataTransfer.files); if (droppedFiles.length > 0) handleUpload(droppedFiles); };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    if (!e.ctrlKey && !isSelectionMode) { setSelectedFiles(new Set()); return; }
    setIsSelectionMode(true);
    setSelectedFiles(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const handleDragStart = (e, itemPath, id = null) => {
    const itemKey = id || itemPath;
    if (isSelectionMode && selectedFiles.has(itemKey)) { const payload = { bulk: true, items: [...selectedFiles] }; e.dataTransfer.setData('text/plain', JSON.stringify(payload)); e.dataTransfer.effectAllowed = 'move'; setDragSource(payload); return; }
    const dragData = id || itemPath;
    setDragSource(dragData);
    e.dataTransfer.setData('text/plain', dragData);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropMove = async (e, destDir) => {
    e.preventDefault();
    let data = e.dataTransfer.getData('text/plain') || dragSource;
    try { const parsed = JSON.parse(data); if (parsed && typeof parsed === 'object') data = parsed; } catch (_) {}
    if (!data || e.dataTransfer.files.length > 0) return;
    const normalizedDest = destDir.startsWith('/') ? destDir.slice(1) : destDir;
    if (data.bulk && Array.isArray(data.items)) {
      for (const target of data.items) {
        let srcPath = target;
        if (target.includes('-') && target.length > 30) { const f = files.find(x => x.id === target); if (f) srcPath = f.path; }
        if (normalizedDest === srcPath || normalizedDest.startsWith(srcPath + '/')) { toast.error('Tidak bisa memindahkan ke dalam folder itu sendiri'); setDragSource(null); return; }
      }
      const ok = await bulkMove(data.items, normalizedDest);
      if (ok) { toast.success(`${data.items.length} item dipindahkan`); clearSelection(); } else toast.error('Gagal memindahkan beberapa item');
      setDragSource(null); return;
    }
    const source = typeof data === 'string' ? data : null;
    if (!source || source.startsWith('http')) { setDragSource(null); return; }
    let sourcePath = source;
    if (source.includes('-') && source.length > 30) { const f = files.find(x => x.id === source); if (f) sourcePath = f.path; }
    const sourceParent = sourcePath.split('/').slice(0, -1).join('/');
    if (sourceParent === normalizedDest || sourcePath === normalizedDest || normalizedDest.startsWith(sourcePath + '/')) { if (sourceParent !== normalizedDest) toast.error('Tidak bisa memindahkan ke folder yang sama atau sub-folder'); setDragSource(null); return; }
    const ok = await (source.includes('-') && source.length > 30 ? bulkMove([source], normalizedDest) : movePath(sourcePath, normalizedDest));
    if (ok) toast.success('Dipindahkan'); else toast.error('Gagal pindah');
    setDragSource(null);
  };

  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Delete') { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; if (selectedFiles.size > 0) handleBulkDelete(); else if (contextMenu) handleDelete(contextMenu.path, contextMenu.file?.id); } };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFiles, contextMenu, handleBulkDelete, handleDelete]);

  return (
    <div className={`${styles.container} ${isDragOver ? styles.dragOver : ''} ${isSelectionMode ? styles.isSelectionMode : ''}`} style={{ '--zoom': zoom }} onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files') && !dragSource) setIsDragOver(true); else setIsDragOver(false); }} onDragLeave={() => setIsDragOver(false)} onDrop={(e) => { setIsDragOver(false); if (e.dataTransfer.files.length > 0) handleDropZone(e); }} onClick={() => { setContextMenu(null); if (!isSelectionMode) clearSelection(); }} onContextMenu={(e) => { if (e.target.closest('.' + styles.toolbar)) return; e.preventDefault(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, type: 'empty' }); }}>
      <div className={styles.toolbar}>
        {(() => {
          const totalChars = pathParts.join('').length + (pathParts.length * 3);
          const isCompact = (totalChars > 45 || pathParts.length > 4) && pathParts.length > 1;
          const lastPart = pathParts[pathParts.length - 1] || '';
          const displayLen = isCompact ? (10 + lastPart.length) : totalChars;
          const isShort = displayLen < 160;
          return (
            <div className={styles.breadcrumb} style={{ marginRight: isShort ? 24 : 124 }}>
              <button className={styles.breadcrumbItem} onClick={() => navigate('/')} onDragOver={e => e.preventDefault()} onDrop={e => handleDropMove(e, '')}><Home size={13} /></button>
              {!isCompact ? pathParts.map((part, i) => { const targetPath = '/' + pathParts.slice(0, i + 1).join('/'); const isLast = i === pathParts.length - 1; return <span key={i} className={styles.breadcrumbRow}><ChevronRight size={12} className={styles.breadcrumbSep} /><button className={`${styles.breadcrumbItem} ${isLast ? styles.breadcrumbActive : ''}`} onClick={() => navigate(targetPath)}>{part}</button></span>; }) : <>
                <ChevronRight size={12} className={styles.breadcrumbSep} />
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', zIndex: showBreadcrumbMenu ? 1001 : 'auto' }}>
                  <button className={`${styles.breadcrumbItem} ${styles.breadcrumbEllipsis}`} onClick={(e) => { e.stopPropagation(); setShowBreadcrumbMenu(!showBreadcrumbMenu); }}>...</button>
                  {showBreadcrumbMenu && <><div className={styles.breadcrumbBackdrop} onClick={(e) => { e.stopPropagation(); setShowBreadcrumbMenu(false); }} /><div className={styles.breadcrumbMenu}>{pathParts.slice(0, -1).map((part, i) => { const targetPath = '/' + pathParts.slice(0, i + 1).join('/'); return <button key={i} className={styles.breadcrumbMenuItem} style={{ paddingLeft: 12 + (i * 12) }} onClick={() => { navigate(targetPath); setShowBreadcrumbMenu(false); }}><div className={styles.menuBranch} style={{ left: 8 + (i * 12) }} /><Folder size={12} style={{ color: 'var(--amber)', flexShrink: 0 }} /><span className="truncate">{part}</span></button>; })}</div></>}
                </div>
                <ChevronRight size={12} className={styles.breadcrumbSep} />
                <button ref={activeFolderRef} className={`${styles.breadcrumbItem} ${styles.breadcrumbActive}`} onClick={() => navigate('/' + pathParts.join('/'))}>{lastPart}</button>
              </>}
            </div>
          );
        })()}
        <div className={styles.toolbarRight}>
          <div className={styles.searchBox}><Search size={13} /><input type="text" placeholder={t('search')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className={styles.searchInput} /></div>
          <div className={styles.sortBoxContainer}>
            <button className={styles.sortBox} onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}><ArrowUpDown size={12} className={styles.sortIconMain} /><span className={styles.sortText}>{sortMode === 'name' ? t('sort_name') : sortMode === 'date' ? t('sort_date') : t('sort_size')}</span><ChevronDown size={12} className={`${styles.sortIconArrow} ${showSortMenu ? styles.rotated : ''}`} /></button>
            {showSortMenu && (<><div className={styles.menuBackdrop} onClick={(e) => { e.stopPropagation(); setShowSortMenu(false); }} /><div className={styles.sortMenu}><button className={`${styles.sortMenuItem} ${sortMode === 'name' ? styles.active : ''}`} onClick={() => { setSortMode('name'); setShowSortMenu(false); }}><div className={styles.checkIcon}>{sortMode === 'name' && <Check size={12} />}</div>{t('sort_name')}</button><button className={`${styles.sortMenuItem} ${sortMode === 'date' ? styles.active : ''}`} onClick={() => { setSortMode('date'); setShowSortMenu(false); }}><div className={styles.checkIcon}>{sortMode === 'date' && <Check size={12} />}</div>{t('sort_date')}</button><button className={`${styles.sortMenuItem} ${sortMode === 'size' ? styles.active : ''}`} onClick={() => { setSortMode('size'); setShowSortMenu(false); }}><div className={styles.checkIcon}>{sortMode === 'size' && <Check size={12} />}</div>{t('sort_size')}</button></div></>)}
          </div>
          <div className={styles.viewToggle}><button className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewActive : ''}`} onClick={() => setViewMode('grid')}><Grid3x3 size={13} /></button><button className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewActive : ''}`} onClick={() => setViewMode('list')}><List size={13} /></button></div>
          <div className={styles.zoomBox}><ZoomIn size={13} /><input type="range" min="0.6" max="1.8" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} className={styles.zoomSlider} /></div>
          <button className={styles.folderBtn} onClick={() => setShowCreateFolder(true)} title={t('new_folder')}><FolderPlus size={14} /></button>
          <button className={styles.uploadBtn} onClick={handlePickFiles} disabled={uploading}><Upload size={14} /><span>{uploading ? 'Uploading…' : t('upload')}</span></button>
        </div>
      </div>
      <div ref={contentRef} className={styles.content} style={{ position: 'relative' }}>
        <AnimatePresence mode="wait">
          {loading && processedFiles.length === 0 && processedDirs.length === 0 ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.loading}>{[...Array(6)].map((_, i) => <div key={i} className={`skeleton ${styles.skeletonCard}`} />)}</motion.div>
          ) : processedFiles.length === 0 && processedDirs.length === 0 ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.empty}><div className={styles.emptyIcon}>📂</div><p className={styles.emptyTitle}>{t('empty_folder')}</p><p className={styles.emptyHint}>{t('empty_hint')}</p></motion.div>
          ) : viewMode === 'grid' ? (
            <motion.div layout key={`grid-${currentPath}-${isLockedView}-${isStarredView}-${isRecentView}`} initial={animationsEnabled ? { opacity: 0, y: 5 } : false} animate={{ opacity: 1, y: 0 }} exit={animationsEnabled ? { opacity: 0, y: -5 } : false} transition={{ duration: 0.15 }} className={styles.grid}>
              {processedDirs.map(({ name: dir, fullPath, _pending }) => {
                const folderSize = folderSizes.get(fullPath) || 0;
                const l = folderLocks.get(fullPath);
                const isLocked = l && l.count > 0 && l.lockedCount === l.count;
                const isStarred = folderStars.has(fullPath);
                const isPartOfSelection = selectedFiles.has(fullPath);
                const canBeDropTarget = dragSource?.bulk ? !isPartOfSelection : (dragSource && fullPath !== dragSource && !fullPath.startsWith(dragSource + '/'));
                return (
                  <motion.div layout key={fullPath} data-item-id={fullPath} className={`${styles.card} ${isPartOfSelection ? styles.selected : ''} ${dragOverTarget === fullPath ? styles.isDragTarget : ''} ${_pending ? styles.pending : ''}`} draggable={!_pending} onDragStart={(e) => handleDragStart(e, fullPath)} onDragEnd={() => setDragSource(null)} onDragOver={(e) => { const types = Array.from(e.dataTransfer.types); if (canBeDropTarget || types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverTarget !== fullPath) setDragOverTarget(fullPath); } }} onDragLeave={(e) => { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) setDragOverTarget(null); }} onDrop={(e) => { setDragOverTarget(null); handleDropMove(e, fullPath); }} onDoubleClick={() => !_pending && handleFolderClick(fullPath)} onClick={(e) => toggleSelect(fullPath, e)} onContextMenu={(e) => { if (_pending) return; e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: fullPath, isFolder: true }); }}>
                    <AnimatePresence>
                      {isLocked && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.8 }} 
                          animate={{ opacity: 1, scale: 1 }} 
                          exit={{ opacity: 0, scale: 0.8 }}
                          className={styles.lockOverlay}
                        >
                          <Lock size={12} />
                        </motion.div>
                      )}
                      {isStarred && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.8 }} 
                          animate={{ opacity: 1, scale: 1 }} 
                          exit={{ opacity: 0, scale: 0.8 }}
                          className={styles.starOverlay}
                        >
                          <Star size={12} fill="currentColor" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardIconWrapper}><Folder size={18} style={{ color: 'var(--text-secondary)' }} strokeWidth={2} /></div>
                      <div className={styles.cardTitleWrapper} title={dir}>{renameTarget?.path === fullPath ? <input className={styles.renameInput} value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }} autoFocus onClick={e => e.stopPropagation()} /> : <span className={styles.cardTitleText}>{dir}</span>}</div>
                      <button className={styles.cardMenuBtn} onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: fullPath, isFolder: true }); }}><MoreVertical size={18} /></button>
                    </div>
                    <div className={styles.cardPreview}><div className={styles.cardPreviewInner}><Folder size={72} style={{ color: 'var(--amber)' }} strokeWidth={1.5} /></div></div>
                    <div className={styles.cardFooter}>{_pending?.type === 'upload' ? (<div className={styles.ghostProgressBar}><div className={styles.ghostProgressFill} style={{ width: `${(_pending.progress * 100).toFixed(0)}%` }} /></div>) : (<div className={styles.cardFooterText}>Folder • {formatSize(folderSize)}</div>)}</div>
                  </motion.div>
                );
              })}
              {processedFiles.map((file) => {
                const name = file.path.split('/').pop();
                const _pending = file._pending;
                return (
                  <motion.div layout key={file.id || file.path} data-item-id={file.id} className={`${styles.card} ${selectedFiles.has(file.id) ? styles.selected : ''} ${_pending ? styles.pending : ''}`} draggable={!_pending} onDragStart={(e) => handleDragStart(e, file.path, file.id)} onDragEnd={() => setDragSource(null)} onClick={(e) => toggleSelect(file.id, e)} onContextMenu={(e) => { if (_pending) return; e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: file.path, file, isFolder: false }); }} onDoubleClick={() => !_pending && handleFileClick(file)}>
                    <AnimatePresence>
                      {file.isLocked && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.8 }} 
                          animate={{ opacity: 1, scale: 1 }} 
                          exit={{ opacity: 0, scale: 0.8 }}
                          className={styles.lockOverlay}
                        >
                          <Lock size={12} />
                        </motion.div>
                      )}
                      {file.isStarred && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.8 }} 
                          animate={{ opacity: 1, scale: 1 }} 
                          exit={{ opacity: 0, scale: 0.8 }}
                          className={styles.starOverlay}
                        >
                          <Star size={12} fill="currentColor" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardIconWrapper}>{renderFileIcon(name)}</div>
                      <div className={styles.cardTitleWrapper} title={name}>{renameTarget?.path === file.path && renameTarget?.id === file.id ? <input className={styles.renameInput} value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }} autoFocus onClick={e => e.stopPropagation()} /> : <span className={styles.cardTitleText}>{name}</span>}</div>
                      <button className={styles.cardMenuBtn} onClick={(e) => { e.stopPropagation(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: file.path, file, isFolder: false }); }}><MoreVertical size={20} /></button>
                    </div>
                    <div className={styles.cardPreview}><div className={styles.cardPreviewInner}><FileThumbnail file={file} size={48} /></div></div>
                    <div className={styles.cardFooter}>{_pending?.type === 'upload' ? (<div className={styles.ghostProgressBar}><div className={styles.ghostProgressFill} style={{ width: `${(_pending.progress * 100).toFixed(0)}%` }} /></div>) : (<div className={styles.cardFooterText}>{formatItemDate(file.createdAt)} • {formatSize(file.size || 0)}</div>)}</div>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div key={`list-${currentPath}-${isLockedView}-${isStarredView}-${isRecentView}`} initial={animationsEnabled ? { opacity: 0, x: -5 } : false} animate={{ opacity: 1, x: 0 }} exit={animationsEnabled ? { opacity: 0, x: 5 } : false} transition={{ duration: 0.15 }} className={styles.list}>
              <div className={styles.listHeader}><span className={styles.listColCheck}></span><span className={styles.listColName}>Nama</span><span className={styles.listColSize}>Ukuran</span><span className={styles.listColActions}></span></div>
              {processedDirs.map(({ name: dir, fullPath, _pending }) => {
                const folderSize = folderSizes.get(fullPath) || 0;
                const l = folderLocks.get(fullPath);
                const isLocked = l && l.count > 0 && l.lockedCount === l.count;
                const isStarred = folderStars.has(fullPath);
                const iconSize = Math.max(20, 22 * zoom);
                return (
                  <div key={fullPath} data-item-id={fullPath} className={`${styles.listRow} ${selectedFiles.has(fullPath) ? styles.selected : ''} ${dragOverTarget === fullPath ? styles.isDragTarget : ''} ${_pending ? styles.pending : ''}`} draggable={!_pending} onDragStart={(e) => handleDragStart(e, fullPath)} onDragEnd={() => setDragSource(null)} onDragOver={(e) => { if (_pending) return; const types = Array.from(e.dataTransfer.types); if (types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverTarget !== fullPath) setDragOverTarget(fullPath); } }} onDragLeave={() => setDragOverTarget(null)} onDrop={(e) => { setDragOverTarget(null); handleDropMove(e, fullPath); }} onDoubleClick={() => handleFolderClick(fullPath)} onClick={(e) => toggleSelect(fullPath, e)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: fullPath, isFolder: true }); }}>
                    <div className={styles.listIcon} style={{ width: `calc(28px * var(--zoom))`, flexShrink: 0 }}>
                      {_pending?.type === 'create' ? (
                        <div className={`skeleton ${styles.ghostIconSkeleton}`} style={{ width: iconSize, height: iconSize, borderRadius: '4px' }} />
                      ) : isLocked ? (
                        <Lock size={iconSize - 2} style={{ color: 'var(--accent-bright)' }} />
                      ) : isStarred ? (
                        <Star size={iconSize - 2} fill="var(--amber)" style={{ color: 'var(--amber)' }} />
                      ) : (
                        <Folder size={iconSize} style={{ color: 'var(--amber)' }} />
                      )}
                    </div>
                    <span className={`${styles.listName} truncate`} style={{ fontSize: `calc(12px * var(--zoom))`, lineHeight: 1.2 }}>{renameTarget?.path === fullPath ? <input className={styles.renameInput} value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }} autoFocus onClick={e => e.stopPropagation()} /> : _pending?.type === 'create' ? (<div className={`skeleton ${styles.ghostTitleSkeleton}`} style={{ width: '120px', height: '12px' }} />) : dir}</span>
                    <span className={styles.listSize}>{_pending ? '...' : formatSize(folderSize)}</span>
                    <div className={styles.listActions} onClick={e => e.stopPropagation()}>{!_pending && (<><button className={styles.iconBtn} onClick={() => setMoveModal({ path: fullPath, mode: 'move' })} title="Pindah"><Move size={13} /></button><button className={styles.iconBtn} onClick={() => setMoveModal({ path: fullPath, mode: 'copy' })} title="Salin"><Copy size={13} /></button><button className={styles.iconBtn} onClick={() => startRename(fullPath, true)} title="Rename"><Edit3 size={13} /></button></>)}</div>
                    {_pending && <div className={styles.ghostProgressLine} style={{ width: _pending.type === 'create' ? '70%' : `${(_pending.progress * 100).toFixed(0)}%` }} />}
                  </div>
                );
              })}
              {processedFiles.map((file) => {
                const name = file.path.split('/').pop();
                const iconSize = Math.max(18, 20 * zoom);
                const _pending = file._pending;
                return (
                  <div key={file.id || file.path} data-item-id={file.id} className={`${styles.listRow} ${selectedFiles.has(file.id) ? styles.selected : ''} ${_pending ? styles.pending : ''}`} draggable={!_pending} onDragStart={(e) => handleDragStart(e, file.path, file.id)} onDragEnd={() => setDragSource(null)} onClick={(e) => toggleSelect(file.id, e)} onContextMenu={(e) => { if (_pending) return; e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: file.path, file, isFolder: false }); }} onDoubleClick={() => !_pending && handleFileClick(file)}>
                    <div className={styles.listIcon} style={{ width: `calc(28px * var(--zoom))`, height: `calc(28px * var(--zoom))`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 4, flexShrink: 0 }}>
                      {_pending ? (
                        <div className={`skeleton ${styles.ghostIconSkeleton}`} style={{ width: iconSize, height: iconSize, borderRadius: '4px' }} />
                      ) : file.isLocked ? (
                        <Lock size={iconSize} style={{ color: 'var(--accent-bright)' }} />
                      ) : file.isStarred ? (
                        <Star size={iconSize} fill="var(--amber)" style={{ color: 'var(--amber)' }} />
                      ) : (
                        <FileThumbnail file={file} size={iconSize} />
                      )}
                    </div>
                    <span className={`${styles.listName} truncate`} style={{ fontSize: `calc(12px * var(--zoom))`, lineHeight: 1.2 }}>{renameTarget?.path === file.path && renameTarget?.id === file.id ? <input className={styles.renameInput} value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }} autoFocus onClick={e => e.stopPropagation()} /> : _pending ? (<div className={`skeleton ${styles.ghostTitleSkeleton}`} style={{ width: '120px', height: '12px' }} />) : name}</span>
                    <span className={styles.listSize}>{_pending ? '...' : formatSize(file.size || 0)}</span>
                    <div className={styles.listActions} onClick={e => e.stopPropagation()}>{!_pending && (<><button className={styles.iconBtn} onClick={() => handleDownloadClick(file)} title="Download"><Download size={13} /></button><button className={styles.iconBtn} onClick={() => setMoveModal({ id: file.id, path: file.path, mode: 'move' })} title="Pindah"><Move size={13} /></button><button className={styles.iconBtn} onClick={() => setMoveModal({ id: file.id, path: file.path, mode: 'copy' })} title="Salin"><Copy size={13} /></button><button className={styles.iconBtn} onClick={() => startRename(file.path, false, file.id)} title="Rename"><Edit3 size={13} /></button></>)}</div>
                    {_pending && <div className={styles.ghostProgressLine} style={{ width: `${(_pending.progress * 100).toFixed(0)}%` }} />}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {contextMenu && <div className={styles.contextMenuBackdrop} onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />}
      {contextMenu && (
        <div ref={contextMenuRef} className={styles.contextMenu} style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
          {contextMenu.type === 'empty' ? (<><button onClick={() => { setShowCreateFolder(true); setContextMenu(null); }}><FolderPlus size={13} /> {t('new_folder')}</button><button onClick={() => { handlePickFiles(); setContextMenu(null); }}><Upload size={13} /> {t('upload')} File</button><div className={styles.contextDivider} /><button onClick={() => { refresh(); setContextMenu(null); }}><RefreshCw size={13} /> {t('refresh')}</button></>) : selectedFiles.size > 1 && selectedFiles.has(contextMenu.isFolder ? contextMenu.path : contextMenu.file?.id) ? (<><button onClick={() => { handleBulkMove('move'); setContextMenu(null); }}><Move size={13} /> {t('pindah_item', { count: selectedFiles.size })}</button><button onClick={() => { handleBulkMove('copy'); setContextMenu(null); }}><Copy size={13} /> {t('salin_item', { count: selectedFiles.size })}</button><div className={styles.contextDivider} /><button className={styles.dangerItem} onClick={() => { handleBulkDelete(); setContextMenu(null); }}><Trash2 size={13} /> {t('hapus_item', { count: selectedFiles.size })}</button></>) : (<>{!contextMenu.isFolder && (<button onClick={() => { downloadFile(contextMenu.file); setContextMenu(null); }}><Download size={13} /> {t('download')}</button>)}<button onClick={() => { setMoveModal({ id: contextMenu.isFolder ? null : contextMenu.file?.id, path: contextMenu.path, mode: 'move' }); setContextMenu(null); }}><Move size={13} /> {t('move')}</button><button onClick={() => { setMoveModal({ id: contextMenu.isFolder ? null : contextMenu.file?.id, path: contextMenu.path, mode: 'copy' }); setContextMenu(null); }}><Copy size={13} /> {t('copy')}</button><button onClick={() => startRename(contextMenu.path, contextMenu.isFolder, contextMenu.isFolder ? null : contextMenu.file?.id)}><Edit3 size={13} /> {t('rename')}</button>{contextMenu.isFolder ? (() => { const l = folderLocks.get(contextMenu.path); const isLocked = l && l.count > 0 && l.lockedCount === l.count; return <button onClick={() => handleToggleLock(contextMenu.path, null, !isLocked)}>{isLocked ? <><Unlock size={13} /> {t('unlock')}</> : <><Lock size={13} /> {t('lock')}</>}</button>; })() : <button onClick={() => handleToggleLock(contextMenu.path, contextMenu.file?.id, !contextMenu.file?.isLocked)}>{contextMenu.file?.isLocked ? <><Unlock size={13} /> {t('unlock')}</> : <><Lock size={13} /> {t('lock')}</>}</button>}{contextMenu.isFolder ? (() => { const isStarred = folderStars.has(contextMenu.path); return <button onClick={() => handleToggleStar(contextMenu.path, null, !isStarred)}>{isStarred ? <><Star size={13} fill="currentColor" /> {t('unstar')}</> : <><Star size={13} /> {t('star')}</>}</button>; })() : <button onClick={() => handleToggleStar(contextMenu.path, contextMenu.file?.id, !contextMenu.file?.isStarred)}>{contextMenu.file?.isStarred ? <><Star size={13} fill="currentColor" /> {t('unstar')}</> : <><Star size={13} /> {t('star')}</>}</button>}<div className={styles.contextDivider} />{shareEnabled && !contextMenu.isFolder && <button onClick={() => { setShareDialog({ path: contextMenu.path, file: contextMenu.file }); setContextMenu(null); }}><Link2 size={13} /> Share</button>}<div className={styles.contextDivider} /><button className={styles.dangerItem} onClick={() => { handleDelete(contextMenu.path, contextMenu.isFolder ? null : contextMenu.file?.id); setContextMenu(null); }}><Trash2 size={13} /> {t('delete')}</button></>)}
        </div>
      )}
      {isDragOver && <div className={styles.dropOverlay}><Upload size={40} /><p>Drop untuk upload</p></div>}
      <AnimatePresence>
        {showCreateFolder && <CreateFolderModal onClose={() => setShowCreateFolder(false)} />}
        {moveModal && <MoveModal id={moveModal.id} file={moveModal.path} paths={moveModal.paths} mode={moveModal.mode} onClose={() => { setMoveModal(null); clearSelection(); }} onUnlock={moveModal.onUnlock} />}
        {confirmAction && <ConfirmModal title={confirmAction.title} message={confirmAction.message} danger={confirmAction.danger} onConfirm={confirmAction.onConfirm} onClose={() => setConfirmAction(null)} />}
        {previewFile && <FilePreview file={previewFile} allFiles={processedFiles} onFileChange={setPreviewFile} onClose={() => setPreviewFile(null)} />}
        {pinPrompt && <PinPromptModal title={pinPrompt.title} onSuccess={pinPrompt.onSuccess} onClose={() => setPinPrompt(null)} />}
        {shareDialog && <ShareDialog filePath={shareDialog.path} fileId={shareDialog.file?.id} onClose={() => setShareDialog(null)} />}
      </AnimatePresence>
    </div>
  );
}
