import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Link2, Trash2, Copy, Check, Lock, Shield, Eye, X, 
  Grid3x3, List, ArrowUpDown, ChevronDown, Search, Image as ImageIcon, Film, AlertCircle
} from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import toast from 'react-hot-toast';
import FilePreview from '../components/FilePreview.jsx';
import { formatSize, getFileIcon, getMimeType } from '../utils/disbox.js';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './SharedPage.module.css';

// ─── Thumbnail Concurrency Control (Same as Drive) ──────────────────────────
const MAX_CONCURRENT_THUMBS = 1;
let activeThumbDownloads = 0;
const thumbQueue = [];

function processThumbQueue() {
  while (activeThumbDownloads < MAX_CONCURRENT_THUMBS && thumbQueue.length > 0) {
    const { id, task, resolve, reject } = thumbQueue.shift();
    activeThumbDownloads++;
    task()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        activeThumbDownloads--;
        processThumbQueue();
      });
  }
}

function enqueueThumb(id, task) {
  return new Promise((resolve, reject) => {
    thumbQueue.push({ id, task, resolve, reject });
    processThumbQueue();
  });
}

function FileThumbnail({ file, size = 32 }) {
  const { api, showPreviews, showImagePreviews, showVideoPreviews, addTransfer, updateTransfer, removeTransfer } = useApp();
  const [thumbUrl, setThumbUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const name = file.path?.split('/').pop() || '';
  const ext = name.split('.').pop().toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi'].includes(ext);

  useEffect(() => {
    const canShowImage = showPreviews && showImagePreviews && isImage;
    const canShowVideo = showPreviews && showVideoPreviews && isVideo;

    if (!canShowImage && !canShowVideo) {
      if (thumbUrl) { URL.revokeObjectURL(thumbUrl); setThumbUrl(null); }
      return;
    }

    let isMounted = true;
    let objectUrl = null;
    const transferId = `shared-thumb-${file.id}`;

    const compressImage = (blob) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX_SIZE) { h = Math.floor(h * MAX_SIZE / w); w = MAX_SIZE; } }
        else { if (h > MAX_SIZE) { w = Math.floor(w * MAX_SIZE / h); h = MAX_SIZE; } }
        canvas.width = Math.max(1, w); canvas.height = Math.max(1, h);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(resolve, 'image/webp', 0.7);
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(blob);
    });

    // FIX: chunk pertama tidak support seek (duration NaN/Infinity)
    // Draw frame langsung saat onloadeddata/canplay, tanpa seek
    const captureVideoFrame = (blob) => new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      const url = URL.createObjectURL(blob);
      let settled = false;

      const settle = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        video.src = '';
        URL.revokeObjectURL(url);
        resolve(result);
      };

      const drawFrame = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 256;
          let w = video.videoWidth || 320, h = video.videoHeight || 180;
          if (w > h) { if (w > MAX_SIZE) { h = Math.floor(h * MAX_SIZE / w); w = MAX_SIZE; } }
          else { if (h > MAX_SIZE) { w = Math.floor(w * MAX_SIZE / h); h = MAX_SIZE; } }
          canvas.width = Math.max(1, w); canvas.height = Math.max(1, h);
          canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(settle, 'image/webp', 0.7);
        } catch (e) { settle(null); }
      };

      // Fallback timeout 8 detik
      const timer = setTimeout(() => drawFrame(), 8000);

      // Draw saat data tersedia — tidak seek karena chunk pertama tidak support it
      video.onloadeddata = () => drawFrame();
      video.oncanplay = () => { if (!settled) drawFrame(); };
      video.onerror = () => settle(null);
      video.src = url;
    });

    const loadThumb = async () => {
      const jitter = Math.random() * 1500;
      await new Promise(r => setTimeout(r, jitter));
      if (!isMounted) return;
      setLoading(true);
      try {
        await enqueueThumb(transferId, async () => {
          if (!isMounted) return;

          const signal = addTransfer({
            id: transferId, name: `Thumbnail: ${name}`,
            progress: 0, type: 'download', status: 'active', hidden: true
          });

          // VIDEO: hanya download chunk pertama untuk hemat bandwidth
          let fileToDownload = file;
          if (isVideo && file.messageIds?.length > 0) {
            fileToDownload = { ...file, messageIds: [file.messageIds[0]] };
          }

          const buffer = await api.downloadFile(
            fileToDownload,
            (p) => updateTransfer(transferId, { progress: p }),
            signal,
            transferId
          );

          if (!isMounted || signal.aborted) return;

          const mime = getMimeType(name);
          const originalBlob = new Blob([buffer], { type: mime });

          let compressedBlob;
          if (isVideo) {
            compressedBlob = await captureVideoFrame(originalBlob);
          } else {
            compressedBlob = await compressImage(originalBlob);
          }

          if (compressedBlob && isMounted) {
            objectUrl = URL.createObjectURL(compressedBlob);
            setThumbUrl(objectUrl);
          }

          updateTransfer(transferId, { status: 'done', progress: 1 });
          setTimeout(() => removeTransfer(transferId), 500);
        });
      } catch (e) {
        if (isMounted) console.error('Thumb failed:', e.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadThumb();

    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      window.electron?.cancelUpload?.(transferId);
      removeTransfer(transferId);
      const idx = thumbQueue.findIndex(q => q.id === transferId);
      if (idx >= 0) thumbQueue.splice(idx, 1);
    };
  }, [file.id, showPreviews, showImagePreviews, showVideoPreviews, isImage, isVideo]);

  if (thumbUrl) {
    return (
      <div className={styles.thumbWrapper}>
        <img src={thumbUrl} alt="" className={styles.thumbImage} />
      </div>
    );
  }

  if (loading) return <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 6 }} />;

  return <span style={{ fontSize: size }}>{getFileIcon(name)}</span>;
}

export default function SharedPage({ onNavigateToSettings }) {
  const { 
    shareEnabled, shareLinks, loadShareLinks, revokeShareLink, revokeAllLinks, 
    cfWorkerUrl, api, files, t, uiScale, animationsEnabled 
  } = useApp();

  const [viewMode, setViewMode] = useState(() => localStorage.getItem('disbox_shared_view') || 'list');
  const [sortMode, setSortMode] = useState(() => localStorage.getItem('disbox_shared_sort') || 'date');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [copied, setCopied] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [showRevokeAll, setShowRevokeAll] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

  useEffect(() => {
    if (shareEnabled && api) loadShareLinks();
  }, [shareEnabled, api]);

  useEffect(() => { localStorage.setItem('disbox_shared_view', viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem('disbox_shared_sort', sortMode); }, [sortMode]);

  const backdropVariants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  const modalVariants = {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
    exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
  };
  const transition = animationsEnabled ? {} : { duration: 0 };

  const filteredAndSortedLinks = useMemo(() => {
    let result = [...shareLinks];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => l.file_path.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      if (sortMode === 'name') {
        const nameA = a.file_path.split('/').pop().toLowerCase();
        const nameB = b.file_path.split('/').pop().toLowerCase();
        return nameA.localeCompare(nameB);
      }
      if (sortMode === 'date') return new Date(b.created_at) - new Date(a.created_at);
      if (sortMode === 'size') {
        const fileA = files.find(f => f.id === a.file_id || f.path === a.file_path);
        const fileB = files.find(f => f.id === b.file_id || f.path === b.file_path);
        return (fileB?.size || 0) - (fileA?.size || 0);
      }
      return 0;
    });
    return result;
  }, [shareLinks, searchQuery, sortMode, files]);

  if (!shareEnabled) {
    return (
      <div className={styles.gateContainer}>
        <div className={styles.gateCard}>
          <Lock size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
          <h3 className={styles.gateTitle}>{t('feature_not_active')}</h3>
          <p className={styles.gateDesc}>{t('feature_active_hint')}</p>
          <button className={styles.gateBtn} onClick={onNavigateToSettings}>{t('go_to_settings')}</button>
        </div>
      </div>
    );
  }

  const handleCopy = (link, id) => {
    navigator.clipboard.writeText(link);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
    toast.success(t('copy_link') + ' ' + t('synced').toLowerCase());
  };

  const handleRevoke = async (id, token) => {
    setRevoking(id);
    const ok = await revokeShareLink(id, token);
    if (ok) toast.success(t('revoke') + ' ' + t('synced').toLowerCase());
    else toast.error('Error');
    setRevoking(null);
  };

  const handleRevokeAll = async () => {
    const ok = await revokeAllLinks();
    if (ok) { toast.success(t('revoke_all') + ' ' + t('synced').toLowerCase()); setShowRevokeAll(false); }
    else toast.error('Error');
  };

  const formatExpiry = (expiresAt) => {
    if (!expiresAt) return t('permanent');
    const diff = expiresAt - Date.now();
    if (diff <= 0) return t('expired');
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return t('days_left', { days });
  };

  const handlePreview = (link) => {
    const actualFile = files?.find(f => f.id === link.file_id || f.path === link.file_path);
    if (actualFile) setPreviewFile(actualFile);
    else toast.error(t('loading'));
  };

  return (
    <div className={styles.container} onClick={() => setShowSortMenu(false)}>
      <div className={styles.header}>
        <h2 className={styles.title}>{t('shared_by_me')}</h2>
        <div className={styles.headerActions}>
          {shareLinks.length > 0 && (
            <button className={styles.revokeAllBtn} onClick={(e) => { e.stopPropagation(); setShowRevokeAll(true); }}>
              <Trash2 size={13} /> {t('revoke_all')}
            </button>
          )}
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={13} />
          <input type="text" placeholder={t('search')} value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.sortBoxContainer}>
            <button className={styles.sortBox} onClick={(e) => { e.stopPropagation(); setShowSortMenu(!showSortMenu); }}>
              <ArrowUpDown size={12} />
              <span className={styles.sortText}>{sortMode === 'name' ? t('sort_name') : sortMode === 'date' ? t('sort_date') : t('sort_size')}</span>
              <ChevronDown size={12} className={showSortMenu ? styles.rotated : ''} />
            </button>
            {showSortMenu && (
              <div className={styles.sortMenu} onClick={e => e.stopPropagation()}>
                <button className={sortMode === 'name' ? styles.active : ''} onClick={() => { setSortMode('name'); setShowSortMenu(false); }}>{t('sort_name')}</button>
                <button className={sortMode === 'date' ? styles.active : ''} onClick={() => { setSortMode('date'); setShowSortMenu(false); }}>{t('sort_date')}</button>
                <button className={sortMode === 'size' ? styles.active : ''} onClick={() => { setSortMode('size'); setShowSortMenu(false); }}>{t('sort_size')}</button>
              </div>
            )}
          </div>
          <div className={styles.viewToggle}>
            <button className={viewMode === 'grid' ? styles.viewActive : ''} onClick={() => setViewMode('grid')}><Grid3x3 size={14} /></button>
            <button className={viewMode === 'list' ? styles.viewActive : ''} onClick={() => setViewMode('list')}><List size={14} /></button>
          </div>
        </div>
      </div>

      {filteredAndSortedLinks.length === 0 ? (
        <div className={styles.empty}>
          <Link2 size={40} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <p className={styles.emptyTitle}>{t('no_shared_links')}</p>
          <p className={styles.emptyHint}>{t('shared_hint')}</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? styles.linkGrid : styles.linkList}>
          {filteredAndSortedLinks.map(link => {
            const fileName = link.file_path.split('/').pop();
            const actualFile = files?.find(f => f.id === link.file_id || f.path === link.file_path);
            const ext = fileName.split('.').pop().toLowerCase();
            const isMedia = ['jpg','jpeg','png','gif','webp','mp4','webm','mov','mkv','avi'].includes(ext);

            if (viewMode === 'grid') {
              return (
                <div key={link.id} className={styles.linkCardGrid}>
                  <div className={styles.gridPreview} onClick={() => isMedia && handlePreview(link)}>
                    {actualFile ? <FileThumbnail file={actualFile} size={40} /> : <div className={styles.fileIconLarge}>{getFileIcon(link.file_path)}</div>}
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

            return (
              <div key={link.id} className={styles.linkCard}>
                <div className={styles.linkIcon}>
                  {actualFile ? <FileThumbnail file={actualFile} size={24} /> : getFileIcon(link.file_path)}
                </div>
                <div className={styles.linkInfo}>
                  <p className={styles.linkName}>{fileName}</p>
                  <div className={styles.linkMeta}>
                    <span className={`${styles.permBadge} ${link.permission === 'download' ? styles.permDownload : styles.permView}`}>
                      {link.permission === 'download' ? t('download_perm') : t('view_only')}
                    </span>
                    <span className={styles.expiry}>{formatExpiry(link.expires_at)}</span>
                    <span className={styles.created}>{new Date(link.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className={styles.linkActions}>
                  {isMedia && (
                    <button className={styles.actionBtn} onClick={() => handlePreview(link)} title={t('preview')}><Eye size={14} /></button>
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
          })}
        </div>
      )}

      <AnimatePresence>
        {showRevokeAll && (
          <motion.div
            className={styles.confirmOverlay}
            onClick={() => setShowRevokeAll(false)}
            initial="initial" animate="animate" exit="exit"
            variants={backdropVariants} transition={transition}
          >
            <motion.div
              className={styles.confirmCard}
              onClick={e => e.stopPropagation()}
              variants={modalVariants} transition={transition}
            >
              <Shield size={32} style={{ color: 'var(--red)', marginBottom: 12 }} />
              <h3 style={{ marginBottom: 8 }}>{t('revoke_all_confirm')}</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>{t('revoke_all_desc')}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className={styles.cancelBtn} onClick={() => setShowRevokeAll(false)}>{t('cancel')}</button>
                <button className={styles.dangerBtn} onClick={handleRevokeAll}>{t('revoke_all')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {previewFile && <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}
      </AnimatePresence>
    </div>
  );
}
