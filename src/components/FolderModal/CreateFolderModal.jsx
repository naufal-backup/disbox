import { useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { useApp } from '../../context/useAppHook.js';
import Backdrop from './Backdrop.jsx';
import styles from '../FolderModal.module.css';

export default function CreateFolderModal({ onClose }) {
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
