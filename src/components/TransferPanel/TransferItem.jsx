import { useState, useEffect, useRef } from 'react';
import { X, Upload, Download, CheckCircle2, AlertCircle, Square } from 'lucide-react';
import { useApp } from '../../context/useAppHook.js';
import { fmtSpeed, fmtETA, fmtSize } from './TransferUtils.js';
import styles from '../TransferPanel.module.css';

export default function TransferItem({ transfer, onCancel, onRemove }) {
  const { t } = useApp();
  const historyRef = useRef([]);
  const [speed, setSpeed] = useState(null);
  const [eta, setEta] = useState(null);

  useEffect(() => {
    if (transfer.status !== 'active') return;
    const now = Date.now();
    historyRef.current.push({ time: now, progress: transfer.progress || 0 });
    if (historyRef.current.length > 8) historyRef.current.shift();
    const oldest = historyRef.current[0];
    const newest = historyRef.current[historyRef.current.length - 1];
    const dt = (newest.time - oldest.time) / 1000;
    const dp = newest.progress - oldest.progress;
    if (dt > 0.2 && dp > 0 && transfer.totalBytes) {
      const bps = (dp * transfer.totalBytes) / dt;
      setSpeed(bps);
      setEta(((1 - (transfer.progress || 0)) * transfer.totalBytes) / bps);
    }
  }, [transfer.progress, transfer.status, transfer.totalBytes]);

  useEffect(() => {
    historyRef.current = [];
    setSpeed(null);
    setEta(null);
  }, [transfer.id]);

  const pct = Math.round((transfer.progress || 0) * 100);
  const isActive = transfer.status === 'active';
  const isDone = transfer.status === 'done';
  const isError = transfer.status === 'error';
  const isCancelled = transfer.status === 'cancelled';
  const isUpload = transfer.type === 'upload';
  const chunk = transfer.chunk ?? null;
  const totalChunks = transfer.totalChunks ?? null;

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
          <span className={styles.itemName} title={transfer.name}>{transfer.name}</span>
          <div className={styles.itemSubMeta}>
            {isActive && totalChunks != null && (
              <span className={styles.chunkInfo}>chunk {(chunk ?? 0) + 1}/{totalChunks}</span>
            )}
            {isActive && transfer.totalBytes > 0 && (
              <span className={styles.sizeInfo}>
                {fmtSize(Math.round((transfer.progress || 0) * transfer.totalBytes))} / {fmtSize(transfer.totalBytes)}
              </span>
            )}
            {isError && <span className={styles.errorText}>{transfer.error}</span>}
            {isCancelled && <span className={styles.cancelledText}>{t('cancelled')}</span>}
            {isDone && <span className={styles.doneText}>{t('done')}</span>}
          </div>
        </div>
        <div className={styles.itemRight}>
          {isActive && (
            <span className={`${styles.pct} ${isUpload ? styles.pctUpload : styles.pctDownload}`}>
              {pct}%
            </span>
          )}
          {isActive && (
            <button className={styles.stopBtn} onClick={() => onCancel(transfer.id)} title="Hentikan transfer">
              <Square size={9} strokeWidth={0} fill="currentColor" />
            </button>
          )}
          {(isDone || isError || isCancelled) && (
            <button className={styles.removeBtn} onClick={() => onRemove(transfer.id)}>
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
