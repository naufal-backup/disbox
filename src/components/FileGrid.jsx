import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, FolderPlus, Grid3x3, List, Search,
  Download, Trash2, Edit3, Folder,
  ChevronRight, Home, Move, Copy, Check, AlertCircle, ZoomIn,
  CheckCircle, RefreshCw, Clock
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../AppContext.jsx';
import { formatSize, getFileIcon, getMimeType } from '../utils/disbox.js';
import { CreateFolderModal, MoveModal, ConfirmModal } from './FolderModal.jsx';
import FilePreview from './FilePreview.jsx';
import styles from './FileGrid.module.css';

function MetadataStatusIndicator() {
  const { metadataStatus } = useApp();
  
  const getIcon = () => {
    switch (metadataStatus?.status) {
      case 'synced': return <CheckCircle size={14} style={{ color: 'var(--teal)' }} />;
      case 'uploading': return <RefreshCw size={14} className="spin" style={{ color: 'var(--accent-bright)' }} />;
      case 'dirty': return <Clock size={14} style={{ color: 'var(--amber)' }} />;
      case 'error': return <AlertCircle size={14} style={{ color: 'var(--red)' }} />;
      default: return null;
    }
  };

  const getLabel = () => {
    switch (metadataStatus?.status) {
      case 'synced': return 'Synced';
      case 'uploading': return 'Uploading...';
      case 'dirty': return 'Pending';
      case 'error': return 'Sync Error';
      default: return '';
    }
  };

  if (!metadataStatus?.status) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      padding: '0 10px',
      borderRadius: 'var(--radius-sm)',
      height: 32,
      marginRight: 4
    }}>
      {getIcon()}
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {getLabel()} {metadataStatus.items ? `(${metadataStatus.items})` : ''}
      </span>
    </div>
  );
}

export default function FileGrid() {
  const {
    api, files, currentPath, setCurrentPath,
    addTransfer, updateTransfer, removeTransfer, cancelTransfer, getTransferSignal,
    refresh, loading,
    movePath, copyPath, deletePath,
    bulkDelete, bulkMove, bulkCopy,
    uiScale,
  } = useApp();

  const [viewMode, setViewMode] = useState('grid');
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem('disbox_zoom')) || 1);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    localStorage.setItem('disbox_zoom', zoom.toString());
  }, [zoom]);

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
  const [showBreadcrumbMenu, setShowBreadcrumbMenu] = useState(false);
  const [isLastPartTruncated, setIsLastPartTruncated] = useState(false);
  const activeFolderRef = useRef(null);

  // Deteksi jika teks folder aktif terpotong (ada titik-titik)
  useEffect(() => {
    if (activeFolderRef.current) {
      const el = activeFolderRef.current;
      setIsLastPartTruncated(el.scrollWidth > el.clientWidth);
    }
  }, [currentPath, files]);

  const getFolderSize = (path) => {
    return files
      .filter(f => f.path.startsWith(path + '/') || f.path === path)
      .reduce((acc, f) => acc + (f.size || 0), 0);
  };

  useEffect(() => {
    if (selectedFiles.size === 0) setIsSelectionMode(false);
  }, [selectedFiles]);

  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);
  const dirPath = currentPath === '/' ? '' : currentPath.slice(1);

  const navigate = (path) => {
    setCurrentPath(path);
    setSelectedFiles(new Set());
    setContextMenu(null);
    setSearchQuery('');
  };

  const displayedFiles = files.filter(f => {
    const parts = f.path.split('/').filter(Boolean);
    if (parts[parts.length - 1] === '.keep') return false;

    if (searchQuery) {
      const isInside = dirPath === '' || f.path.startsWith(dirPath + '/');
      const matchesName = parts[parts.length - 1].toLowerCase().includes(searchQuery.toLowerCase());
      return isInside && matchesName;
    } else {
      const fileDirStr = parts.slice(0, -1).join('/');
      return fileDirStr === dirPath;
    }
  });

  const subDirs = (() => {
    const dirsMap = new Map();
    files.forEach(f => {
      const parts = f.path.split('/').filter(Boolean);
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        currentPath = currentPath ? currentPath + '/' + parts[i] : parts[i];
        if (!dirsMap.has(currentPath)) {
          dirsMap.set(currentPath, parts[i]);
        }
      }
    });

    const results = [];
    for (const [fullPath, name] of dirsMap.entries()) {
      if (searchQuery) {
        const isInside = dirPath === '' || fullPath.startsWith(dirPath + '/');
        if (isInside && name.toLowerCase().includes(searchQuery.toLowerCase())) {
          results.push({ name, fullPath });
        }
      } else {
        const parentPath = fullPath.split('/').slice(0, -1).join('/');
        if (parentPath === dirPath) {
          results.push({ name, fullPath });
        }
      }
    }
    return results;
  })();

  // ─── Delete ───────────────────────────────────────────────────────────────
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
    parts[parts.length - 1] = renameValue.trim();
    const newPath = parts.join('/');

    if (oldPath === newPath) { setRenameTarget(null); return; }

    try {
      await api.renamePath(oldPath, newPath, renameTarget.id);
      refresh();
    } catch (e) { alert('Gagal rename: ' + e.message); }
    setRenameTarget(null);
  };

  // ─── Upload — respects AbortSignal ────────────────────────────────────────
  const handleUpload = async (selectedFiles) => {
    if (!api || !selectedFiles?.length) return;
    setUploading(true);

    for (const file of selectedFiles) {
      const transferId = crypto.randomUUID();
      const isStringPath = typeof file === 'string';
      const nativePath = isStringPath ? file : file.path;
      const fileName = isStringPath ? file.split('/').pop() : file.name;
      const uploadPath = dirPath ? `${dirPath}/${fileName}` : fileName;

      // Get file size for progress display — pakai statFile (aman untuk file >2GB)
      let totalBytes = 0;
      if (nativePath && window.electron) {
        try {
          const info = await window.electron.statFile(nativePath);
          totalBytes = info.size || 0;
        } catch (_) {}
      } else if (file.size) {
        totalBytes = file.size;
      }

      const CHUNK_SIZE = 8 * 1024 * 1024;
      const totalChunks = totalBytes > 0 ? Math.ceil(totalBytes / CHUNK_SIZE) || 1 : null;

      const signal = addTransfer({
        id: transferId,
        name: fileName,
        progress: 0,
        type: 'upload',
        status: 'active',
        totalBytes,
        totalChunks,
        chunk: 0,
      });

      try {
        if (nativePath) {
          await api.uploadFile(
            { nativePath, name: fileName },
            uploadPath,
            (progress) => {
              const chunk = totalChunks ? Math.min(Math.floor(progress * totalChunks), totalChunks - 1) : 0;
              updateTransfer(transferId, { progress, chunk });
            },
            signal,
            transferId,
          );
        } else {
          const buffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
          });
          const tc = Math.ceil(buffer.byteLength / CHUNK_SIZE) || 1;
          updateTransfer(transferId, { totalBytes: buffer.byteLength, totalChunks: tc });
          await api.uploadFile(
            { buffer, name: fileName, size: buffer.byteLength },
            uploadPath,
            (progress) => {
              const chunk = Math.min(Math.floor(progress * tc), tc - 1);
              updateTransfer(transferId, { progress, chunk });
            },
            signal,
          );
        }

        if (!signal.aborted) {
          updateTransfer(transferId, { status: 'done', progress: 1 });
        }
      } catch (e) {
        if (e.name === 'AbortError' || signal.aborted) {
          // handled by cancelTransfer
        } else {
          updateTransfer(transferId, { status: 'error', error: e.message });
          console.error('Upload failed:', e);
          setTimeout(() => removeTransfer(transferId), 3000);
        }
      }
    }

    setUploading(false);
    refresh();
  };

  const handlePickFiles = async () => {
    if (!window.electron) return;
    const paths = await window.electron.openFiles();
    if (paths?.length) handleUpload(paths);
  };

  const handleDropZone = useCallback((e) => {
    e.preventDefault();
    const items = [...(e.dataTransfer.files || [])];
    if (items.length) handleUpload(items);
  }, [api, currentPath]);

  // ─── Download — respects AbortSignal ─────────────────────────────────────
  const downloadFile = async (file) => {
    const transferId = crypto.randomUUID();
    const fileName = file.path.split('/').pop();
    const totalBytes = file.size || 0;
    const totalChunks = (file.messageIds || []).length || null;

    const signal = addTransfer({
      id: transferId,
      name: fileName,
      progress: 0,
      type: 'download',
      status: 'active',
      totalBytes,
      totalChunks,
      chunk: 0,
    });

    try {
      const buffer = await api.downloadFile(
        file,
        (p) => {
          if (!signal.aborted) {
            const chunk = totalChunks ? Math.min(Math.floor(p * totalChunks), totalChunks - 1) : 0;
            updateTransfer(transferId, { progress: p, chunk });
          }
        },
        signal,
        transferId,
      );

      if (signal.aborted) return;

      const blob = new Blob([buffer], { type: getMimeType(fileName) });
      const url = URL.createObjectURL(blob);

      if (window.electron) {
        const savePath = await window.electron.saveFile(fileName);
        if (savePath) {
          await window.electron.writeFile(savePath, new Uint8Array(buffer));
        }
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
      }
      URL.revokeObjectURL(url);
      updateTransfer(transferId, { status: 'done', progress: 1 });
    } catch (e) {
      if (e.name === 'AbortError' || signal.aborted) {
        // handled by cancelTransfer
      } else {
        updateTransfer(transferId, { status: 'error', error: e.message });
      }
    }
  };

  // ─── Selection ───────────────────────────────────────────────────────────
  const toggleSelect = (id, e) => {
    e.stopPropagation();

    if (!e.ctrlKey && !isSelectionMode) {
      setSelectedFiles(new Set());
      return;
    }

    setIsSelectionMode(true);
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedFiles(new Set());
    setIsSelectionMode(false);
  };

  const handleDragStart = (e, itemPath, id = null) => {
    // Jika selection mode aktif dan item yang didrag adalah bagian dari selection,
    // drag semua item yang dipilih sekaligus
    const itemKey = id || itemPath;
    if (isSelectionMode && selectedFiles.has(itemKey)) {
      // Encode semua selected IDs/paths sebagai JSON di dataTransfer
      const payload = JSON.stringify({ bulk: true, items: [...selectedFiles] });
      e.dataTransfer.setData('text/plain', payload);
      e.dataTransfer.effectAllowed = 'move';
      setDragSource('__bulk__');
      return;
    }

    // Single item drag (normal mode atau item bukan bagian dari selection)
    const dragData = id || itemPath;
    setDragSource(dragData);
    e.dataTransfer.setData('text/plain', dragData);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropMove = async (e, destDir) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain') || dragSource;
    if (!raw) return;
    if (e.dataTransfer.files.length > 0) return;

    const normalizedDest = destDir.startsWith('/') ? destDir.slice(1) : destDir;

    // ── Bulk drag (multi-select) ──────────────────────────────────────────
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (_) {}

    if (parsed?.bulk && Array.isArray(parsed.items)) {
      const items = parsed.items;

      // Validasi: jangan pindah ke dalam diri sendiri
      for (const target of items) {
        const isId = target.includes('-') && target.length > 30;
        let srcPath = target;
        if (isId) {
          const f = files.find(x => x.id === target);
          if (f) srcPath = f.path;
        }
        if (normalizedDest === srcPath || normalizedDest.startsWith(srcPath + '/')) {
          toast.error('Tidak bisa memindahkan ke dalam folder itu sendiri');
          setDragSource(null);
          return;
        }
      }

      try {
        await api.bulkMove(items, normalizedDest);
        toast.success(`${items.length} item dipindahkan`);
        clearSelection();
      } catch (err) { toast.error('Gagal pindah: ' + err.message); }
      setDragSource(null);
      return;
    }

    // ── Single item drag ─────────────────────────────────────────────────
    const source = raw;
    if (source.startsWith('http')) return;

    const isId = source.includes('-') && source.length > 30;
    let sourcePath = source;
    if (isId) {
      const f = files.find(x => x.id === source);
      if (f) sourcePath = f.path;
    }

    const sourceParent = sourcePath.split('/').slice(0, -1).join('/');
    if (sourceParent === normalizedDest) { setDragSource(null); return; }

    if (sourcePath === normalizedDest || normalizedDest.startsWith(sourcePath + '/')) {
      toast.error('Tidak bisa memindahkan ke folder yang sama atau sub-folder');
      setDragSource(null);
      return;
    }

    try {
      if (isId) {
        await api.bulkMove([source], normalizedDest);
      } else {
        await movePath(source, normalizedDest);
      }
      toast.success('Dipindahkan');
    } catch (err) { toast.error('Gagal pindah'); }
    setDragSource(null);
  };

  const [isDragOver, setIsDragOver] = useState(false);

  // ─── Rubber band selection ────────────────────────────────────────────────
  // Rubber band di-render fixed di viewport, bukan di dalam scroll container
  const [rubberBand, setRubberBand] = useState(null); // viewport coords { x, y, w, h }
  const rubberOrigin = useRef(null);
  const contentRef = useRef(null);
  const isRubbering = useRef(false);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('[data-item-id]')) return;
      if (e.target.closest('button, input, a, [role="button"]')) return;

      // Cek apakah klik benar-benar di dalam content area (bukan toolbar/sidebar)
      const rect = content.getBoundingClientRect();
      if (
        e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top  || e.clientY > rect.bottom
      ) return;

      rubberOrigin.current = { x: e.clientX, y: e.clientY };
      isRubbering.current = false;

      if (!e.ctrlKey) {
        setSelectedFiles(new Set());
        setIsSelectionMode(false);
      }

      const onMouseMove = (me) => {
        if (!rubberOrigin.current) return;
        const dx = me.clientX - rubberOrigin.current.x;
        const dy = me.clientY - rubberOrigin.current.y;

        if (!isRubbering.current && Math.sqrt(dx * dx + dy * dy) < 6) return;
        isRubbering.current = true;

        // Clamp koordinat rubber band agar tidak keluar dari content rect
        const cr = content.getBoundingClientRect();
        const clampedX2 = Math.max(cr.left, Math.min(me.clientX, cr.right));
        const clampedY2 = Math.max(cr.top,  Math.min(me.clientY, cr.bottom));

        const rb = {
          x: Math.min(rubberOrigin.current.x, clampedX2),
          y: Math.min(rubberOrigin.current.y, clampedY2),
          w: Math.abs(clampedX2 - rubberOrigin.current.x),
          h: Math.abs(clampedY2 - rubberOrigin.current.y),
        };
        setRubberBand(rb);

        // Hit-test pakai viewport coords
        const newSel = new Set();
        content.querySelectorAll('[data-item-id]').forEach(el => {
          const er = el.getBoundingClientRect();
          const overlaps =
            rb.x < er.right  && rb.x + rb.w > er.left &&
            rb.y < er.bottom && rb.y + rb.h > er.top;
          if (overlaps) newSel.add(el.dataset.itemId);
        });

        setSelectedFiles(newSel);
        setIsSelectionMode(newSel.size > 0);
      };

      const onMouseUp = () => {
        isRubbering.current = false;
        setRubberBand(null);
        rubberOrigin.current = null;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    content.addEventListener('mousedown', onMouseDown);
    return () => content.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete') {
        // Jangan trigger jika sedang mengetik di input (rename, search, dll)
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        if (selectedFiles.size > 0) {
          handleBulkDelete();
        } else if (contextMenu) {
          handleDelete(contextMenu.path, contextMenu.file?.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFiles, contextMenu]);

  return (
    <div
      className={`${styles.container} ${isDragOver ? styles.dragOver : ''} ${isSelectionMode ? styles.isSelectionMode : ''}`}
      style={{ '--zoom': zoom }}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes('Files')) {
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false);
        if (e.dataTransfer.files.length > 0) handleDropZone(e);
      }}
      onClick={() => { setContextMenu(null); if (!isSelectionMode) clearSelection(); }}
      onContextMenu={(e) => {
        if (e.target === e.currentTarget || e.target.classList.contains(styles.content) || e.target.classList.contains(styles.grid)) {
          e.preventDefault();
          setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, type: 'empty' });
        }
      }}
    >
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        {(() => {
          const totalChars = pathParts.join('').length + (pathParts.length * 3);
          const isCompact = totalChars > 60 && pathParts.length > 1;
          const lastPart = pathParts[pathParts.length - 1] || '';
          
          // Hitung panjang visual yang ditampilkan
          const displayLen = isCompact ? (10 + lastPart.length) : totalChars;
          const isShort = displayLen < 160;

          return (
            <div 
              className={styles.breadcrumb}
              style={{ marginRight: isShort ? 24 : 124 }}
            >
              <button
                className={styles.breadcrumbItem}
                onClick={() => navigate('/')}
                onDragOver={e => e.preventDefault()}
                onDrop={e => handleDropMove(e, '')}
              >
                <Home size={13} />
              </button>

              {!isCompact ? (
                pathParts.map((part, i) => {
                  const targetPath = '/' + pathParts.slice(0, i + 1).join('/');
                  const isLast = i === pathParts.length - 1;
                  return (
                    <span key={i} className={styles.breadcrumbRow}>
                      <ChevronRight size={12} className={styles.breadcrumbSep} />
                      <button
                        className={`${styles.breadcrumbItem} ${isLast ? styles.breadcrumbActive : ''}`}
                        onClick={() => navigate(targetPath)}
                      >
                        {part}
                      </button>
                    </span>
                  );
                })
              ) : (
                <>
                  {/* Home > ... > ActiveFolder */}
                  <ChevronRight size={12} className={styles.breadcrumbSep} />
                  
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', zIndex: showBreadcrumbMenu ? 1001 : 'auto' }}>
                    <button
                      className={`${styles.breadcrumbItem} ${styles.breadcrumbEllipsis}`}
                      onClick={(e) => { e.stopPropagation(); setShowBreadcrumbMenu(!showBreadcrumbMenu); }}
                    >
                      ...
                    </button>
                    {showBreadcrumbMenu && (
                      <>
                        <div className={styles.breadcrumbBackdrop} onClick={() => setShowBreadcrumbMenu(false)} />
                        <div className={styles.breadcrumbMenu}>
                          {pathParts.slice(0, -1).map((part, i) => {
                            const targetPath = '/' + pathParts.slice(0, i + 1).join('/');
                            return (
                              <button
                                key={i}
                                className={styles.breadcrumbMenuItem}
                                style={{ paddingLeft: 12 + (i * 12) }}
                                onClick={() => { navigate(targetPath); setShowBreadcrumbMenu(false); }}
                              >
                                <div className={styles.menuBranch} style={{ left: 8 + (i * 12) }} />
                                <Folder size={12} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                                <span className="truncate">{part}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                  
                  <ChevronRight size={12} className={styles.breadcrumbSep} />
                  
                  <button
                    ref={activeFolderRef}
                    className={`${styles.breadcrumbItem} ${styles.breadcrumbActive}`}
                    onClick={() => navigate('/' + pathParts.join('/'))}
                  >
                    {lastPart}
                  </button>
                </>
              )}
            </div>
          );
        })()}

        <div className={styles.toolbarRight}>
          <div className={styles.searchBox}>
            <Search size={13} />
            <input
              type="text"
              placeholder="Cari file…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewActive : ''}`} onClick={() => setViewMode('grid')}>
              <Grid3x3 size={13} />
            </button>
            <button className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewActive : ''}`} onClick={() => setViewMode('list')}>
              <List size={13} />
            </button>
          </div>

          <div className={styles.zoomBox}>
            <ZoomIn size={13} />
            <input
              type="range"
              min="0.6"
              max="1.8"
              step="0.1"
              value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              className={styles.zoomSlider}
            />
          </div>

          <button className={styles.folderBtn} onClick={() => setShowCreateFolder(true)} title="Folder Baru">
            <FolderPlus size={14} />
          </button>

          <MetadataStatusIndicator />

          <button className={styles.uploadBtn} onClick={handlePickFiles} disabled={uploading}>
            <Upload size={14} />
            <span>{uploading ? 'Uploading…' : 'Upload'}</span>
          </button>
        </div>
      </div>

      {/* ── Rubber band overlay — fixed di viewport ── */}
      {rubberBand && rubberBand.w > 4 && rubberBand.h > 4 && createPortal(
        <div
          style={{
            position: 'fixed',
            left: rubberBand.x,
            top: rubberBand.y,
            width: rubberBand.w,
            height: rubberBand.h,
            border: '1.5px solid #5865f2',
            background: 'rgba(88, 101, 242, 0.12)',
            borderRadius: '4px',
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        />,
        document.body
      )}

      {/* ── Content ── */}
      <div
        className={styles.content}
        ref={contentRef}
        style={{ position: 'relative' }}
      >
        {/* rubber band dulu dipasang di sini — sudah dipindah ke fixed overlay di atas */}
        {loading && displayedFiles.length === 0 && subDirs.length === 0 ? (
          <div className={styles.loading}>
            {[...Array(6)].map((_, i) => <div key={i} className={`skeleton ${styles.skeletonCard}`} />)}
          </div>
        ) : displayedFiles.length === 0 && subDirs.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>📂</div>
            <p className={styles.emptyTitle}>Folder kosong</p>
            <p className={styles.emptyHint}>Drop file di sini atau klik Upload</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className={styles.grid}>
            {subDirs.map(({ name: dir, fullPath }) => {
              const folderSize = getFolderSize(fullPath);
              const isBulkDrag = dragSource === '__bulk__';
              const isPartOfSelection = selectedFiles.has(fullPath);
              // Folder ini tidak boleh jadi target jika dia sendiri ada di selection
              const canBeDropTarget = isBulkDrag ? !isPartOfSelection : (fullPath !== dragSource && !fullPath.startsWith((dragSource || '') + '/'));
              return (
                <div
                  key={fullPath}
                  data-item-id={fullPath}
                  className={`${styles.card} ${isPartOfSelection ? styles.selected : ''} ${dragOverTarget === fullPath ? styles.isDragTarget : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, fullPath)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (canBeDropTarget) {
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverTarget !== fullPath) setDragOverTarget(fullPath);
                    }
                  }}
                  onDragLeave={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (
                      e.clientX < rect.left || e.clientX >= rect.right ||
                      e.clientY < rect.top || e.clientY >= rect.bottom
                    ) {
                      setDragOverTarget(null);
                    }
                  }}
                  onDrop={(e) => { setDragOverTarget(null); handleDropMove(e, fullPath); }}
                  onDoubleClick={() => navigate('/' + fullPath)}
                  onClick={(e) => toggleSelect(fullPath, e)}
                  onContextMenu={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: fullPath, isFolder: true });
                  }}
                >
                  <div className={styles.checkbox}><Check size={12} strokeWidth={3} /></div>
                  <div className={styles.cardIcon}><Folder size={32} strokeWidth={1.5} style={{ color: 'var(--amber)' }} /></div>
                  <div className={styles.cardName} title={dir}>
                    {renameTarget?.path === fullPath ? (
                      <input
                        className={styles.renameInput}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }}
                        autoFocus onClick={e => e.stopPropagation()}
                      />
                    ) : dir}
                  </div>
                  <div className={styles.cardMeta}>Folder</div>
                  <div className={styles.infoBadge}><span>{formatSize(folderSize)}</span></div>
                </div>
              );
            })}
            {displayedFiles.map(file => {
              const name = file.path.split('/').pop();
              return (
                <div
                  key={file.id || file.path}
                  data-item-id={file.id}
                  className={`${styles.card} ${selectedFiles.has(file.id) ? styles.selected : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, file.path, file.id)}
                  onClick={(e) => toggleSelect(file.id, e)}
                  onContextMenu={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: file.path, file, isFolder: false });
                  }}
                  onDoubleClick={() => setPreviewFile(file)}
                >
                  <div className={styles.checkbox}><Check size={12} strokeWidth={3} /></div>
                  <div className={styles.cardIcon}><span style={{ fontSize: 32 }}>{getFileIcon(name)}</span></div>
                  <div className={styles.cardName} title={name}>
                    {renameTarget?.path === file.path && renameTarget?.id === file.id ? (
                      <input
                        className={styles.renameInput}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }}
                        autoFocus onClick={e => e.stopPropagation()}
                      />
                    ) : name}
                  </div>
                  <div className={styles.cardMeta}>{formatSize(file.size || 0)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.list}>
            <div className={styles.listHeader}>
              <span style={{ width: 30 }}></span>
              <span style={{ flex: 1 }}>Nama</span>
              <span style={{ width: 100, textAlign: 'right' }}>Ukuran</span>
              <span style={{ width: 120 }}></span>
            </div>
            {subDirs.map(({ name: dir, fullPath }) => {
              const folderSize = getFolderSize(fullPath);
              const isBulkDrag = dragSource === '__bulk__';
              const isPartOfSelection = selectedFiles.has(fullPath);
              const canBeDropTarget = isBulkDrag ? !isPartOfSelection : (fullPath !== dragSource && !fullPath.startsWith((dragSource || '') + '/'));
              return (
                <div
                  key={fullPath}
                  data-item-id={fullPath}
                  className={`${styles.listRow} ${isPartOfSelection ? styles.selected : ''} ${dragOverTarget === fullPath ? styles.isDragTarget : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, fullPath)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (canBeDropTarget) {
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverTarget !== fullPath) setDragOverTarget(fullPath);
                    }
                  }}
                  onDragLeave={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    if (
                      e.clientX < rect.left || e.clientX >= rect.right ||
                      e.clientY < rect.top || e.clientY >= rect.bottom
                    ) { setDragOverTarget(null); }
                  }}
                  onDrop={(e) => { setDragOverTarget(null); handleDropMove(e, fullPath); }}
                  onDoubleClick={() => navigate('/' + fullPath)}
                  onClick={(e) => toggleSelect(fullPath, e)}
                  onContextMenu={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: fullPath, isFolder: true });
                  }}
                >
                  <div className={styles.listCheckbox}>{selectedFiles.has(fullPath) && <Check size={10} strokeWidth={4} />}</div>
                  <div className={styles.listIcon}><Folder size={16} style={{ color: 'var(--amber)' }} /></div>
                  <span className={`${styles.listName} truncate`}>
                    {renameTarget?.path === fullPath ? (
                      <input
                        className={styles.renameInput}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }}
                        autoFocus onClick={e => e.stopPropagation()}
                      />
                    ) : dir}
                  </span>
                  <span className={styles.listSize}>—</span>
                  <div className={styles.listActions} onClick={e => e.stopPropagation()}>
                    <button className={styles.iconBtn} onClick={() => setMoveModal({ path: fullPath, mode: 'move' })} title="Pindah"><Move size={13} /></button>
                    <button className={styles.iconBtn} onClick={() => setMoveModal({ path: fullPath, mode: 'copy' })} title="Salin"><Copy size={13} /></button>
                    <button className={styles.iconBtn} onClick={() => startRename(fullPath, true)} title="Rename"><Edit3 size={13} /></button>
                    <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDelete(fullPath)} title="Hapus"><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
            {displayedFiles.map(file => {
              const name = file.path.split('/').pop();
              return (
                <div
                  key={file.id || file.path}
                  data-item-id={file.id}
                  className={`${styles.listRow} ${selectedFiles.has(file.id) ? styles.selected : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, file.path, file.id)}
                  onClick={(e) => toggleSelect(file.id, e)}
                  onContextMenu={(e) => {
                    e.preventDefault(); e.stopPropagation();
                    setContextMenu({ x: e.clientX / uiScale, y: e.clientY / uiScale, path: file.path, file, isFolder: false });
                  }}
                  onDoubleClick={() => setPreviewFile(file)}
                >
                  <div className={styles.listCheckbox}>{selectedFiles.has(file.id) && <Check size={10} strokeWidth={4} />}</div>
                  <div className={styles.listIcon}>{getFileIcon(name)}</div>
                  <span className={`${styles.listName} truncate`}>
                    {renameTarget?.path === file.path && renameTarget?.id === file.id ? (
                      <input
                        className={styles.renameInput}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }}
                        autoFocus onClick={e => e.stopPropagation()}
                      />
                    ) : name}
                  </span>
                  <span className={styles.listSize}>{formatSize(file.size || 0)}</span>
                  <div className={styles.listActions} onClick={e => e.stopPropagation()}>
                    <button className={styles.iconBtn} onClick={() => downloadFile(file)} title="Download"><Download size={13} /></button>
                    <button className={styles.iconBtn} onClick={() => setMoveModal({ id: file.id, path: file.path, mode: 'move' })} title="Pindah"><Move size={13} /></button>
                    <button className={styles.iconBtn} onClick={() => setMoveModal({ id: file.id, path: file.path, mode: 'copy' })} title="Salin"><Copy size={13} /></button>
                    <button className={styles.iconBtn} onClick={() => startRename(file.path, false, file.id)} title="Rename"><Edit3 size={13} /></button>
                    <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDelete(file.path, file.id)} title="Hapus"><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          className={styles.contextMenuBackdrop}
          onClick={() => setContextMenu(null)}
          onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
        />
      )}
      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.type === 'empty' ? (
            <>
              <button onClick={() => { setShowCreateFolder(true); setContextMenu(null); }}>
                <FolderPlus size={13} /> Folder Baru
              </button>
              <button onClick={() => { handlePickFiles(); setContextMenu(null); }}>
                <Upload size={13} /> Upload File
              </button>
              <div className={styles.contextDivider} />
              <button onClick={() => { refresh(); setContextMenu(null); }}>
                <RefreshCw size={13} /> Refresh
              </button>
            </>
          ) : selectedFiles.size > 1 && selectedFiles.has(contextMenu.isFolder ? contextMenu.path : contextMenu.file?.id) ? (
            <>
              <button onClick={() => { handleBulkMove('move'); setContextMenu(null); }}><Move size={13} /> Pindah {selectedFiles.size} item…</button>
              <button onClick={() => { handleBulkMove('copy'); setContextMenu(null); }}><Copy size={13} /> Salin {selectedFiles.size} item…</button>
              <div className={styles.contextDivider} />
              <button className={styles.dangerItem} onClick={() => { handleBulkDelete(); setContextMenu(null); }}><Trash2 size={13} /> Hapus {selectedFiles.size} item</button>
            </>
          ) : (
            <>
              {!contextMenu.isFolder && (
                <button onClick={() => { downloadFile(contextMenu.file); setContextMenu(null); }}><Download size={13} /> Download</button>
              )}
              <button onClick={() => { setMoveModal({ id: contextMenu.isFolder ? null : contextMenu.file?.id, path: contextMenu.path, mode: 'move' }); setContextMenu(null); }}><Move size={13} /> Pindah ke…</button>
              <button onClick={() => { setMoveModal({ id: contextMenu.isFolder ? null : contextMenu.file?.id, path: contextMenu.path, mode: 'copy' }); setContextMenu(null); }}><Copy size={13} /> Salin ke…</button>
              <button onClick={() => startRename(contextMenu.path, contextMenu.isFolder, contextMenu.isFolder ? null : contextMenu.file?.id)}><Edit3 size={13} /> Rename</button>
              <div className={styles.contextDivider} />
              <button className={styles.dangerItem} onClick={() => { handleDelete(contextMenu.path, contextMenu.isFolder ? null : contextMenu.file?.id); setContextMenu(null); }}><Trash2 size={13} /> Hapus</button>
            </>
          )}
        </div>
      )}

      {/* ── Drop overlay ── */}
      {isDragOver && (
        <div className={styles.dropOverlay}>
          <Upload size={40} />
          <p>Drop untuk upload</p>
        </div>
      )}

      {/* ── Modals ── */}
      {showCreateFolder && <CreateFolderModal onClose={() => setShowCreateFolder(false)} />}
      {moveModal && (
        <MoveModal
          id={moveModal.id}
          file={moveModal.path}
          paths={moveModal.paths}
          mode={moveModal.mode}
          onClose={() => { setMoveModal(null); clearSelection(); }}
        />
      )}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          danger={confirmAction.danger}
          onConfirm={confirmAction.onConfirm}
          onClose={() => setConfirmAction(null)}
        />
      )}
      {previewFile && <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  );
}
