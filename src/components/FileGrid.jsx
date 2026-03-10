import { useState, useCallback, useEffect } from 'react';
import {
  Upload, FolderPlus, Grid3x3, List, Search,
  Download, Trash2, Edit3, Folder,
  ChevronRight, Home, Move, Copy, Check, AlertCircle, ZoomIn
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useApp } from '../AppContext.jsx';
import { formatSize, getFileIcon, getMimeType } from '../utils/disbox.js';
import { CreateFolderModal, MoveModal, ConfirmModal } from './FolderModal.jsx';
import styles from './FileGrid.module.css';

export default function FileGrid() {
  const {
    api, files, currentPath, setCurrentPath,
    addTransfer, updateTransfer, refresh, loading,
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
  const [renameTarget, setRenameTarget] = useState(null); // { path, isFolder }
  const [renameValue, setRenameValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [moveModal, setMoveModal] = useState(null); // { paths, mode: 'move'|'copy' }
  const [dragSource, setDragSource] = useState(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null); // Track hovered folder path

  const getFolderSize = (path) => {
    return files
      .filter(f => f.path.startsWith(path + '/') || f.path === path)
      .reduce((acc, f) => acc + (f.size || 0), 0);
  };

  useEffect(() => {
    if (selectedFiles.size === 0) setIsSelectionMode(false);
  }, [selectedFiles]);

  // ─── Path helpers ────────────────────────────────────────────────────────────
  const pathParts = currentPath === '/' ? [] : currentPath.split('/').filter(Boolean);
  const dirPath = currentPath === '/' ? '' : currentPath.slice(1);

  const navigate = (path) => {
    setCurrentPath(path);
    setSelectedFiles(new Set());
    setContextMenu(null);
  };

  // ─── Files in current dir ────────────────────────────────────────────────────
  const displayedFiles = files.filter(f => {
    const parts = f.path.split('/').filter(Boolean);
    if (parts[parts.length - 1] === '.keep') return false; // Hide .keep placeholder
    const fileDirStr = parts.slice(0, -1).join('/');
    return fileDirStr === dirPath;
  }).filter(f =>
    !searchQuery || f.path.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Subdirectories at current level
  const subDirs = (() => {
    const depth = dirPath === '' ? 0 : dirPath.split('/').length;
    const dirs = new Set();
    files.forEach(f => {
      const parts = f.path.split('/').filter(Boolean);
      if (parts.length > depth + 1) {
        const parentDir = parts.slice(0, depth).join('/');
        if (parentDir === dirPath) dirs.add(parts[depth]);
      }
    });
    return [...dirs];
  })();

  // ─── Actions ─────────────────────────────────────────────────────────────────
  
  const handleDelete = async (targetPath) => {
    const name = targetPath.split('/').pop();
    setConfirmAction({
      title: 'Hapus Item',
      message: `Apakah Anda yakin ingin menghapus "${name}"? Semua isi di dalamnya akan ikut terhapus.`,
      danger: true,
      onConfirm: async () => {
        try { 
          await deletePath(targetPath); 
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

  const startRename = (path, isFolder = false) => {
    setRenameTarget({ path, isFolder });
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
      await api.renamePath(oldPath, newPath); 
      refresh(); 
    } catch (e) { alert('Gagal rename: ' + e.message); }
    setRenameTarget(null);
  };

  // ─── Upload ──────────────────────────────────────────────────────────────────
  const handleUpload = async (selectedFiles) => {
    if (!api || !selectedFiles?.length) return;
    setUploading(true);

    for (const file of selectedFiles) {
      const transferId = crypto.randomUUID();
      const isStringPath = typeof file === 'string';
      const nativePath = isStringPath ? file : file.path;
      const fileName = isStringPath ? file.split('/').pop() : file.name;
      const uploadPath = dirPath ? `${dirPath}/${fileName}` : fileName;

      addTransfer({ id: transferId, name: fileName, progress: 0, type: 'upload', status: 'active' });

      try {
        if (nativePath) {
          await api.uploadFile(
            { nativePath, name: fileName },
            uploadPath,
            (progress) => updateTransfer(transferId, { progress })
          );
        } else {
          const buffer = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
          });
          await api.uploadFile(
            { buffer, name: fileName, size: buffer.byteLength },
            uploadPath,
            (progress) => updateTransfer(transferId, { progress })
          );
        }
        updateTransfer(transferId, { status: 'done', progress: 1 });
      } catch (e) {
        updateTransfer(transferId, { status: 'error', error: e.message });
        console.error('Upload failed:', e);
        setTimeout(() => removeTransfer(transferId), 3000);
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

  // ─── Download ────────────────────────────────────────────────────────────────
  const downloadFile = async (file) => {
    const transferId = crypto.randomUUID();
    const fileName = file.path.split('/').pop();
    addTransfer({ id: transferId, name: fileName, progress: 0, type: 'download', status: 'active' });
    try {
      const buffer = await api.downloadFile(file, (p) => updateTransfer(transferId, { progress: p }));
      const blob = new Blob([buffer], { type: getMimeType(fileName) });
      const url = URL.createObjectURL(blob);
      if (window.electron) {
        const savePath = await window.electron.saveFile(fileName);
        if (savePath) {
          const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
          await window.electron.writeFile(savePath, b64);
        }
      } else {
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
      }
      URL.revokeObjectURL(url);
      updateTransfer(transferId, { status: 'done', progress: 1 });
    } catch (e) {
      updateTransfer(transferId, { status: 'error', error: e.message });
    }
  };

  // ─── Selection ───────────────────────────────────────────────────────────────
  const toggleSelect = (fileId, e) => {
    e.stopPropagation();
    
    if (!e.ctrlKey && !isSelectionMode) {
      setSelectedFiles(new Set());
      return;
    }

    setIsSelectionMode(true);
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedFiles(new Set());
    setIsSelectionMode(false);
  };

  const handleDragStart = (e, path) => {
    if (isSelectionMode) { e.preventDefault(); return; }
    setDragSource(path);
    e.dataTransfer.setData('text/plain', path);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropMove = async (e, destDir) => {
    e.preventDefault();
    const sourcePath = e.dataTransfer.getData('text/plain') || dragSource;
    if (!sourcePath) return;
    if (sourcePath.startsWith('http') || e.dataTransfer.files.length > 0) return;

    const name = sourcePath.split('/').pop();
    const targetPath = destDir ? `${destDir}/${name}` : name;
    
    // Prevent moving to same location
    if (sourcePath === targetPath) return;
    
    // Prevent moving into itself or its children
    if (destDir === sourcePath || destDir.startsWith(sourcePath + '/')) {
      toast.error('Tidak bisa memindahkan ke folder yang sama atau sub-folder');
      return;
    }

    try {
      await movePath(sourcePath, destDir);
      toast.success('Dipindahkan');
    } catch (e) { toast.error('Gagal pindah'); }
    setDragSource(null);
  };

  const [isDragOver, setIsDragOver] = useState(false);

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
      >
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.breadcrumb}>
          <button 
            className={styles.breadcrumbItem} 
            onClick={() => navigate('/')}
            onDragOver={e => e.preventDefault()}
            onDrop={e => handleDropMove(e, '')}
          >
            <Home size={13} />
          </button>
          {pathParts.map((part, i) => {
            const targetPath = '/' + pathParts.slice(0, i + 1).join('/');
            return (
              <span key={i} className={styles.breadcrumbRow}>
                <ChevronRight size={12} className={styles.breadcrumbSep} />
                <button
                  className={styles.breadcrumbItem}
                  onClick={() => navigate(targetPath)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => handleDropMove(e, targetPath === '/' ? '' : targetPath.slice(1))}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </div>

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

          <button className={styles.uploadBtn} onClick={handlePickFiles} disabled={uploading}>
            <Upload size={14} />
            <span>{uploading ? 'Uploading…' : 'Upload'}</span>
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className={styles.content}>
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
            {subDirs.map(dir => {
              const fullPath = (dirPath ? dirPath + '/' : '') + dir;
              const folderSize = getFolderSize(fullPath);
              return (
                <div
                  key={dir}
                  className={`${styles.card} ${selectedFiles.has(fullPath) ? styles.selected : ''} ${dragOverTarget === fullPath ? styles.isDragTarget : ''}`}
                  draggable={!isSelectionMode}
                  onDragStart={(e) => handleDragStart(e, fullPath)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (fullPath !== dragSource && !fullPath.startsWith(dragSource + '/')) {
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDragEnter={() => setDragOverTarget(fullPath)}
                  onDragLeave={() => setDragOverTarget(null)}
                  onDrop={(e) => {
                    setDragOverTarget(null);
                    handleDropMove(e, fullPath);
                  }}
                  onDoubleClick={() => navigate('/' + fullPath)}
                  onClick={(e) => toggleSelect(fullPath, e)}
                  onContextMenu={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation();
                    setContextMenu({ 
                      x: e.clientX / uiScale, 
                      y: e.clientY / uiScale, 
                      path: fullPath, 
                      isFolder: true 
                    }); 
                  }}
                >
                  <div className={styles.checkbox}>
                    <Check size={12} strokeWidth={3} />
                  </div>
                  <div className={styles.cardIcon}>
                    <Folder size={32} strokeWidth={1.5} style={{ color: 'var(--amber)' }} />
                  </div>
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
                  
                  {/* Stylish Size Badge */}
                  <div className={styles.infoBadge}>
                    <span>{formatSize(folderSize)}</span>
                  </div>
                </div>
              );
            })}
            {displayedFiles.map(file => {
              const name = file.path.split('/').pop();
              return (
                <div
                  key={file.path}
                  className={`${styles.card} ${selectedFiles.has(file.path) ? styles.selected : ''}`}
                  draggable={!isSelectionMode}
                  onDragStart={(e) => handleDragStart(e, file.path)}
                  onClick={(e) => toggleSelect(file.path, e)}
                  onContextMenu={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation();
                    setContextMenu({ 
                      x: e.clientX / uiScale, 
                      y: e.clientY / uiScale, 
                      path: file.path, 
                      file, 
                      isFolder: false 
                    }); 
                  }}
                  onDoubleClick={() => downloadFile(file)}
                >
                  <div className={styles.checkbox}>
                    <Check size={12} strokeWidth={3} />
                  </div>
                  <div className={styles.cardIcon}>
                    <span style={{ fontSize: 32 }}>{getFileIcon(name)}</span>
                  </div>
                  <div className={styles.cardName} title={name}>
                    {renameTarget?.path === file.path ? (
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
            {subDirs.map(dir => {
              const fullPath = (dirPath ? dirPath + '/' : '') + dir;
              const folderSize = getFolderSize(fullPath);
              return (
                <div 
                  key={dir} 
                  className={`${styles.listRow} ${selectedFiles.has(fullPath) ? styles.selected : ''} ${dragOverTarget === fullPath ? styles.isDragTarget : ''}`}
                  draggable={!isSelectionMode}
                  onDragStart={(e) => handleDragStart(e, fullPath)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (fullPath !== dragSource && !fullPath.startsWith(dragSource + '/')) {
                      e.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDragEnter={() => setDragOverTarget(fullPath)}
                  onDragLeave={() => setDragOverTarget(null)}
                  onDrop={(e) => {
                    setDragOverTarget(null);
                    handleDropMove(e, fullPath);
                  }}
                  onDoubleClick={() => navigate('/' + fullPath)}
                  onClick={(e) => toggleSelect(fullPath, e)}
                  onContextMenu={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation();
                    setContextMenu({ 
                      x: e.clientX / uiScale, 
                      y: e.clientY / uiScale, 
                      path: fullPath, 
                      isFolder: true 
                    }); 
                  }}
                >
                  <div className={styles.listCheckbox}>
                    {selectedFiles.has(fullPath) && <Check size={10} strokeWidth={4} />}
                  </div>
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
                  key={file.path}
                  className={`${styles.listRow} ${selectedFiles.has(file.path) ? styles.selected : ''}`}
                  draggable={!isSelectionMode}
                  onDragStart={(e) => handleDragStart(e, file.path)}
                  onClick={(e) => toggleSelect(file.path, e)}
                  onContextMenu={(e) => { 
                    e.preventDefault(); 
                    e.stopPropagation();
                    setContextMenu({ 
                      x: e.clientX / uiScale, 
                      y: e.clientY / uiScale, 
                      path: file.path, 
                      file, 
                      isFolder: false 
                    }); 
                  }}
                >
                  <div className={styles.listCheckbox}>
                    {selectedFiles.has(file.path) && <Check size={10} strokeWidth={4} />}
                  </div>
                  <div className={styles.listIcon}>{getFileIcon(name)}</div>
                  <span className={`${styles.listName} truncate`}>
                    {renameTarget?.path === file.path ? (
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
                    <button className={styles.iconBtn} onClick={() => setMoveModal({ path: file.path, mode: 'move' })} title="Pindah"><Move size={13} /></button>
                    <button className={styles.iconBtn} onClick={() => setMoveModal({ path: file.path, mode: 'copy' })} title="Salin"><Copy size={13} /></button>
                    <button className={styles.iconBtn} onClick={() => startRename(file.path)} title="Rename"><Edit3 size={13} /></button>
                    <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDelete(file.path)} title="Hapus"><Trash2 size={13} /></button>
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
          {selectedFiles.size > 1 && selectedFiles.has(contextMenu.path) ? (
            <>
              <button onClick={() => { handleBulkMove('move'); setContextMenu(null); }}>
                <Move size={13} /> Pindah {selectedFiles.size} item…
              </button>
              <button onClick={() => { handleBulkMove('copy'); setContextMenu(null); }}>
                <Copy size={13} /> Salin {selectedFiles.size} item…
              </button>
              <div className={styles.contextDivider} />
              <button className={styles.dangerItem} onClick={() => { handleBulkDelete(); setContextMenu(null); }}>
                <Trash2 size={13} /> Hapus {selectedFiles.size} item
              </button>
            </>
          ) : (
            <>
              {!contextMenu.isFolder && (
                <button onClick={() => { downloadFile(contextMenu.file); setContextMenu(null); }}>
                  <Download size={13} /> Download
                </button>
              )}
              <button onClick={() => { setMoveModal({ path: contextMenu.path, mode: 'move' }); setContextMenu(null); }}>
                <Move size={13} /> Pindah ke…
              </button>
              <button onClick={() => { setMoveModal({ path: contextMenu.path, mode: 'copy' }); setContextMenu(null); }}>
                <Copy size={13} /> Salin ke…
              </button>
              <button onClick={() => startRename(contextMenu.path, contextMenu.isFolder)}>
                <Edit3 size={13} /> Rename
              </button>
              <div className={styles.contextDivider} />
              <button className={styles.dangerItem} onClick={() => { handleDelete(contextMenu.path); setContextMenu(null); }}>
                <Trash2 size={13} /> Hapus
              </button>
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
      {showCreateFolder && (
        <CreateFolderModal onClose={() => { setShowCreateFolder(false); }} />
      )}
      {moveModal && (
        <MoveModal
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
    </div>
  );
}
