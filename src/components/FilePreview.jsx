import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Download, Maximize2, Minimize2, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import { useApp } from '../AppContext.jsx';
import { getMimeType, formatSize } from '../utils/disbox.js';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './FilePreview.module.css';

export default function FilePreview({ file, allFiles = [], onFileChange, onClose }) {
  const { api, addTransfer, updateTransfer, removeTransfer, animationsEnabled } = useApp();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState(null); // { type, url, text }
  const [error, setError] = useState('');
  const [isFull, setIsFull] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const viewportRef = useRef(null);
  const previewCache = useRef(new Map()); // Cache for storing { type, url, text } by file.id

  const name = file.path.split('/').pop();
  const ext = name.split('.').pop().toLowerCase();
  const mime = getMimeType(name);

  // List of files that can be navigated (images & videos)
  const navigatableFiles = useMemo(() => {
    if (!allFiles.length) return [];
    return allFiles.filter(f => {
      const fExt = f.path.split('.').pop().toLowerCase();
      return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(fExt);
    });
  }, [allFiles]);

  const currentIndex = useMemo(() => {
    return navigatableFiles.findIndex(f => f.id === file.id || f.path === file.path);
  }, [navigatableFiles, file]);

  const hasNext = currentIndex < navigatableFiles.length - 1;
  const hasPrev = currentIndex > 0;

  const goToNext = useCallback((e) => {
    e?.stopPropagation();
    if (hasNext && onFileChange) {
      onFileChange(navigatableFiles[currentIndex + 1]);
    }
  }, [hasNext, currentIndex, navigatableFiles, onFileChange]);

  const goToPrevious = useCallback((e) => {
    e?.stopPropagation();
    if (hasPrev && onFileChange) {
      onFileChange(navigatableFiles[currentIndex - 1]);
    }
  }, [hasPrev, currentIndex, navigatableFiles, onFileChange]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrevious, onClose]);

  // Cleanup cache and revoke all object URLs when the preview is closed
  useEffect(() => {
    return () => {
      previewCache.current.forEach(item => {
        if (item.url) URL.revokeObjectURL(item.url);
      });
      previewCache.current.clear();
    };
  }, []);

  const handleDownload = useCallback(async () => {
    const fileName = file.path.split('/').pop();
    const transferId = `preview-dl-${file.id}-${Date.now()}`;
    const totalBytes = file.size || 0;
    const CHUNK_SIZE = 7.5 * 1024 * 1024;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE) || 1;
    const signal = addTransfer({ id: transferId, name: fileName, progress: 0, type: 'download', status: 'active', totalBytes, totalChunks, chunk: 0 });
    try {
      const buffer = await api.downloadFile(file, (p) => {
        if (!signal.aborted) {
          const chunk = totalChunks ? Math.min(Math.floor(p * totalChunks), totalChunks - 1) : 0;
          updateTransfer(transferId, { progress: p, chunk });
        }
      }, signal, transferId);
      if (signal.aborted) return;
      const blob = new Blob([buffer], { type: getMimeType(fileName) });
      const url = URL.createObjectURL(blob);
      if (window.electron) {
        const savePath = await window.electron.saveFile(fileName);
        if (savePath) await window.electron.writeFile(savePath, new Uint8Array(buffer));
      } else {
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
      }
      URL.revokeObjectURL(url);
      updateTransfer(transferId, { status: 'done', progress: 1 });
      setTimeout(() => removeTransfer(transferId), 1000);
    } catch (e) {
      if (e.name !== 'AbortError' && !signal.aborted) {
        updateTransfer(transferId, { status: 'error', error: e.message });
      }
    }
  }, [file, api, addTransfer, updateTransfer, removeTransfer]);

  useEffect(() => {
    let isMounted = true;
    const transferId = `preview-${file.id}`;

    const loadContent = async () => {
      // Check cache first
      if (previewCache.current.has(file.id)) {
        setContent(previewCache.current.get(file.id));
        setLoading(false);
        setError('');
        return;
      }

      setLoading(true);
      setError('');
      setContent(null); // Clear content while loading new file
      try {
        const signal = addTransfer({ id: transferId, name: `Preview: ${name}`, progress: 0, type: 'download', status: 'active', hidden: true });
        const buffer = await api.downloadFile(file, (p) => {
          if (isMounted) {
            setDownloadProgress(Math.round(p * 100));
            updateTransfer(transferId, { progress: p });
          }
        }, signal, transferId);

        if (!isMounted || signal.aborted) return;

        const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
        const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext);
        const isAudio = ['mp3', 'wav', 'flac', 'ogg'].includes(ext);
        const isPdf = ext === 'pdf';
        const isText = ['txt', 'md', 'js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'html', 'css', 'json', 'yml', 'yaml', 'sql', 'sh', 'bash', 'xml', 'cpp', 'c', 'java'].includes(ext);

        let newContent = null;
        if (isImage || isVideo || isAudio || isPdf) {
          const blob = new Blob([buffer], { type: mime });
          const objectUrl = URL.createObjectURL(blob);
          newContent = { type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'pdf', url: objectUrl };
        } else if (isText) {
          const text = new TextDecoder().decode(buffer);
          newContent = { type: 'text', text };
        } else {
          newContent = { type: 'unsupported' };
        }

        if (newContent) {
          previewCache.current.set(file.id, newContent);
          if (isMounted) setContent(newContent);
        }
        
        updateTransfer(transferId, { status: 'done', progress: 1 });
        setTimeout(() => removeTransfer(transferId), 500);
      } catch (e) {
        if (isMounted) {
          console.error('Preview failed:', e);
          setError('Gagal memuat pratinjau: ' + e.message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadContent();

    return () => {
      isMounted = false;
      window.electron?.cancelUpload?.(transferId);
      removeTransfer(transferId);
    };
  }, [file.id, api, name, ext, mime]); 

  const backdropVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const modalVariants = {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 300 }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: 20,
      transition: { duration: 0.2 }
    }
  };

  const transition = animationsEnabled ? {} : { duration: 0 };

  return (
    <motion.div 
      className={`${styles.overlay} ${isFull ? styles.isFull : ''}`} 
      onClick={onClose}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={backdropVariants}
      transition={transition}
    >
      <motion.div 
        className={styles.modal} 
        onClick={e => e.stopPropagation()}
        variants={modalVariants}
        transition={transition}
      >
        <div className={styles.header}>
          <div className={styles.fileInfo}>
            <span className={styles.fileName}>{name}</span>
            <span className={styles.fileMeta}>{formatSize(file.size)} · {mime}</span>
          </div>
          <div className={styles.actions}>
            <button className={styles.actionBtn} onClick={handleDownload} title="Download">
              <Download size={16} />
            </button>
            <button className={styles.actionBtn} onClick={() => setIsFull(!isFull)} title={isFull ? "Minimize" : "Full Screen"}>
              {isFull ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <div className={styles.divider} />
            <button className={styles.closeBtn} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className={styles.viewport} ref={viewportRef}>
          {hasPrev && (
            <button className={`${styles.navBtn} ${styles.prevBtn}`} onClick={goToPrevious} title="Previous">
              <ChevronLeft size={24} />
            </button>
          )}
          {hasNext && (
            <button className={`${styles.navBtn} ${styles.nextBtn}`} onClick={goToNext} title="Next">
              <ChevronRight size={24} />
            </button>
          )}

          {loading ? (
            <div className={styles.state}>
              <Loader2 size={32} className="spin" style={{ color: 'var(--accent)' }} />
              <p>Mendownload dari Discord... {downloadProgress > 0 ? `${downloadProgress}%` : ''}</p>
            </div>
          ) : error ? (
            <div className={styles.state}>
              <AlertCircle size={32} style={{ color: 'var(--red)' }} />
              <p>{error}</p>
              <button className={styles.retryBtn} onClick={handleDownload}>Download Saja</button>
            </div>
          ) : (
            <div className={styles.content}>
              {content?.type === 'image' && (
                <div className={styles.imageWrapper}>
                  <img key={content.url} src={content.url} alt={name} draggable={false} />
                </div>
              )}
              {content?.type === 'video' && (
                <video key={content.url} src={content.url} controls autoPlay className={styles.video} />
              )}
              {content?.type === 'audio' && (
                <div className={styles.audioWrapper}>
                  <div className={styles.audioIcon}>🎵</div>
                  <audio key={content.url} src={content.url} controls autoPlay className={styles.audio} />
                </div>
              )}
              {content?.type === 'pdf' && (
                <iframe src={content.url} className={styles.pdf} title={name} />
              )}
              {content?.type === 'text' && (
                <div className={styles.textWrapper}>
                  <SyntaxHighlighter
                    language={getLanguage(ext)}
                    style={vscDarkPlus}
                    customStyle={{ margin: 0, padding: '20px', background: 'transparent', fontSize: '13px', lineHeight: '1.6' }}
                    showLineNumbers
                  >
                    {content.text}
                  </SyntaxHighlighter>
                </div>
              )}
              {content?.type === 'unsupported' && (
                <div className={styles.state}>
                  <div style={{ fontSize: 48 }}>📄</div>
                  <p>Pratinjau tidak tersedia untuk format ini.</p>
                  <button className={styles.retryBtn} onClick={handleDownload}>Download untuk Melihat</button>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function getLanguage(ext) {
  const map = {
    js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx',
    py: 'python', rs: 'rust', html: 'html', css: 'css', json: 'json',
    yml: 'yaml', yaml: 'yaml', sql: 'sql', sh: 'bash', bash: 'bash', md: 'markdown',
    xml: 'xml', cpp: 'cpp', c: 'c', java: 'java'
  };
  return map[ext] || 'text';
}
