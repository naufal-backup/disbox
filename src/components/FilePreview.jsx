import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { X, Download, Maximize2, Minimize2, Loader2, AlertCircle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import { useApp } from '../AppContext.jsx';
import { getMimeType, formatSize } from '../utils/disbox.js';
import styles from './FilePreview.module.css';

export default function FilePreview({ file, onClose }) {
  const { api, addTransfer, updateTransfer, cancelTransfer, removeTransfer } = useApp();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState(null); // { type, url, text }
  const [error, setError] = useState('');
  const [isFull, setIsFull] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [scale, setScale] = useState(1);
  const viewportRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const zoomData = useRef(null);

  const name = file.path.split('/').pop();
  const ext = name.split('.').pop().toLowerCase();
  const mime = getMimeType(name);

  useEffect(() => {
    let objectUrl = null;
    const transferId = `preview-${file.id || crypto.randomUUID()}`;
    
    // Register as a transfer to get consistent behavior (cancellation support)
    // We set hidden: true because we don't want preview progress in the bottom panel
    const signal = addTransfer({
      id: transferId,
      name: `Preview: ${name}`,
      progress: 0,
      type: 'download',
      status: 'active',
      hidden: true
    });

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        setDownloadProgress(0);

        const buffer = await api.downloadFile(file, (p) => {
          setDownloadProgress(Math.round(p * 100));
          updateTransfer(transferId, { progress: p });
        }, signal, transferId);

        if (signal.aborted) return;

        const blob = new Blob([buffer], { type: mime });
        objectUrl = URL.createObjectURL(blob);

        if (mime.startsWith('image/')) {
          setContent({ type: 'image', url: objectUrl });
        } else if (mime.startsWith('video/')) {
          setContent({ type: 'video', url: objectUrl });
        } else if (mime.startsWith('audio/')) {
          setContent({ type: 'audio', url: objectUrl });
        } else if (mime === 'application/pdf') {
          setContent({ type: 'pdf', url: objectUrl });
        } else if (isTextFile(ext)) {
          try {
            const text = new TextDecoder().decode(buffer);
            setContent({ type: 'text', text });
          } catch (e) {
            console.error('Text decoding failed:', e);
            setContent({ type: 'unsupported' });
          }
        } else {
          setContent({ type: 'unsupported' });
        }

        updateTransfer(transferId, { status: 'done', progress: 1 });
        // Auto remove from panel after a short delay on success
        setTimeout(() => removeTransfer(transferId), 1000);
      } catch (e) {
        if (e.name === 'AbortError' || signal.aborted) {
          console.log('[preview] Download load aborted');
          return;
        }
        console.error('Preview failed:', e);
        setError('Gagal memuat pratinjau: ' + e.message);
        updateTransfer(transferId, { status: 'error', error: e.message });
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      // Behavior: closing preview stops the download
      cancelTransfer(transferId);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  // Keyboard & Wheel Zoom Logic
  useEffect(() => {
    if (content?.type !== 'image') return;

    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          setScale(s => Math.min(s + 0.25, 5));
        } else if (e.key === '-') {
          e.preventDefault();
          setScale(s => Math.max(s - 0.25, 1));
        } else if (e.key === '0') {
          e.preventDefault();
          setScale(1);
        }
      }
    };

    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        const newScale = Math.min(Math.max(scale + delta, 1), 10);
        
        if (newScale !== scale && viewportRef.current) {
          const viewport = viewportRef.current;
          const rect = viewport.getBoundingClientRect();
          
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          const contentX = viewport.scrollLeft + mouseX;
          const contentY = viewport.scrollTop + mouseY;
          const ratio = newScale / scale;

          zoomData.current = { mouseX, mouseY, contentX, contentY, ratio };
          setScale(newScale);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [content, scale]);

  useLayoutEffect(() => {
    if (!zoomData.current || !viewportRef.current) return;
    const { mouseX, mouseY, contentX, contentY, ratio } = zoomData.current;
    const viewport = viewportRef.current;
    
    viewport.scrollLeft = (contentX * ratio) - mouseX;
    viewport.scrollTop = (contentY * ratio) - mouseY;
    
    zoomData.current = null;
  }, [scale]);

  // Drag-to-Pan Logic
  const handleMouseDown = (e) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setStartX(e.pageX - viewportRef.current.offsetLeft);
    setStartY(e.pageY - viewportRef.current.offsetTop);
    setScrollLeft(viewportRef.current.scrollLeft);
    setScrollTop(viewportRef.current.scrollTop);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - viewportRef.current.offsetLeft;
    const y = e.pageY - viewportRef.current.offsetTop;
    const walkX = (x - startX) * 1.5;
    const walkY = (y - startY) * 1.5;
    viewportRef.current.scrollLeft = scrollLeft - walkX;
    viewportRef.current.scrollTop = scrollTop - walkY;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const isTextFile = (ext) => {
    return ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'html', 'css', 'json', 'yml', 'yaml', 'sql', 'sh', 'bash', 'env', 'config'].includes(ext);
  };

  const handleDownload = async () => {
    const transferId = crypto.randomUUID();
    const signal = addTransfer({ id: transferId, name, progress: 0, type: 'download', status: 'active' });
    try {
      const buffer = await api.downloadFile(file, (p) => updateTransfer(transferId, { progress: p }), signal, transferId);
      if (signal.aborted) return;

      if (window.electron) {
        const savePath = await window.electron.saveFile(name);
        if (savePath) {
          await window.electron.writeFile(savePath, new Uint8Array(buffer));
        }
      } else {
        const blob = new Blob([buffer], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
      }
      updateTransfer(transferId, { status: 'done', progress: 1 });
    } catch (e) {
      if (e.name !== 'AbortError') {
        updateTransfer(transferId, { status: 'error', error: e.message });
      }
    }
  };

  return (
    <div className={`${styles.overlay} ${isFull ? styles.isFull : ''}`} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
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

        <div 
          className={styles.viewport} 
          ref={viewportRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
        >
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
            <div 
              className={styles.content}
              style={{ 
                width: `${100 * scale}%`, 
                height: `${100 * scale}%`,
                transition: 'none' // Matikan transisi agar zoom instan dan tidak bergoyang
              }}
            >
              {content?.type === 'image' && (
                <img 
                  src={content.url} 
                  alt={name} 
                  className={styles.image} 
                  draggable={false}
                  onDragStart={e => e.preventDefault()}
                />
              )}
              {content?.type === 'video' && (
                <video src={content.url} controls autoPlay className={styles.video} />
              )}
              {content?.type === 'audio' && (
                <div className={styles.audioWrapper}>
                  <div className={styles.audioIcon}>🎵</div>
                  <audio src={content.url} controls autoPlay className={styles.audio} />
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
                    customStyle={{
                      margin: 0,
                      padding: '20px',
                      background: 'transparent',
                      fontSize: '13px',
                      lineHeight: '1.6'
                    }}
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
      </div>
    </div>
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
