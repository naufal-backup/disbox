import { useState } from 'react';
import { FolderPlus, Move, Copy, X, ChevronRight, Home, Check, AlertCircle, Youtube, Music, Video, Download } from 'lucide-react';
...
// ─── YT-DLP Modal ─────────────────────────────────────────────────────────────
export function YtDlpModal({ onClose, onConfirm }) {
  const { t } = useApp();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = (type) => {
    const trimmed = url.trim();
    if (!trimmed) { setError('URL tidak boleh kosong'); return; }
    if (!trimmed.startsWith('http')) { setError('URL tidak valid'); return; }
    onConfirm(trimmed, type);
  };

  return (
    <Backdrop onClose={onClose}>
      <div className={styles.modal} style={{ maxWidth: 400 }}>
        <div className={styles.header}>
          <div className={styles.headerIcon} style={{ background: 'rgba(255, 0, 0, 0.1)', color: '#ff0000' }}>
            <Youtube size={16} />
          </div>
          <span>YT-DLP Auto Upload</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={14} /></button>
        </div>

        <div className={styles.body}>
          <label className={styles.label}>Link Video / Music</label>
          <input
            className={`${styles.input} ${error ? styles.inputError : ''}`}
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={e => { setUrl(e.target.value); setError(''); }}
            onKeyDown={e => {
              if (e.key === 'Enter') handleConfirm('video');
            }}
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.4 }}>
            File akan didownload otomatis ke folder sementara, lalu diupload ke Disbox.
          </p>
        </div>

        <div className={styles.footer} style={{ gap: 10 }}>
          <button className={styles.cancelBtn} onClick={onClose}>{t('cancel')}</button>
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            <button 
              className={styles.confirmBtn} 
              onClick={() => handleConfirm('music')}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Music size={14} /> Music
            </button>
            <button 
              className={styles.confirmBtn} 
              onClick={() => handleConfirm('video')}
              style={{ background: 'var(--accent)', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Video size={14} /> Video
            </button>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
import { useApp } from '../AppContext.jsx';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './FolderModal.module.css';

// ─── Shared components ────────────────────────────────────────────────────────
function Backdrop({ children, onClose }) {
  const { animationsEnabled } = useApp();
  
  const backdropVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const modalVariants = {
    initial: { opacity: 0, scale: 0.95, y: 10 },
    animate: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 300 }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: 10,
      transition: { duration: 0.15 }
    }
  };

  const transition = animationsEnabled ? {} : { duration: 0 };

  return (
    <motion.div 
      className={styles.backdrop} 
      onClick={onClose}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={backdropVariants}
      transition={transition}
    >
      <motion.div 
        onClick={e => e.stopPropagation()}
        variants={modalVariants}
        transition={transition}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ─── Create Folder Modal ──────────────────────────────────────────────────────
export function CreateFolderModal({ onClose }) {
  const { createFolder, files, currentPath, t } = useApp();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError(t('error_empty')); return; }
    if (/[/\\:*?"<>|]/.test(trimmed)) { setError(t('error_invalid')); return; }
    
    // Check for duplicates
    const dirPath = currentPath === '/' ? '' : currentPath.slice(1);
    const exists = files.some(f => {
      const parts = f.path.split('/');
      const parent = parts.slice(0, -1).join('/');
      const itemName = parts[parts.length - 1];
      
      // Check if it's a folder (via .keep) or a file
      if (itemName === '.keep') {
        const folderName = parts[parts.length - 2];
        const folderParent = parts.slice(0, -2).join('/');
        return folderParent === dirPath && folderName === trimmed;
      }
      return parent === dirPath && itemName === trimmed;
    });

    if (exists) {
      setError(t('error_duplicate'));
      return;
    }

    setLoading(true);
    const ok = await createFolder(trimmed);
    setLoading(false);
    if (ok) onClose();
    else setError(t('error_create_folder'));
  };

  return (
    <Backdrop onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerIcon}><FolderPlus size={16} /></div>
          <span>{t('new_folder')}</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={14} /></button>
        </div>

        <div className={styles.body}>
          <label className={styles.label}>{t('folder_name_placeholder')}</label>
          <input
            className={`${styles.input} ${error ? styles.inputError : ''}`}
            placeholder={t('folder_name_placeholder') + '...'}
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>{t('cancel')}</button>
          <button className={styles.confirmBtn} onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? t('creating') : t('create')}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ─── Move / Copy Modal ────────────────────────────────────────────────────────
export function MoveModal({ id, file, paths, mode, onClose, onUnlock }) {
  const { getAllDirs, movePath, copyPath, bulkMove, bulkCopy, files: allFiles, t } = useApp();
  const [selectedDir, setSelectedDir] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isBulk = Array.isArray(paths) && paths.length > 0;
  
  // Resolve itemPath if we have an ID
  let itemPath = isBulk ? null : (typeof file === 'string' ? file : file.path);
  if (id && !isBulk) {
    const f = allFiles.find(x => x.id === id);
    if (f) itemPath = f.path;
  }

  const itemName = isBulk ? `${paths.length} item` : itemPath.split('/').pop();

  const dirs = getAllDirs().filter(d => {
    if (isBulk) {
      return !paths.some(p => {
        // p could be ID or path
        const isId = p.includes('-') && p.length > 30;
        let pPath = p;
        if (isId) {
          const f = allFiles.find(x => x.id === p);
          if (f) pPath = f.path;
        }
        const absPPath = '/' + pPath;
        
        // Cannot move/copy into self or subfolders
        if (d === absPPath || d.startsWith(absPPath + '/')) return true;
        
        // Cannot move/copy to same directory (unless unlocking)
        if (mode !== 'unlock') {
          const pDirPath = '/' + pPath.split('/').slice(0, -1).join('/');
          if (d === pDirPath) return true;
        }
        
        return false;
      });
    }
    const itemDirPath = '/' + itemPath.split('/').slice(0, -1).join('/');
    const targetDir = d === '/' ? '' : d.slice(1);
    
    // Cannot move/copy to same directory (unless unlocking)
    if (mode !== 'unlock' && targetDir === itemPath.split('/').slice(0, -1).join('/')) return false;
    
    // Cannot move/copy into self or subfolders
    return d !== '/' + itemPath && !d.startsWith('/' + itemPath + '/');
  });

  const handleConfirm = async () => {
    if (selectedDir === null) return;
    const destDir = selectedDir === '/' ? '' : selectedDir.slice(1);
    
    // Collision check
    const itemsToMove = isBulk ? paths.map(p => {
      const isId = p.includes('-') && p.length > 30;
      if (isId) return allFiles.find(x => x.id === p)?.path.split('/').pop();
      return p.split('/').pop();
    }) : [itemPath.split('/').pop()];

    const hasCollision = allFiles.some(f => {
      const parts = f.path.split('/');
      const parent = parts.slice(0, -1).join('/');
      const existingName = parts[parts.length - 1];
      
      if (parent === destDir) {
        if (existingName === '.keep') {
          const folderName = parts[parts.length - 2];
          return itemsToMove.includes(folderName);
        }
        return itemsToMove.includes(existingName);
      }
      return false;
    });

    if (hasCollision) {
      setError(t('error_duplicate'));
      return;
    }

    setLoading(true);
    setError('');
    
    let ok = false;
    if (isBulk) {
      ok = (mode === 'move' || mode === 'unlock') ? await bulkMove(paths, destDir) : await bulkCopy(paths, destDir);
    } else {
      ok = (mode === 'move' || mode === 'unlock') ? await movePath(itemPath, destDir, id) : await copyPath(itemPath, destDir, id);
    }

    if (ok && mode === 'unlock' && onUnlock) {
      await onUnlock();
    }

    setLoading(false);
    if (ok) onClose();
    else setError('Gagal memproses operasi');
  };

  const getTitle = () => {
    if (mode === 'move') return t('move');
    if (mode === 'copy') return t('copy');
    if (mode === 'unlock') return t('unlock');
    return t('move');
  };

  const getBtnLabel = () => {
    if (mode === 'move') return t('move');
    if (mode === 'copy') return t('copy');
    if (mode === 'unlock') return t('unlock');
    return t('move');
  };

  return (
    <Backdrop onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerIcon} style={{ background: (mode === 'move' || mode === 'unlock') ? 'rgba(240,165,0,0.15)' : 'rgba(0,212,170,0.12)', color: (mode === 'move' || mode === 'unlock') ? 'var(--amber)' : 'var(--teal)' }}>
            {mode === 'copy' ? <Copy size={16} /> : <Move size={16} />}
          </div>
          <span>{getTitle()}</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={14} /></button>
        </div>

        <div className={styles.body}>
          <p className={styles.fileLabel}>
            <span style={{ color: 'var(--text-muted)' }}>{t('sort_name')}: </span>
            <strong>{itemName}</strong>
          </p>
          <label className={styles.label}>{t('pilih_tujuan')}</label>
          <div className={styles.dirList}>
            {dirs.map(dir => (
              <button
                key={dir}
                className={`${styles.dirItem} ${selectedDir === dir ? styles.dirSelected : ''}`}
                onClick={() => { setSelectedDir(dir); setError(''); }}
              >
                <DirIcon />
                <span className={styles.dirPath}>{dir}</span>
                {selectedDir === dir && <Check size={13} style={{ color: 'var(--accent-bright)', marginLeft: 'auto' }} />}
              </button>
            ))}
            {dirs.length === 0 && (
              <p className={styles.emptyDirs}>Tidak ada folder lain. Buat folder dulu.</p>
            )}
          </div>
          {error && <p className={styles.error} style={{ marginTop: 12 }}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>{t('cancel')}</button>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={loading || selectedDir === null}
            style={mode === 'copy' ? { background: 'var(--teal)' } : {}}
          >
            {loading ? t('processing') : getBtnLabel()}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────
export function ConfirmModal({ title, message, onConfirm, onClose, danger = false }) {
  const { t } = useApp();
  return (
    <Backdrop onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerIcon} style={{ background: danger ? 'rgba(237,66,69,0.15)' : 'var(--accent-dim)', color: danger ? 'var(--red)' : 'var(--accent-bright)' }}>
            <AlertCircle size={16} />
          </div>
          <span>{title || t('confirm')}</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={14} /></button>
        </div>

        <div className={styles.body}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {message}
          </p>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>{t('cancel')}</button>
          <button
            className={styles.confirmBtn}
            onClick={() => { onConfirm(); onClose(); }}
            style={danger ? { background: 'var(--red)' } : {}}
          >
            {t('confirm')}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function DirIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

