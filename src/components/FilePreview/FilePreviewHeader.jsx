import { X, Download, Maximize2, Minimize2, List } from 'lucide-react';
import { formatSize } from '../../utils/disbox.js';
import styles from '../FilePreview.module.css';

export default function FilePreviewHeader({ 
  name, file, mime, navigatableFiles, currentIndex, 
  showFilelist, setShowFilelist, handleDownload, 
  isFull, setIsFull, onClose 
}) {
  return (
    <div className={styles.header}>
      <div className={styles.fileInfo}>
        <span className={styles.fileName}>{name}</span>
        <span className={styles.fileMeta}>
          {formatSize(file.size)} · {mime}
          {navigatableFiles.length > 1 && (
            <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>
              {currentIndex + 1} / {navigatableFiles.length}
            </span>
          )}
        </span>
      </div>
      <div className={styles.actions}>
        {navigatableFiles.length > 1 && (
          <button
            className={styles.actionBtn}
            onClick={() => setShowFilelist(v => !v)}
            title="File list"
            style={{ color: showFilelist ? 'var(--accent-bright)' : undefined }}
          >
            <List size={16} />
          </button>
        )}
        <button className={styles.actionBtn} onClick={handleDownload} title="Download">
          <Download size={16} />
        </button>
        <button className={styles.actionBtn} onClick={() => setIsFull(!isFull)} title={isFull ? 'Minimize' : 'Full Screen'}>
          {isFull ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <div className={styles.divider} />
        <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
      </div>
    </div>
  );
}
