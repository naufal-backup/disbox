import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import styles from '../TransferPanel.module.css';

export default function SyncIndicator({ status, items, panelVisible, t }) {
  const isUploading = status === 'uploading' || status === 'dirty';
  const isSynced = status === 'synced';
  const isError = status === 'error';

  const label = status === 'uploading' ? t('syncing_items', { count: items }) : 
                status === 'dirty' ? t('waiting_sync') : 
                isSynced ? t('synced') : t('sync_error');

  return (
    <div 
      className={styles.syncIndicator} 
      style={{ 
        bottom: panelVisible ? 'calc(20px + 52px)' : '20px',
      }}
    >
      <div className={styles.syncBadge} style={{ 
        borderColor: isError ? 'var(--red)' : isSynced ? 'rgba(59, 165, 93, 0.4)' : '' 
      }}>
        <div className={`${styles.syncIcon} ${isUploading ? styles.syncIconSpin : ''}`} style={{ 
          color: isError ? 'var(--red)' : isSynced ? 'var(--green)' : 'var(--accent-bright)' 
        }}>
          {isError ? <AlertCircle size={14} /> : 
           isSynced ? <CheckCircle2 size={14} /> : 
           <RefreshCw size={14} />}
        </div>
        <span className={styles.syncText}>{label}</span>
      </div>
    </div>
  );
}
