import { useState, useEffect, useRef } from 'react';
import { X, Download, Maximize2, Minimize2, Loader2, AlertCircle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import vscDarkPlus from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
import { useApp } from '../AppContext.jsx';
import { getMimeType, formatSize } from '../utils/disbox.js';
import { motion } from 'framer-motion';
import styles from './FilePreview.module.css';

export default function FilePreview({ file, onClose }) {
  const { api, addTransfer, updateTransfer, cancelTransfer, removeTransfer, animationsEnabled } = useApp();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState(null); // { type, url, text }
  const [error, setError] = useState('');
  const [isFull, setIsFull] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const viewportRef = useRef(null);

  const name = file.path.split('/').pop();
  const ext = name.split('.').pop().toLowerCase();
  const mime = getMimeType(name);

  // ... (keep useEffect logic)

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
                  <img src={content.url} alt={name} draggable={false} />
                </div>
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