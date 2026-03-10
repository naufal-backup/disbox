import { useState, useEffect } from 'react';
import { X, Download, Maximize2, Minimize2, Loader2, AlertCircle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import { useApp } from '../AppContext.jsx';
import { getMimeType, formatSize } from '../utils/disbox.js';
import styles from './FilePreview.module.css';

export default function FilePreview({ file, onClose }) {
  const { api, addTransfer, updateTransfer } = useApp();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState(null); // { type, url, text }
  const [error, setError] = useState('');
  const [isFull, setIsFull] = useState(false);

  const name = file.path.split('/').pop();
  const ext = name.split('.').pop().toLowerCase();
  const mime = getMimeType(name);

  useEffect(() => {
    let objectUrl = null;

    const load = async () => {
      try {
        setLoading(true);
        setError('');

        const buffer = await api.downloadFile(file, (p) => {
          // Progress can be shown inside preview if needed
        });

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
      } catch (e) {
        console.error('Preview failed:', e);
        setError('Gagal memuat pratinjau: ' + e.message);
      } finally {
        setLoading(false);
      }
    };

    load();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const isTextFile = (ext) => {
    return ['txt', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'html', 'css', 'json', 'yml', 'yaml', 'sql', 'sh', 'bash', 'env', 'config'].includes(ext);
  };

  const handleDownload = async () => {
    const transferId = crypto.randomUUID();
    addTransfer({ id: transferId, name, progress: 0, type: 'download', status: 'active' });
    try {
      // Re-use download logic? Actually we already have the buffer if we wanted to,
      // but to keep it simple and consistent with the existing flow:
      const buffer = await api.downloadFile(file, (p) => updateTransfer(transferId, { progress: p }));
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
      updateTransfer(transferId, { status: 'error', error: e.message });
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

        <div className={styles.viewport}>
          {loading ? (
            <div className={styles.state}>
              <Loader2 size={32} className="spin" style={{ color: 'var(--accent)' }} />
              <p>Mendownload dari Discord...</p>
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
                <img src={content.url} alt={name} className={styles.image} />
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
