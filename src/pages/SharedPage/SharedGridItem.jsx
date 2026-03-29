import { Eye, Check, Copy, Trash2 } from 'lucide-react';
import { getFileIcon } from '@/utils/disbox.js';
import SharedThumbnail from './SharedThumbnail.jsx';
import styles from './SharedPage.module.css';

export default function SharedGridItem({ 
  link, 
  files, 
  handlePreview, 
  handleCopy, 
  handleRevoke, 
  formatExpiry, 
  copied, 
  revoking, 
  cfWorkerUrl, 
  t 
}) {
  const fileName = link.file_path.split('/').pop();
  const actualFile = files?.find(f => f.id === link.file_id || f.path === link.file_path);
  const ext = fileName.split('.').pop().toLowerCase();
  const isMedia = ['jpg','jpeg','png','gif','webp','mp4','webm','mov','mkv','avi'].includes(ext);

  return (
    <div key={link.id} className={styles.linkCardGrid}>
      <div className={styles.gridPreview} onClick={() => isMedia && handlePreview(link)}>
        {actualFile ? <SharedThumbnail file={actualFile} size={40} /> : <div className={styles.fileIconLarge}>{getFileIcon(link.file_path)}</div>}
        {isMedia && <div className={styles.previewOverlay}><Eye size={16} /></div>}
      </div>
      <div className={styles.gridInfo}>
        <p className={styles.gridName} title={fileName}>{fileName}</p>
        <div className={styles.gridMeta}>
          <span className={link.permission === 'download' ? styles.permDownload : styles.permView}>
            {link.permission === 'download' ? t('download_perm') : t('view_only')}
          </span>
          <span>•</span>
          <span>{formatExpiry(link.expires_at)}</span>
        </div>
      </div>
      <div className={styles.gridActions}>
        <button onClick={() => handleCopy(link.share_url || `${cfWorkerUrl}/share/${link.token}`, link.id)}>
          {copied === link.id ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button className={styles.revokeBtn} onClick={() => handleRevoke(link.id, link.token)} disabled={revoking === link.id}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
