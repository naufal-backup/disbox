import { useState, useEffect, useRef } from 'react';
import { X, Upload, Download, ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Square } from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import styles from './TransferPanel.module.css';

function fmtSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return null;
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}

function fmtETA(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return null;
  if (seconds < 60) return `${Math.ceil(seconds)}d`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}d`;
  return `${Math.floor(seconds / 3600)}j ${Math.floor((seconds % 3600) / 60)}m`;
}

function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function TransferItem({ t, onCancel, onRemove }) {
  const historyRef = useRef([]);
  const [speed, setSpeed] = useState(null);
  const [eta, setEta] = useState(null);

  useEffect(() => {
    if (t.status !== 'active') return;
    const now = Date.now();
    historyRef.current.push({ time: now, progress: t.progress || 0 });
    if (historyRef.current.length > 8) historyRef.current.shift();
    const oldest = historyRef.current[0];
    const newest = historyRef.current[historyRef.current.length - 1];
    const dt = (newest.time - oldest.time) / 1000;
    const dp = newest.progress - oldest.progress;
    if (dt > 0.2 && dp > 0 && t.totalBytes) {
      const bps = (dp * t.totalBytes) / dt;
      setSpeed(bps);
      setEta(((1 - (t.progress || 0)) * t.totalBytes) / bps);
    }
  }, [t.progress, t.status]);

  useEffect(() => {
    historyRef.current = [];
    setSpeed(null);
    setEta(null);
  }, [t.id]);

  const pct = Math.round((t.progress || 0) * 100);
  const isActive = t.status === 'active';
  const isDone = t.status === 'done';
  const isError = t.status === 'error';
  const isCancelled = t.status === 'cancelled';
  const isUpload = t.type === 'upload';
  const chunk = t.chunk ?? null;
  const totalChunks = t.totalChunks ?? null;

  return (
    <div className={`${styles.item} ${isCancelled ? styles.itemCancelled : ''} ${isDone ? styles.itemDone : ''}`}>
      <div className={styles.itemHeader}>
        <div className={styles.itemIcon}>
          {isDone      ? <CheckCircle2 size={15} style={{ color: 'var(--green)' }} /> :
           isError     ? <AlertCircle  size={15} style={{ color: 'var(--red)' }} /> :
           isCancelled ? <AlertCircle  size={15} style={{ color: 'var(--amber)' }} /> :
           isUpload    ? <Upload       size={15} style={{ color: 'var(--accent-bright)' }} /> :
                         <Download    size={15} style={{ color: 'var(--teal)' }} />}
        </div>
        <div className={styles.itemMeta}>
          <span className={styles.itemName} title={t.name}>{t.name}</span>
          <div className={styles.itemSubMeta}>
            {isActive && totalChunks != null && (
              <span className={styles.chunkInfo}>chunk {(chunk ?? 0) + 1}/{totalChunks}</span>
            )}
            {isActive && t.totalBytes > 0 && (
              <span className={styles.sizeInfo}>
                {fmtSize(Math.round((t.progress || 0) * t.totalBytes))} / {fmtSize(t.totalBytes)}
              </span>
            )}
            {isError && <span className={styles.errorText}>{t.error}</span>}
            {isCancelled && <span className={styles.cancelledText}>Dibatalkan</span>}
            {isDone && <span className={styles.doneText}>Selesai</span>}
          </div>
        </div>
        <div className={styles.itemRight}>
          {isActive && (
            <span className={`${styles.pct} ${isUpload ? styles.pctUpload : styles.pctDownload}`}>
              {pct}%
            </span>
          )}
          {isActive && (
            <button className={styles.stopBtn} onClick={() => onCancel(t.id)} title="Hentikan transfer">
              <Square size={9} strokeWidth={0} fill="currentColor" />
            </button>
          )}
          {(isDone || isError || isCancelled) && (
            <button className={styles.removeBtn} onClick={() => onRemove(t.id)}>
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {isActive && (
        <div className={styles.progressWrap}>
          <div className={`${styles.progressBar} ${isUpload ? styles.progressUpload : styles.progressDownload}`}>
            <div className={styles.progressFill} style={{ width: `${pct}%` }} />
            <div className={styles.progressShimmer} style={{ width: `${pct}%` }} />
          </div>
          <div className={styles.statsRow}>
            <span className={styles.statSpeed}>{fmtSpeed(speed) ?? '—'}</span>
            <span className={styles.statEta}>{eta ? `ETA ${fmtETA(eta)}` : ''}</span>
          </div>
        </div>
      )}

      {isDone && (
        <div className={styles.progressWrap}>
          <div className={`${styles.progressBar} ${styles.progressDone}`}>
            <div className={styles.progressFill} style={{ width: '100%' }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function TransferPanel() {
  const { transfers, removeTransfer, cancelTransfer } = useApp();
  const [collapsed, setCollapsed] = useState(false);

  // Filter out hidden transfers (like previews) from the UI
  const visibleTransfers = transfers.filter(t => !t.hidden);

  if (visibleTransfers.length === 0) return null;

  const active = visibleTransfers.filter(t => t.status === 'active').length;
  const done   = visibleTransfers.filter(t => t.status === 'done').length;

  const overallPct = active > 0
    ? Math.round(visibleTransfers.filter(t => t.status === 'active').reduce((s, t) => s + (t.progress || 0), 0) / active * 100)
    : 100;

  return (
    <div className={styles.panel}>
      <div className={styles.header} onClick={() => setCollapsed(c => !c)}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>
            {active > 0 ? `Mentransfer ${active} file…` : `${done} transfer selesai`}
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
          {visibleTransfers.map(t => (
            <TransferItem key={t.id} t={t} onCancel={cancelTransfer} onRemove={removeTransfer} />
          ))}
        </div>
      )}
    </div>
  );
}
