import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, FolderPlus, Grid3x3, List, Search,
  Download, Trash2, Edit3, Folder, Lock, Unlock, Star,
  ChevronRight, Home, Move, Copy, Check, AlertCircle, ZoomIn, Link2,
  CheckCircle, RefreshCw, Clock, ArrowUpDown, ChevronDown
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../AppContext.jsx';
import { formatSize, getFileIcon, getMimeType } from '../utils/disbox.js';
import { CreateFolderModal, MoveModal, ConfirmModal } from './FolderModal.jsx';
import ShareDialog from './ShareDialog.jsx';
import FilePreview from './FilePreview.jsx';
import styles from './FileGrid.module.css';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Thumbnail Concurrency Control ──────────────────────────────────────────
const MAX_CONCURRENT_THUMBS = 3;
let activeThumbDownloads = 0;
const thumbQueue = [];

function processThumbQueue() {
  while (activeThumbDownloads < MAX_CONCURRENT_THUMBS && thumbQueue.length > 0) {
    const { id, task, resolve, reject } = thumbQueue.shift();
    activeThumbDownloads++;
    task()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeThumbDownloads--;
        processThumbQueue();
      });
  }
}

function enqueueThumb(id, task) {
  return new Promise((resolve, reject) => {
    thumbQueue.push({ id, task, resolve, reject });
    processThumbQueue();
  });
}

function FileThumbnail({ file, size = 32 }) {
  const { api, showPreviews, showImagePreviews, showVideoPreviews, addTransfer, updateTransfer, removeTransfer } = useApp();
  const [thumbUrl, setThumbUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const name = file.path.split('/').pop();
  const ext = name.split('.').pop().toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi'].includes(ext);

  useEffect(() => {
    const canShowImage = showPreviews && showImagePreviews && isImage;
    const canShowVideo = showPreviews && showVideoPreviews && isVideo;

    if (!canShowImage && !canShowVideo) {
      if (thumbUrl) {
        URL.revokeObjectURL(thumbUrl);
        setThumbUrl(null);
      }
      return;
    }

    let isMounted = true;
    let objectUrl = null;
    const transferId = `thumb-${file.id}`;

    const compressImage = (blob) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 256; 
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((resultBlob) => resolve(resultBlob), 'image/webp', 0.7);
        };
        img.src = URL.createObjectURL(blob);
      });
    };

    const captureVideoFrame = (blob) => {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        const url = URL.createObjectURL(blob);
        
        video.onloadedmetadata = () => {
          video.currentTime = Math.min(1, video.duration / 2);
        };

        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 256;
          let width = video.videoWidth;
          let height = video.videoHeight;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, width, height);
          canvas.toBlob((resultBlob) => {
            URL.revokeObjectURL(url);
            resolve(resultBlob);
          }, 'image/webp', 0.7);
        };

        video.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };

        video.src = url;
      });
    };

    const loadThumb = async () => {
      setLoading(true);
      try {
        await enqueueThumb(transferId, async () => {
          if (!isMounted) return;
          const signal = addTransfer({ id: transferId, name: `Thumbnail: ${name}`, progress: 0, type: 'download', status: 'active', hidden: true });
          const buffer = await api.downloadFile(file, (p) => updateTransfer(transferId, { progress: p }), signal, transferId);
          if (isMounted && !signal.aborted) {
            const originalBlob = new Blob([buffer], { type: getMimeType(name) });
            let compressedBlob;
            if (isVideo) {
              compressedBlob = await captureVideoFrame(originalBlob);
            } else {
              compressedBlob = await compressImage(originalBlob);
            }

            if (compressedBlob && isMounted) {
              objectUrl = URL.createObjectURL(compressedBlob);
              setThumbUrl(objectUrl);
            }
            updateTransfer(transferId, { status: 'done', progress: 1 });
            setTimeout(() => removeTransfer(transferId), 500);
          }
        });
      } catch (e) {
        if (isMounted) console.error('Thumb failed:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    loadThumb();
    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      window.electron?.cancelUpload?.(transferId);
      removeTransfer(transferId);
      const idx = thumbQueue.findIndex(q => q.id === transferId);
      if (idx >= 0) thumbQueue.splice(idx, 1);
    };
  }, [file.id, showPreviews, showImagePreviews, showVideoPreviews, isImage, isVideo]);

  const canShowImage = showPreviews && showImagePreviews && isImage;
  const canShowVideo = showPreviews && showVideoPreviews && isVideo;

  if (canShowImage || canShowVideo) {
    if (thumbUrl) return <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', flexShrink: 0, position: 'relative' }}>
      <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {isVideo && <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 4px', fontSize: 10, color: 'white', display: 'flex', alignItems: 'center' }}>▶</div>}
    </div>;
    if (loading) return <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 6 }} />;
  }
  return <span style={{ fontSize: size }}>{getFileIcon(name)}</span>;
}


function PinPromptModal({ title, onSuccess, onClose }) {
  const { verifyPin, hasPin } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [exists, setExists] = useState(true);

  useEffect(() => {
    hasPin().then(setExists);
  }, [hasPin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!exists) {
      setError('PIN belum diset. Silakan set PIN di Settings.');
      return;
    }
    setChecking(true);
    setError('');
    const ok = await verifyPin(pin);
    if (ok) {
      onSuccess();
      onClose();
    } else {
      setError('PIN salah');
      setPin('');
    }
    setChecking(false);
  };

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.pinModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pinHeader}>
          <Lock size={20} style={{ color: 'var(--accent-bright)' }} />
          <h3>{title}</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Masukkan PIN"
            value={pin}
            onChange={e => setPin(e.target.value)}
            autoFocus
            className={styles.pinInput}
          />
          {error && <p className={styles.pinError}>{error}</p>}
          <div className={styles.pinActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Batal</button>
            <button type="submit" disabled={checking || !pin} className={styles.confirmBtn}>
              {checking ? 'Memverifikasi...' : 'Buka Kunci'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

export default function FileGrid({ isLockedView = false, isStarredView = false, isRecentView = false, onNavigate }) {
  const { 
    api, files, currentPath, setCurrentPath, 
    addTransfer, updateTransfer, removeTransfer, cancelTransfer, 
    refresh, loading, movePath, copyPath, deletePath, 
    bulkDelete, bulkMove, bulkCopy, uiScale,
    setLocked, setStarred, verifyPin, hasPin, isVerified, t, animationsEnabled,
    shareEnabled
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

  useEffect(() => {
    localStorage.setItem('disbox_zoom', zoom.toString());
  }, [zoom]);

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
  const [pinPrompt, setPinPrompt] = useState(null); // { title, onSuccess }
  const [showBreadcrumbMenu, setShowBreadcrumbMenu] = useState(false);
  const [shareDialog, setShareDialog] = useState(null); // { path, file }
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [isLastPartTruncated, setIsLastPartTruncated] = useState(false);
  const activeFolderRef = useRef(null);
  const contextMenuRef = useRef(null);

  useEffect(() => {
    if (contextMenu && contextMenuRef.current) {
      const menu = contextMenuRef.current;
      const rect = menu.getBoundingClientRect();
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      let { x, y } = contextMenu;
      
      // Adjust X if menu goes off screen
      if (x + rect.width > winW - 10) {
        x = winW - rect.width - 10;
      }
      
      // Adjust Y if menu goes off screen
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

  // ─── OPTIMIZED DATA PROCESSING ───
  const { processedFiles, processedDirs, folderSizes, folderLocks, folderStars } = useMemo(() => {
    const fileList = [];
    const dirsMap = new Map();
    const sizes = new Map();
    const locks = new Map(); // { path: { count, lockedCount } }
    const dates = new Map(); // Track max createdAt for folders
    const starredFolders = new Set();
    const q = debouncedSearch.toLowerCase();

    files.forEach(f => {
      // Hide cloudsave internal folder from UI
      if (f.path.startsWith('cloudsave/')) return;

      const parts = f.path.split('/').filter(Boolean);
      const name = parts[parts.length - 1];

      let tempPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        tempPath = tempPath ? `${tempPath}/${parts[i]}` : parts[i];
        sizes.set(tempPath, (sizes.get(tempPath) || 0) + (f.size || 0));
        
        // Track dates (latest file in folder determines folder's date)
        const currentMax = dates.get(tempPath) || 0;
        if ((f.createdAt || 0) > currentMax) dates.set(tempPath, f.createdAt);

        // Track locks
        if (!locks.has(tempPath)) locks.set(tempPath, { count: 0, lockedCount: 0 });
        const l = locks.get(tempPath);
        l.count++;
        if (f.isLocked) l.lockedCount++;
      }

      // Identify starred folders via .keep files
      if (f.isStarred && name === '.keep') {
        const folderPath = parts.slice(0, -1).join('/');
        starredFolders.add(folderPath);
      }

      // Filter logic
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
        // Standard drive view
        if (!f.isLocked && name !== '.keep') shouldIncludeFile = true;
      }

      if (shouldIncludeFile && matchesSearch) {
        const fileDirStr = parts.slice(0, -1).join('/');
        const isDirectChild = fileDirStr === dirPath;
        
        // Locked view should be hierarchical (like My Drive)
        // Starred and Recent stay as flat lists
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
          // In Locked tab, we show the folder if it's fully locked
          if (folderIsLocked) shouldIncludeDir = true;
        } else {
          // Drive view: hide fully locked folders
          if (!folderIsLocked) shouldIncludeDir = true;
        }

        if (shouldIncludeDir) {
          if (q) {
            // Only include folder in results if its name matches the search query
            if (dirName.toLowerCase().includes(q)) {
              dirsMap.set(currentAcc, dirName);
            }
          } else if (isStarredView) {
            // Flat list for Starred view
            dirsMap.set(currentAcc, dirName);
          } else if (isChildOfCurrent) {
            // Hierarchical for Drive and Locked
            dirsMap.set(currentAcc, dirName);
          }
        }
      }
    });

    const dirList = Array.from(dirsMap.entries()).map(([fullPath, name]) => ({
      name,
      fullPath,
      createdAt: dates.get(fullPath) || 0,
      size: sizes.get(fullPath) || 0
    }));

    // Apply Sorting
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

  const navigate = (path) => {
    setCurrentPath(path);
    setSelectedFiles(new Set());
    setContextMenu(null);
    setSearchQuery('');
  };

  const handleFolderClick = (fullPath) => {
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
  };

  const handleFileClick = (file) => {
    if (file.isLocked && !isVerified) {
      setPinPrompt({ title: 'Buka File Terkunci', onSuccess: () => setPreviewFile(file) });
    } else {
      setPreviewFile(file);
    }
  };

  const handleDownloadClick = (file) => {
    if (file.isLocked && !isVerified) {
      setPinPrompt({ title: 'Download File Terkunci', onSuccess: () => downloadFile(file) });
    } else {
      downloadFile(file);
    }
  };

  const handleToggleLock = async (itemPath, id, isLocked) => {
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
  };

  const handleToggleStar = async (itemPath, id, isStarred) => {
    const ok = await setStarred(id || itemPath, isStarred);
    if (ok) {
      toast.success(isStarred ? 'Ditambahkan ke Starred' : 'Dihapus dari Starred');
      setContextMenu(null);
    } else {
      toast.error('Gagal mengubah status star');
    }
  };

  const handleDelete = async (targetPath, id = null) => {
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
  };

  const handleBulkDelete = async () => {
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
  };

  const handleBulkMove = (mode = 'move') => {
    if (selectedFiles.size === 0) return;
    setMoveModal({ paths: [...selectedFiles], mode });
  };

  const startRename = (path, isFolder = false, id = null) => {
    setRenameTarget({ path, isFolder, id });
    setRenameValue(path.split('/').pop());
    setContextMenu(null);
  };

  const commitRename = async () => {
    if (!renameTarget || !renameValue.trim()) { setRenameTarget(null); return; }
    const oldPath = renameTarget.path;
    const parts = oldPath.split('/');
    const newName = renameValue.trim();
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');
    if (oldPath === newPath) { setRenameTarget(null); return; }

    // Collision check
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
  };

  const handleUpload = async (selectedFiles) => {
    if (!api || !selectedFiles?.length) return;
    setUploading(true);
    for (const file of selectedFiles) {
      const transferId = crypto.randomUUID();
      const isStringPath = typeof file === 'string';
      const nativePath = isStringPath ? file : file.path;
      const fileName = isStringPath ? file.split('/').pop() : file.name;
      const uploadPath = dirPath ? `${dirPath}/${fileName}` : fileName;
      let totalBytes = 0;
      if (nativePath && window.electron) {
        try { const info = await window.electron.statFile(nativePath); totalBytes = info.size || 0; } catch (_) {}
      } else if (file.size) { totalBytes = file.size; }
      const CHUNK_SIZE = 7.5 * 1024 * 1024;
      const totalChunks = totalBytes > 0 ? Math.ceil(totalBytes / CHUNK_SIZE) || 1 : null;
      const signal = addTransfer({ id: transferId, name: fileName, progress: 0, type: 'upload', status: 'active', totalBytes, totalChunks, chunk: 0 });
      try {
        let resultFile = null;
        if (nativePath) {
          resultFile = await api.uploadFile({ nativePath, name: fileName }, uploadPath, (progress) => {
            const chunk = totalChunks ? Math.min(Math.floor(progress * totalChunks), totalChunks - 1) : 0;
            updateTransfer(transferId, { progress, chunk });
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
          }, signal);
        }
        if (isLockedView && resultFile?.id) {
          await window.electron.setLocked(resultFile.id, api.hashedWebhook, 1);
        }
        if (!signal.aborted) updateTransfer(transferId, { status: 'done', progress: 1 });
      } catch (e) {
        if (e.name !== 'AbortError' && !signal.aborted) {
          updateTransfer(transferId, { status: 'error', error: e.message });
          setTimeout(() => removeTransfer(transferId), 3000);
        }
      }
    }
    setUploading(false); refresh();
  };

  const handlePickFiles = async () => {
    if (window.electron) {
      const paths = await window.electron.openFiles();
      if (paths) handleUpload(paths);
    } else {
      const input = document.createElement('input');
      input.type = 'file'; input.multiple = true;
      input.onchange = (e) => handleUpload(Array.from(e.target.files));
      input.click();
    }
  };

  const handleDropZone = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) handleUpload(droppedFiles);
  };

  const downloadFile = async (file) => {
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
      if (window.electron) {
        const savePath = await window.electron.saveFile(fileName);
        if (savePath) await window.electron.writeFile(savePath, new Uint8Array(buffer));
      } else {
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
      }
      URL.revokeObjectURL(url);
      updateTransfer(transferId, { status: 'done', progress: 1 });
    } catch (e) {
      if (e.name !== 'AbortError' && !signal.aborted) updateTransfer(transferId, { status: 'error', error: e.message });
    }
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    if (!e.ctrlKey && !isSelectionMode) { setSelectedFiles(new Set()); return; }
    setIsSelectionMode(true);
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => { setSelectedFiles(new Set()); setIsSelectionMode(false); };

  const handleDragStart = (e, itemPath, id = null) => {
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
  };

  const handleDropMove = async (e, destDir) => {
    e.preventDefault();
    let raw = e.dataTransfer.getData('text/plain');
    let data = raw;

    // Fallback to dragSource if raw is empty or if we can parse it
    if (!data || data === '') {
      data = dragSource;
    } else {
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') data = parsed;
      } catch (_) {
        // Not JSON, keep as string
      }
    }

    if (!data) return;
    if (e.dataTransfer.files.length > 0) return;
    const normalizedDest = destDir.startsWith('/') ? destDir.slice(1) : destDir;

    // Handle Bulk Move
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

    // Handle Single Move
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
  };

  const [isDragOver, setIsDragOver] = useState(false);
  const rubberOrigin = useRef(null);
  const contentRef = useRef(null);
  const isRubbering = useRef(false);
  const rubberBandElRef = useRef(null);
  const itemBoundsCache = useRef([]);
  const lastSelectedIds = useRef(new Set());
  const selectedFilesRef = useRef(selectedFiles);

  useEffect(() => { selectedFilesRef.current = selectedFiles; }, [selectedFiles]);

  useEffect(() => {
    const content = contentRef.current; if (!content) return;
    const rbEl = document.createElement('div');
    rbEl.style.position = 'fixed'; rbEl.style.border = '1.5px solid var(--accent)';
    rbEl.style.background = 'rgba(88, 101, 242, 0.12)'; rbEl.style.borderRadius = '4px';
    rbEl.style.pointerEvents = 'none'; rbEl.style.zIndex = '9999'; rbEl.style.display = 'none';
    document.body.appendChild(rbEl);
    rubberBandElRef.current = rbEl;
    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('[data-item-id]')) return;
      if (e.target.closest('button, input, a, [role="button"]')) return;
      const rect = content.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      rubberOrigin.current = { x: e.clientX, y: e.clientY }; isRubbering.current = false;
      const items = content.querySelectorAll('[data-item-id]');
      itemBoundsCache.current = Array.from(items).map(el => ({ id: el.dataset.itemId, rect: el.getBoundingClientRect() }));
      if (!e.ctrlKey) { setSelectedFiles(new Set()); lastSelectedIds.current = new Set(); setIsSelectionMode(false); }
      else { lastSelectedIds.current = new Set(selectedFilesRef.current); }
      let rafId = null;
      const onMouseMove = (me) => {
        if (!rubberOrigin.current) return;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const dx = me.clientX - rubberOrigin.current.x;
          const dy = me.clientY - rubberOrigin.current.y;
          if (!isRubbering.current) { if (Math.sqrt(dx * dx + dy * dy) < 6) return; isRubbering.current = true; rbEl.style.display = 'block'; }
          const cr = content.getBoundingClientRect();
          const clampedX2 = Math.max(cr.left, Math.min(me.clientX, cr.right));
          const clampedY2 = Math.max(cr.top, Math.min(me.clientY, cr.bottom));
          const rb = { x: Math.min(rubberOrigin.current.x, clampedX2), y: Math.min(rubberOrigin.current.y, clampedY2), w: Math.abs(clampedX2 - rubberOrigin.current.x), h: Math.abs(clampedY2 - rubberOrigin.current.y) };
          rbEl.style.left = `${rb.x}px`; rbEl.style.top = `${rb.y}px`; rbEl.style.width = `${rb.w}px`; rbEl.style.height = `${rb.h}px`;
          const newSelection = new Set(e.ctrlKey ? lastSelectedIds.current : []);
          let changed = false;
          itemBoundsCache.current.forEach(item => {
            const er = item.rect;
            const overlaps = rb.x < er.right && rb.x + rb.w > er.left && rb.y < er.bottom && rb.y + rb.h > er.top;
            if (overlaps) { if (!newSelection.has(item.id)) { newSelection.add(item.id); changed = true; } }
            else if (!e.ctrlKey) { if (newSelection.has(item.id)) { newSelection.delete(item.id); changed = true; } }
          });
          if (changed) { setSelectedFiles(newSelection); setIsSelectionMode(newSelection.size > 0); }
        });
      };
      const onMouseUp = () => { if (rafId) cancelAnimationFrame(rafId); isRubbering.current = false; rbEl.style.display = 'none'; rubberOrigin.current = null; itemBoundsCache.current = []; window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
      window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp);
    };
    content.addEventListener('mousedown', onMouseDown);
    return () => { content.removeEventListener('mousedown', onMouseDown); if (rbEl.parentNode) rbEl.parentNode.removeChild(rbEl); };
  }, [uiScale]);

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
  }, [selectedFiles, contextMenu]);

  return (
    <div className={`${styles.container} ${isDragOver ? styles.dragOver : ''} ${isSelectionMode ? styles.isSelectionMode : ''}`} style={{ '--zoom': zoom }} onDragOver={(e) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setIsDragOver(true); }} onDragLeave={() => setIsDragOver(false)} onDrop={(e) => { setIsDragOver(false); if (e.dataTransfer.files.length > 0) handleDropZone(e); }} onClick={() => { setContextMenu(null); if (!isSelectionMode) clearSelection(); }} onContextMenu={(e) => { 
      if (e.target.closest('.' + styles.toolbar)) return;
      e.preventDefault(); 
      setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, type: 'empty' }); 
    }}>
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
              {!isCompact ? pathParts.map((part, i) => {
                const targetPath = '/' + pathParts.slice(0, i + 1).join('/');
                const isLast = i === pathParts.length - 1;
                return <span key={i} className={styles.breadcrumbRow}><ChevronRight size={12} className={styles.breadcrumbSep} /><button className={`${styles.breadcrumbItem} ${isLast ? styles.breadcrumbActive : ''}`} onClick={() => navigate(targetPath)}>{part}</button></span>;
              }) : <>
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
            <button className={styles.sortBox} onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}>
              <ArrowUpDown size={12} className={styles.sortIconMain} />
              <span className={styles.sortText}>
                {sortMode === 'name' ? t('sort_name') : sortMode === 'date' ? t('sort_date') : t('sort_size')}
              </span>
              <ChevronDown size={12} className={`${styles.sortIconArrow} ${showSortMenu ? styles.rotated : ''}`} />
            </button>
            {showSortMenu && (
              <>
                <div className={styles.menuBackdrop} onClick={(e) => { e.stopPropagation(); setShowSortMenu(false); }} />
                <div className={styles.sortMenu}>
                  <button className={`${styles.sortMenuItem} ${sortMode === 'name' ? styles.active : ''}`} onClick={() => { setSortMode('name'); setShowSortMenu(false); }}>
                    <div className={styles.checkIcon}>{sortMode === 'name' && <Check size={12} />}</div>
                    {t('sort_name')}
                  </button>
                  <button className={`${styles.sortMenuItem} ${sortMode === 'date' ? styles.active : ''}`} onClick={() => { setSortMode('date'); setShowSortMenu(false); }}>
                    <div className={styles.checkIcon}>{sortMode === 'date' && <Check size={12} />}</div>
                    {t('sort_date')}
                  </button>
                  <button className={`${styles.sortMenuItem} ${sortMode === 'size' ? styles.active : ''}`} onClick={() => { setSortMode('size'); setShowSortMenu(false); }}>
                    <div className={styles.checkIcon}>{sortMode === 'size' && <Check size={12} />}</div>
                    {t('sort_size')}
                  </button>
                </div>
              </>
            )}
          </div>
          <div className={styles.viewToggle}><button className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewActive : ''}`} onClick={() => setViewMode('grid')}><Grid3x3 size={13} /></button><button className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewActive : ''}`} onClick={() => setViewMode('list')}><List size={13} /></button></div>
          <div className={styles.zoomBox}><ZoomIn size={13} /><input type="range" min="0.6" max="1.8" step="0.1" value={zoom} onChange={e => setZoom(parseFloat(e.target.value))} className={styles.zoomSlider} /></div>
          <button className={styles.folderBtn} onClick={() => setShowCreateFolder(true)} title={t('new_folder')}><FolderPlus size={14} /></button>
          <button className={styles.uploadBtn} onClick={handlePickFiles} disabled={uploading}><Upload size={14} /><span>{uploading ? 'Uploading…' : t('upload')}</span></button>
        </div>
      </div>
      <div className={styles.content} ref={contentRef} style={{ position: 'relative' }}>
        <AnimatePresence mode="wait">
          {loading && processedFiles.length === 0 && processedDirs.length === 0 ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={styles.loading}
            >
              {[...Array(6)].map((_, i) => <div key={i} className={`skeleton ${styles.skeletonCard}`} />)}
            </motion.div>
          ) : processedFiles.length === 0 && processedDirs.length === 0 ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={styles.empty}
            >
              <div className={styles.emptyIcon}>📂</div>
              <p className={styles.emptyTitle}>{t('empty_folder')}</p>
              <p className={styles.emptyHint}>{t('empty_hint')}</p>
            </motion.div>
          ) : viewMode === 'grid' ? (
            <motion.div 
              key={`grid-${currentPath}-${isLockedView}-${isStarredView}-${isRecentView}`}
              initial={animationsEnabled ? { opacity: 0, y: 5 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={animationsEnabled ? { opacity: 0, y: -5 } : false}
              transition={{ duration: 0.15 }}
              className={styles.grid}
            >
              {processedDirs.map(({ name: dir, fullPath }) => {
                const folderSize = folderSizes.get(fullPath) || 0;
                const l = folderLocks.get(fullPath);
                const isLocked = l && l.count > 0 && l.lockedCount === l.count;
                const isStarred = folderStars.has(fullPath);
                const isPartOfSelection = selectedFiles.has(fullPath);
                const canBeDropTarget = dragSource?.bulk ? !isPartOfSelection : (dragSource && fullPath !== dragSource && !fullPath.startsWith(dragSource + '/'));
                return (
                  <div 
                    key={fullPath}
                    data-item-id={fullPath} 
                    className={`${styles.card} ${isPartOfSelection ? styles.selected : ''} ${dragOverTarget === fullPath ? styles.isDragTarget : ''}`} 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, fullPath)} 
                    onDragOver={(e) => { const types = Array.from(e.dataTransfer.types); if (canBeDropTarget || types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverTarget !== fullPath) setDragOverTarget(fullPath); } }} 
                    onDragLeave={(e) => { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) setDragOverTarget(null); }} 
                    onDrop={(e) => { setDragOverTarget(null); handleDropMove(e, fullPath); }} 
                    onDoubleClick={() => handleFolderClick(fullPath)} 
                    onClick={(e) => toggleSelect(fullPath, e)} 
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: fullPath, isFolder: true }); }}
                  >
                    <div className={styles.checkbox}><Check size={12} strokeWidth={3} /></div>
                    {isLocked && <div className={styles.lockOverlay}><Lock size={12} /></div>}
                    {isStarred && <div className={styles.starOverlay}><Star size={12} fill="currentColor" /></div>}
                    <div className={styles.cardIcon}><Folder size={32} strokeWidth={1.5} style={{ color: 'var(--amber)' }} /></div>
                    <div className={styles.cardName} title={dir}>{renameTarget?.path === fullPath ? <input className={styles.renameInput} value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }} autoFocus onClick={e => e.stopPropagation()} /> : dir}</div>
                    <div className={styles.cardMeta}>Folder</div>
                    <div className={styles.infoBadge}><span>{formatSize(folderSize)}</span></div>
                  </div>
                );
              })}
              {processedFiles.map((file) => {
                const name = file.path.split('/').pop();
                return (
                  <div 
                    key={file.id || file.path}
                    data-item-id={file.id} 
                    className={`${styles.card} ${selectedFiles.has(file.id) ? styles.selected : ''}`} 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, file.path, file.id)} 
                    onClick={(e) => toggleSelect(file.id, e)} 
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: file.path, file, isFolder: false }); }} 
                    onDoubleClick={() => handleFileClick(file)}
                  >
                    <div className={styles.checkbox}><Check size={12} strokeWidth={3} /></div>
                    {file.isLocked && <div className={styles.lockOverlay}><Lock size={12} /></div>}
                    {file.isStarred && <div className={styles.starOverlay}><Star size={12} fill="currentColor" /></div>}
                    <div className={styles.cardIcon} style={{ padding: 4 }}><FileThumbnail file={file} /></div>
                    <div className={styles.cardName} title={name}>{renameTarget?.path === file.path && renameTarget?.id === file.id ? <input className={styles.renameInput} value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }} autoFocus onClick={e => e.stopPropagation()} /> : name}</div>
                    <div className={styles.cardMeta}>{formatSize(file.size || 0)}</div>
                  </div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div 
              key={`list-${currentPath}-${isLockedView}-${isStarredView}-${isRecentView}`}
              initial={animationsEnabled ? { opacity: 0, x: -5 } : false}
              animate={{ opacity: 1, x: 0 }}
              exit={animationsEnabled ? { opacity: 0, x: 5 } : false}
              transition={{ duration: 0.15 }}
              className={styles.list}
            >
              <div className={styles.listHeader}>
                <span className={styles.listColCheck}></span>
                <span className={styles.listColName}>Nama</span>
                <span className={styles.listColSize}>Ukuran</span>
                <span className={styles.listColActions}></span>
              </div>
              {processedDirs.map(({ name: dir, fullPath }) => {
                const folderSize = folderSizes.get(fullPath) || 0;
                const l = folderLocks.get(fullPath);
                const isLocked = l && l.count > 0 && l.lockedCount === l.count;
                const isStarred = folderStars.has(fullPath);
                const isPartOfSelection = selectedFiles.has(fullPath);
                const canBeDropTarget = dragSource?.bulk ? !isPartOfSelection : (dragSource && fullPath !== dragSource && !fullPath.startsWith(dragSource + '/'));
                const iconSize = Math.max(20, 22 * zoom);
                return (
                  <div 
                    key={fullPath}
                    data-item-id={fullPath} 
                    className={`${styles.listRow} ${isPartOfSelection ? styles.selected : ''} ${dragOverTarget === fullPath ? styles.isDragTarget : ''}`} 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, fullPath)} 
                    onDragOver={(e) => { const types = Array.from(e.dataTransfer.types); if (canBeDropTarget || types.includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverTarget !== fullPath) setDragOverTarget(fullPath); } }} 
                    onDragLeave={(e) => { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX >= rect.right || e.clientY < rect.top || e.clientY >= rect.bottom) setDragOverTarget(null); }} 
                    onDrop={(e) => { setDragOverTarget(null); handleDropMove(e, fullPath); }} 
                    onDoubleClick={() => handleFolderClick(fullPath)} 
                    onClick={(e) => toggleSelect(fullPath, e)} 
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: fullPath, isFolder: true }); }}
                  >
                    <div className={styles.listCheckbox}>{selectedFiles.has(fullPath) && <Check size={10} strokeWidth={4} />}</div>
                    <div className={styles.listIcon} style={{ width: `calc(28px * var(--zoom))`, flexShrink: 0 }}>{isLocked ? <Lock size={iconSize - 2} style={{ color: 'var(--accent-bright)' }} /> : isStarred ? <Star size={iconSize - 2} fill="var(--amber)" style={{ color: 'var(--amber)' }} /> : <Folder size={iconSize} style={{ color: 'var(--amber)' }} />}</div>
                    <span className={`${styles.listName} truncate`} style={{ fontSize: `calc(12px * var(--zoom))`, lineHeight: 1.2 }}>{renameTarget?.path === fullPath ? <input className={styles.renameInput} value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }} autoFocus onClick={e => e.stopPropagation()} /> : dir}</span>
                    <span className={styles.listSize}>{formatSize(folderSize)}</span>
                    <div className={styles.listActions} onClick={e => e.stopPropagation()}><button className={styles.iconBtn} onClick={() => setMoveModal({ path: fullPath, mode: 'move' })} title="Pindah"><Move size={13} /></button><button className={styles.iconBtn} onClick={() => setMoveModal({ path: fullPath, mode: 'copy' })} title="Salin"><Copy size={13} /></button><button className={styles.iconBtn} onClick={() => startRename(fullPath, true)} title="Rename"><Edit3 size={13} /></button></div>
                  </div>
                );
              })}
              {processedFiles.map((file) => {
                const name = file.path.split('/').pop();
                const iconSize = Math.max(18, 20 * zoom);
                return (
                  <div 
                    key={file.id || file.path}
                    data-item-id={file.id} 
                    className={`${styles.listRow} ${selectedFiles.has(file.id) ? styles.selected : ''}`} 
                    draggable 
                    onDragStart={(e) => handleDragStart(e, file.path, file.id)} 
                    onClick={(e) => toggleSelect(file.id, e)} 
                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: file.path, file, isFolder: false }); }} 
                    onDoubleClick={() => handleFileClick(file)}
                  >
                    <div className={styles.listCheckbox}>{selectedFiles.has(file.id) && <Check size={10} strokeWidth={4} />}</div>
                    <div className={styles.listIcon} style={{ width: `calc(28px * var(--zoom))`, height: `calc(28px * var(--zoom))`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 4, flexShrink: 0 }}>{file.isLocked ? <Lock size={iconSize} style={{ color: 'var(--accent-bright)' }} /> : file.isStarred ? <Star size={iconSize} fill="var(--amber)" style={{ color: 'var(--amber)' }} /> : <FileThumbnail file={file} size={iconSize} />}</div>
                    <span className={`${styles.listName} truncate`} style={{ fontSize: `calc(12px * var(--zoom))`, lineHeight: 1.2 }}>{renameTarget?.path === file.path && renameTarget?.id === file.id ? <input className={styles.renameInput} value={renameValue} onChange={e => setRenameValue(e.target.value)} onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }} autoFocus onClick={e => e.stopPropagation()} /> : name}</span>
                    <span className={styles.listSize}>{formatSize(file.size || 0)}</span>
                    <div className={styles.listActions} onClick={e => e.stopPropagation()}>
                      <button className={styles.iconBtn} onClick={() => handleDownloadClick(file)} title="Download"><Download size={13} /></button>
                      <button className={styles.iconBtn} onClick={() => setMoveModal({ id: file.id, path: file.path, mode: 'move' })} title="Pindah"><Move size={13} /></button>
                      <button className={styles.iconBtn} onClick={() => setMoveModal({ id: file.id, path: file.path, mode: 'copy' })} title="Salin"><Copy size={13} /></button>
                      <button className={styles.iconBtn} onClick={() => startRename(file.path, false, file.id)} title="Rename"><Edit3 size={13} /></button>
                    </div>
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
          {contextMenu.type === 'empty' ? (<><button onClick={() => { setShowCreateFolder(true); setContextMenu(null); }}><FolderPlus size={13} /> {t('new_folder')}</button><button onClick={() => { handlePickFiles(); setContextMenu(null); }}><Upload size={13} /> {t('upload')} File</button><div className={styles.contextDivider} /><button onClick={() => { refresh(); setContextMenu(null); }}><RefreshCw size={13} /> {t('refresh')}</button></>) : selectedFiles.size > 1 && selectedFiles.has(contextMenu.isFolder ? contextMenu.path : contextMenu.file?.id) ? (<><button onClick={() => { handleBulkMove('move'); setContextMenu(null); }}><Move size={13} /> {t('pindah_item', { count: selectedFiles.size })}</button><button onClick={() => { handleBulkMove('copy'); setContextMenu(null); }}><Copy size={13} /> {t('salin_item', { count: selectedFiles.size })}</button><div className={styles.contextDivider} /><button className={styles.dangerItem} onClick={() => { handleBulkDelete(); setContextMenu(null); }}><Trash2 size={13} /> {t('hapus_item', { count: selectedFiles.size })}</button></>) : (<>{!contextMenu.isFolder && (<button onClick={() => { downloadFile(contextMenu.file); setContextMenu(null); }}><Download size={13} /> {t('download')}</button>)}<button onClick={() => { setMoveModal({ id: contextMenu.isFolder ? null : contextMenu.file?.id, path: contextMenu.path, mode: 'move' }); setContextMenu(null); }}><Move size={13} /> {t('move')}</button><button onClick={() => { setMoveModal({ id: contextMenu.isFolder ? null : contextMenu.file?.id, path: contextMenu.path, mode: 'copy' }); setContextMenu(null); }}><Copy size={13} /> {t('copy')}</button><button onClick={() => startRename(contextMenu.path, contextMenu.isFolder, contextMenu.isFolder ? null : contextMenu.file?.id)}><Edit3 size={13} /> {t('rename')}</button>{contextMenu.isFolder ? (() => {
            const l = folderLocks.get(contextMenu.path);
            const isLocked = l && l.count > 0 && l.lockedCount === l.count;
            return <button onClick={() => handleToggleLock(contextMenu.path, null, !isLocked)}>{isLocked ? <><Unlock size={13} /> {t('unlock')}</> : <><Lock size={13} /> {t('lock')}</>}</button>;
          })() : <button onClick={() => handleToggleLock(contextMenu.path, contextMenu.file?.id, !contextMenu.file?.isLocked)}>{contextMenu.file?.isLocked ? <><Unlock size={13} /> {t('unlock')}</> : <><Lock size={13} /> {t('lock')}</>}</button>}{contextMenu.isFolder ? (() => {
            const isStarred = folderStars.has(contextMenu.path);
            return <button onClick={() => handleToggleStar(contextMenu.path, null, !isStarred)}>{isStarred ? <><Star size={13} fill="currentColor" /> {t('unstar')}</> : <><Star size={13} /> {t('star')}</>}</button>;
          })() : <button onClick={() => handleToggleStar(contextMenu.path, contextMenu.file?.id, !contextMenu.file?.isStarred)}>{contextMenu.file?.isStarred ? <><Star size={13} fill="currentColor" /> {t('unstar')}</> : <><Star size={13} /> {t('star')}</>}</button>}<div className={styles.contextDivider} />{shareEnabled && !contextMenu.isFolder && <button onClick={() => { setShareDialog({ path: contextMenu.path, file: contextMenu.file }); setContextMenu(null); }}><Link2 size={13} /> Share</button>}<div className={styles.contextDivider} /><button className={styles.dangerItem} onClick={() => { handleDelete(contextMenu.path, contextMenu.isFolder ? null : contextMenu.file?.id); setContextMenu(null); }}><Trash2 size={13} /> {t('delete')}</button></>)}
        </div>
      )}
      {isDragOver && <div className={styles.dropOverlay}><Upload size={40} /><p>Drop untuk upload</p></div>}
      <AnimatePresence>
        {showCreateFolder && <CreateFolderModal onClose={() => setShowCreateFolder(false)} />}
        {moveModal && <MoveModal id={moveModal.id} file={moveModal.path} paths={moveModal.paths} mode={moveModal.mode} onClose={() => { setMoveModal(null); clearSelection(); }} onUnlock={moveModal.onUnlock} />}
        {confirmAction && <ConfirmModal title={confirmAction.title} message={confirmAction.message} danger={confirmAction.danger} onConfirm={confirmAction.onConfirm} onClose={() => setConfirmAction(null)} />}
        {previewFile && <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}
        {pinPrompt && <PinPromptModal title={pinPrompt.title} onSuccess={pinPrompt.onSuccess} onClose={() => setPinPrompt(null)} />}
        {shareDialog && <ShareDialog filePath={shareDialog.path} fileId={shareDialog.file?.id} onClose={() => setShareDialog(null)} />}
      </AnimatePresence>
    </div>
  );
}
