import { Infinity } from 'lucide-react';
import styles from '../Sidebar.module.css';

export default function StorageIndicator({ files, t }) {
  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  
  const formatSizeGB = (bytes) => {
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  return (
    <div className={styles.storage}>
      <div className={styles.storageLabel}>
        <span>{t('storage')}</span>
        <span className={styles.storageValue}>{formatSizeGB(totalSize)}</span>
      </div>
      <span className={styles.storageNote}>Discord Unlimited <Infinity size={11} style={{ verticalAlign: 'middle', marginBottom: 1 }} /></span>
    </div>
  );
}
