import { AlertCircle, X } from 'lucide-react';
import { useApp } from '../../context/useAppHook.js';
import Backdrop from './Backdrop.jsx';
import styles from '../FolderModal.module.css';

export default function ConfirmModal({ title, message, onConfirm, onClose, danger = false }) {
  const { t } = useApp();
  return (
    <Backdrop onClose={onClose}>
      <div className={styles.modal} style={{ maxWidth: '400px' }}>
        <div className={styles.header}>
          <div className={styles.headerIcon} style={{ 
            background: danger ? 'rgba(237, 66, 69, 0.12)' : 'var(--accent-dim)', 
            color: danger ? '#ed4245' : 'var(--accent-bright)',
            width: '32px',
            height: '32px',
            borderRadius: '10px'
          }}>
            <AlertCircle size={18} />
          </div>
          <span style={{ fontSize: '15px', fontWeight: 700 }}>{title || t('confirm')}</span>
          <button className={styles.closeBtn} onClick={onClose} style={{ marginLeft: 'auto' }}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.body} style={{ padding: '20px 24px' }}>
          <p style={{ 
            fontSize: '14px', 
            color: 'var(--text-secondary)', 
            lineHeight: '1.6',
            margin: 0
          }}>
            {message}
          </p>
        </div>

        <div className={styles.footer} style={{ padding: '16px 24px', background: 'var(--bg-surface-dim)' }}>
          <button 
            className={styles.cancelBtn} 
            onClick={onClose}
            style={{ fontWeight: 600, border: 'none', background: 'var(--bg-hover)' }}
          >
            {t('cancel')}
          </button>
          <button
            className={styles.confirmBtn}
            onClick={() => { onConfirm(); onClose(); }}
            style={{ 
              background: danger ? '#ed4245' : 'var(--accent)',
              padding: '10px 24px',
              borderRadius: '8px',
              fontWeight: 700,
              fontSize: '14px',
              boxShadow: danger ? '0 4px 12px rgba(237, 66, 69, 0.2)' : '0 4px 12px var(--accent-dim)'
            }}
          >
            {danger ? t('delete') : t('confirm')}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}
