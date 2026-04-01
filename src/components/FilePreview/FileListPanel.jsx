import { X } from 'lucide-react';
import { formatSize } from '../../utils/disbox.js';
import { globalPreviewCache } from './PreviewCache.js';
import styles from '../FilePreview.module.css';

export default function FileListPanel({ 
  showFilelist, navigatableFiles, file, onFileChange, setShowFilelist 
}) {
  if (!showFilelist || navigatableFiles.length <= 1) return null;

  return (
    <div className={styles.fileList} onClick={e => e.stopPropagation()}>
      <div className={styles.fileListHeader}>
        <span>{navigatableFiles.length} files</span>
        <button onClick={() => setShowFilelist(false)}><X size={13} /></button>
      </div>
      <div className={styles.fileListScroll}>
        {navigatableFiles.map((f, i) => {
          const fname = f.path.split('/').pop();
          const isCurrent = f.id === file.id || f.path === file.path;
          const isCached = globalPreviewCache.has(f.id);
          return (
            <button
              key={f.id || f.path}
              className={`${styles.fileListItem} ${isCurrent ? styles.fileListItemActive : ''}`}
              onClick={() => { onFileChange?.(f); setShowFilelist(false); }}
            >
              <span className={styles.fileListName} title={fname}>{fname}</span>
              <span className={styles.fileListMeta}>
                {isCached && <span className={styles.cachedDot} title="Cached" />}
                {formatSize(f.size || 0)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
