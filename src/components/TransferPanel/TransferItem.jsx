import { useState, useEffect, useRef } from 'react';
import { X, Upload, Download, CheckCircle2, AlertCircle, Square } from 'lucide-react';
import { fmtSpeed, fmtETA, fmtSize } from './TransferUtils.js';
import styles from '../TransferPanel.module.css';

export default function TransferItem({ t, onCancel, onRemove }) {
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
  }, [t.progress, t.status, t.totalBytes]);

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
