import { useState } from 'react';
import { Move, Copy, X, Check, Folder } from 'lucide-react';
import { useApp } from '../../context/useAppHook.js';
import Backdrop from './Backdrop.jsx';
import styles from '../FolderModal.module.css';

function DirIcon() {
  return (
    <Folder size={15} style={{ color: 'var(--amber)' }} strokeWidth={2} />
  );
}

export default function MoveModal({ id, file, paths, mode, onClose, onUnlock }) {
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
