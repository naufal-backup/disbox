import { useState } from 'react';
import { X, Upload, Download, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import styles from './TransferPanel.module.css';

export default function TransferPanel() {
  const { transfers, removeTransfer } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  if (transfers.length === 0) return null;

  const active = transfers.filter(t => t.status === 'active').length;
  const done = transfers.filter(t => t.status === 'done').length;

  return (
    <div className={styles.panel}>
      <div className={styles.header} onClick={() => setCollapsed(c => !c)}>
        <span className={styles.title}>
          {active > 0 ? `Transferring ${active} file${active > 1 ? 's' : ''}…` : `${done} transfer${done > 1 ? 's' : ''} complete`}
        </span>
        <div className={styles.headerActions}>
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {!collapsed && (
        <div className={styles.list}>
          {transfers.map(t => (
            <div key={t.id} className={styles.item}>
              <div className={styles.itemIcon}>
                {t.status === 'done' ? <CheckCircle2 size={14} style={{ color: 'var(--green)' }} /> :
                 t.status === 'error' ? <AlertCircle size={14} style={{ color: 'var(--red)' }} /> :
                 t.type === 'upload' ? <Upload size={14} style={{ color: 'var(--accent-bright)' }} /> :
                 <Download size={14} style={{ color: 'var(--teal)' }} />}
              </div>
              <div className={styles.itemBody}>
                <div className={styles.itemName}>{t.name}</div>
                {t.status === 'active' && (
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${(t.progress || 0) * 100}%` }} />
                  </div>
                )}
                {t.status === 'error' && <div className={styles.error}>{t.error}</div>}
              </div>
              {(t.status === 'done' || t.status === 'error') && (
                <button className={styles.removeBtn} onClick={() => removeTransfer(t.id)}>
                  <X size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
