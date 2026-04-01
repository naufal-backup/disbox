import { AlertCircle, X } from 'lucide-react';
import { useApp } from '../../context/useAppHook.js';
import Backdrop from './Backdrop.jsx';
import styles from '../FolderModal.module.css';

export default function ConfirmModal({ title, message, onConfirm, onClose, danger = false }) {
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
            {danger ? t('delete') : t('confirm')}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}
