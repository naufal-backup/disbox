import { useState, useEffect, useMemo } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../context/useAppHook.js';
import styles from './TransferPanel.module.css';

import SyncIndicator from './TransferPanel/SyncIndicator.jsx';
import TransferItem from './TransferPanel/TransferItem.jsx';

export default function TransferPanel({ activePage }) {
  const { 
    transfers, removeTransfer, cancelTransfer, 
    autoCloseTransfers, metadataStatus, t,
    currentTrack, hideSyncOverlay
  } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  const visibleTransfers = useMemo(() => transfers.filter(t => !t.hidden), [transfers]);

  useEffect(() => {
    if (!autoCloseTransfers || visibleTransfers.length === 0) return;

    const activeCount = visibleTransfers.filter(t => t.status === 'active').length;
    const hasError = visibleTransfers.some(t => t.status === 'error');

    if (activeCount === 0 && !hasError) {
      const timer = setTimeout(() => {
        const toRemove = visibleTransfers
          .filter(t => t.status === 'done' || t.status === 'cancelled')
          .map(t => t.id);
        
        toRemove.forEach(id => removeTransfer(id));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visibleTransfers, autoCloseTransfers, removeTransfer]);

  const showPanel = visibleTransfers.length > 0;
  const active = visibleTransfers.filter(t => t.status === 'active').length;
  const done   = visibleTransfers.filter(t => t.status === 'done').length;

  const overallPct = active > 0
    ? Math.round(visibleTransfers.filter(t => t.status === 'active').reduce((s, t) => s + (t.progress || 0), 0) / active * 100)
    : 100;

  return (
    <>
      {activePage !== 'settings' && !hideSyncOverlay && (
        <SyncIndicator 
          status={metadataStatus.status} 
          items={metadataStatus.items} 
          panelVisible={showPanel}
          hasMusicBar={!!currentTrack}
          t={t}
        />
      )}

      {showPanel && (
        <div className={`${styles.panel} ${currentTrack ? styles.withMusic : ''}`}>
          <div className={styles.header} onClick={() => setCollapsed(c => !c)}>
            <div className={styles.headerLeft}>
              <span className={styles.title}>
                {active > 0 ? t('transferring_files', { count: active }) : t('transfers_done', { count: done })}
              </span>
              {active > 0 && <span className={styles.headerPct}>{overallPct}%</span>}
            </div>
            <div className={styles.headerActions}>
              {collapsed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </div>
          </div>

          {active > 0 && (
            <div className={styles.headerProgress}>
              <div className={styles.headerProgressFill} style={{ width: `${overallPct}%` }} />
            </div>
          )}

          {!collapsed && (
            <div className={styles.list}>
              {visibleTransfers.map(transfer => (
                <TransferItem key={transfer.id} transfer={transfer} onCancel={cancelTransfer} onRemove={removeTransfer} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
