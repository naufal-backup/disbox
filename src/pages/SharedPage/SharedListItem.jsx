import { Eye, Check, Copy, Trash2 } from 'lucide-react';
import { getFileIcon } from '@/utils/disbox.js';
import SharedThumbnail from './SharedThumbnail.jsx';
import styles from './SharedPage.module.css';

export default function SharedListItem({ 
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
    <div key={link.id} className={styles.linkCard}>
      <div className={styles.linkIcon}>
        {actualFile ? <SharedThumbnail file={actualFile} size={24} /> : getFileIcon(link.file_path)}
      </div>
      <div className={styles.linkInfo}>
        <p className={styles.linkName}>{fileName}</p>
        <div className={styles.linkMeta}>
          <span className={`${styles.permBadge} ${link.permission === 'download' ? styles.permDownload : styles.permView}`}>
            {link.permission === 'download' ? t('download_perm') : t('view_only')}
          </span>
          <span className={styles.expiry}>{formatExpiry(link.expires_at)}</span>
          <span className={styles.created}>
            {new Date(link.created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className={styles.linkActions}>
        {isMedia && (
          <button className={styles.actionBtn} onClick={() => handlePreview(link)} title={t('preview')}>
            <Eye size={14} />
          </button>
        )}
        <button className={styles.actionBtn} onClick={() => handleCopy(link.share_url || `${cfWorkerUrl}/share/${link.token}`, link.id)}>
          {copied === link.id ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button className={styles.revokeBtn} onClick={() => handleRevoke(link.id, link.token)} disabled={revoking === link.id}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
