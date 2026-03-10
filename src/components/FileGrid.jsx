import { useState, useCallback } from 'react';
import {
  Upload, FolderPlus, Grid3x3, List, Search,
  Download, Trash2, Edit3, Folder,
  ChevronRight, Home, Move, Copy,
} from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import { formatSize, getFileIcon, getMimeType } from '../utils/disbox.js';
import { CreateFolderModal, MoveModal } from './FolderModal.jsx';
import styles from './FileGrid.module.css';

export default function FileGrid() {
  const {
    api, files, currentPath, setCurrentPath,
    addTransfer, updateTransfer, refresh, loading,
  } = useApp();

  const [viewMode, setViewMode] = useState('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFiles, setSelectedFiles] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [moveModal, setMoveModal] = useState(null); // { file, mode: 'move'|'copy' }

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

  // ─── Delete ──────────────────────────────────────────────────────────────────
  const deleteFile = async (file) => {
    if (!confirm(`Hapus "${file.path.split('/').pop()}"?`)) return;
    try { await api.deleteFile(file.path); refresh(); }
    catch (e) { alert('Gagal hapus: ' + e.message); }
  };

  // ─── Rename ──────────────────────────────────────────────────────────────────
  const startRename = (file) => {
    setRenameTarget(file);
    setRenameValue(file.path.split('/').pop());
    setContextMenu(null);
  };

  const commitRename = async () => {
    if (!renameTarget || !renameValue.trim()) { setRenameTarget(null); return; }
    const parts = renameTarget.path.split('/');
    parts[parts.length - 1] = renameValue.trim();
    try { await api.renameFile(renameTarget.path, parts.join('/')); refresh(); }
    catch (e) { alert('Gagal rename: ' + e.message); }
    setRenameTarget(null);
  };

  // ─── Selection ───────────────────────────────────────────────────────────────
  const toggleSelect = (fileId, e) => {
    e.stopPropagation();
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.has(fileId) ? next.delete(fileId) : next.add(fileId);
      return next;
    });
  };

  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={`${styles.container} ${isDragOver ? styles.dragOver : ''}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => { setIsDragOver(false); handleDropZone(e); }}
      onClick={() => { setContextMenu(null); setSelectedFiles(new Set()); }}
    >
      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <div className={styles.breadcrumb}>
          <button className={styles.breadcrumbItem} onClick={() => navigate('/')}>
            <Home size={13} />
          </button>
          {pathParts.map((part, i) => (
            <span key={i} className={styles.breadcrumbRow}>
              <ChevronRight size={12} className={styles.breadcrumbSep} />
              <button
                className={styles.breadcrumbItem}
                onClick={() => navigate('/' + pathParts.slice(0, i + 1).join('/'))}
              >
                {part}
              </button>
            </span>
          ))}
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
            {subDirs.map(dir => (
              <div
                key={dir}
                className={styles.card}
                onDoubleClick={() => navigate((dirPath ? '/' + dirPath : '') + '/' + dir)}
              >
                <div className={styles.cardIcon}>
                  <Folder size={32} strokeWidth={1.5} style={{ color: 'var(--amber)' }} />
                </div>
                <div className={styles.cardName}>{dir}</div>
                <div className={styles.cardMeta}>Folder</div>
              </div>
            ))}
            {displayedFiles.map(file => {
              const name = file.path.split('/').pop();
              return (
                <div
                  key={file.path}
                  className={`${styles.card} ${selectedFiles.has(file.path) ? styles.selected : ''}`}
                  onClick={(e) => toggleSelect(file.path, e)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, file }); }}
                  onDoubleClick={() => downloadFile(file)}
                >
                  <div className={styles.cardIcon}>
                    <span style={{ fontSize: 32 }}>{getFileIcon(name)}</span>
                  </div>
                  <div className={styles.cardName} title={name}>{name}</div>
                  <div className={styles.cardMeta}>{formatSize(file.size || 0)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.list}>
            <div className={styles.listHeader}>
              <span style={{ flex: 1 }}>Nama</span>
              <span style={{ width: 100, textAlign: 'right' }}>Ukuran</span>
              <span style={{ width: 100 }}></span>
            </div>
            {subDirs.map(dir => (
              <div key={dir} className={styles.listRow} onDoubleClick={() => navigate((dirPath ? '/' + dirPath : '') + '/' + dir)}>
                <div className={styles.listIcon}><Folder size={16} style={{ color: 'var(--amber)' }} /></div>
                <span className={`${styles.listName} truncate`}>{dir}</span>
                <span className={styles.listSize}>—</span>
                <div className={styles.listActions} />
              </div>
            ))}
            {displayedFiles.map(file => {
              const name = file.path.split('/').pop();
              return (
                <div
                  key={file.path}
                  className={`${styles.listRow} ${selectedFiles.has(file.path) ? styles.selected : ''}`}
                  onClick={(e) => toggleSelect(file.path, e)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, file }); }}
                >
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
                    <button className={styles.iconBtn} onClick={() => setMoveModal({ file, mode: 'move' })} title="Pindah"><Move size={13} /></button>
                    <button className={styles.iconBtn} onClick={() => setMoveModal({ file, mode: 'copy' })} title="Salin"><Copy size={13} /></button>
                    <button className={styles.iconBtn} onClick={() => startRename(file)} title="Rename"><Edit3 size={13} /></button>
                    <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => deleteFile(file)} title="Hapus"><Trash2 size={13} /></button>
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
          className={styles.contextMenu}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={() => { downloadFile(contextMenu.file); setContextMenu(null); }}>
            <Download size={13} /> Download
          </button>
          <button onClick={() => { setMoveModal({ file: contextMenu.file, mode: 'move' }); setContextMenu(null); }}>
            <Move size={13} /> Pindah ke…
          </button>
          <button onClick={() => { setMoveModal({ file: contextMenu.file, mode: 'copy' }); setContextMenu(null); }}>
            <Copy size={13} /> Salin ke…
          </button>
          <button onClick={() => startRename(contextMenu.file)}>
            <Edit3 size={13} /> Rename
          </button>
          <div className={styles.contextDivider} />
          <button className={styles.dangerItem} onClick={() => { deleteFile(contextMenu.file); setContextMenu(null); }}>
            <Trash2 size={13} /> Hapus
          </button>
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
          file={moveModal.file}
          mode={moveModal.mode}
          onClose={() => setMoveModal(null)}
        />
      )}
    </div>
  );
}
