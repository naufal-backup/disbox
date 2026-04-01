import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, Copy, Check, X } from 'lucide-react';
import { useApp } from '../context/useAppHook.js';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import styles from './ShareDialog.module.css';

const EXPIRY_OPTIONS = [
  { label: '1 hari', value: 1 },
  { label: '7 hari', value: 7 },
  { label: '30 hari', value: 30 },
  { label: 'Permanent', value: null },
];

export default function ShareDialog({ filePath, fileId, onClose }) {
  const { createShareLink, api, animationsEnabled } = useApp();
  const [expiryDays, setExpiryDays] = useState(7);
  const [permission, setPermission] = useState('download');
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);

  const fileName = filePath.split('/').pop();

  const handleGenerate = async () => {
    setGenerating(true);
    const expiresAt = expiryDays ? Date.now() + expiryDays * 24 * 60 * 60 * 1000 : null;
    const result = await createShareLink(filePath, fileId, permission, expiresAt);
    if (result.ok) {
      setGeneratedLink(result.link);
      toast.success('Link berhasil dibuat');
    } else {
      const msg = result.message || result.reason || 'unknown error';
      toast.error('Gagal membuat link: ' + msg, { duration: 5000 });
    }
    setGenerating(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link disalin');
  };

  const backdropVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const dialogVariants = {
    initial: { opacity: 0, scale: 0.9, y: 20 },
    animate: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 300 }
    },
    exit: { 
      opacity: 0, 
      scale: 0.9, 
      y: 20,
      transition: { duration: 0.2 }
    }
  };

  const transition = animationsEnabled ? {} : { duration: 0 };

  return createPortal(
    <motion.div 
      className={styles.overlay} 
      onClick={onClose}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={backdropVariants}
      transition={transition}
    >
      <motion.div 
        className={styles.dialog} 
        onClick={e => e.stopPropagation()}
        variants={dialogVariants}
        transition={transition}
      >
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <Link2 size={18} style={{ color: 'var(--accent)' }} />
            <h3>Share File</h3>
          </div>
          <button className={styles.closeBtn} onClick={onClose}><X size={16} /></button>
        </div>

        <div className={styles.fileName}>📄 {fileName}</div>

        {!generatedLink ? (
          <>
            <div className={styles.section}>
              <label className={styles.label}>Berlaku selama</label>
              <div className={styles.optionRow}>
                {EXPIRY_OPTIONS.map(opt => (
                  <button
                    key={opt.label}
                    className={`${styles.optionBtn} ${expiryDays === opt.value ? styles.active : ''}`}
                    onClick={() => setExpiryDays(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.section}>
              <label className={styles.label}>Permission</label>
              <div className={styles.optionRow}>
                <button
                  className={`${styles.optionBtn} ${permission === 'view' ? styles.active : ''}`}
                  onClick={() => setPermission('view')}
                >
                  View only
                </button>
                <button
                  className={`${styles.optionBtn} ${permission === 'download' ? styles.active : ''}`}
                  onClick={() => setPermission('download')}
                >
                  Download
                </button>
              </div>
            </div>

            <button
              className={styles.generateBtn}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? 'Membuat link...' : '🔗 Generate Link'}
            </button>
          </>
        ) : (
          <div className={styles.resultSection}>
            <p className={styles.resultLabel}>Link siap dibagikan:</p>
            <div className={styles.linkBox}>
              <span className={styles.linkText}>{generatedLink}</span>
              <button className={styles.copyBtn} onClick={handleCopy}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            <p className={styles.resultHint}>
              Penerima bisa buka link ini di browser tanpa perlu install Disbox.
            </p>
            <button className={styles.doneBtn} onClick={onClose}>Selesai</button>
          </div>
        )}
      </motion.div>
    </motion.div>,
    document.body
  );
}
