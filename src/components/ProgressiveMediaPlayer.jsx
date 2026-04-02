import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/useAppHook.js';
import styles from './ProgressiveMediaPlayer.module.css';

export default function ProgressiveMediaPlayer({ file }) {
  const { api, addTransfer, updateTransfer, removeTransfer } = useApp();
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const transferId = `progressive-${file.id}`;
    let isMounted = true;

    const loadProgressive = async () => {
      setLoading(true);
      setError('');
      setProgress(0);

      try {
        const mime = getMimeType(file.path);
        // Download first 10 chunks + last chunk for metadata
        const result = await api.downloadPartialChunks(
          file,
          10,
          undefined,
          (p) => {
            if (isMounted) setProgress(Math.round(p * 100));
          },
          true // includeLast
        );

        if (!isMounted) return;

        const video = videoRef.current;
        if (!video) return;

        // Create blob from partial buffer with correct mime
        const blob = new Blob([result.buffer], { type: mime });
        const url = URL.createObjectURL(blob);
        video.src = url;
        video.load();

        video.onloadedmetadata = () => {
          if (isMounted) {
            setLoading(false);
            video.play().catch(() => {});
            setIsPlaying(true);
          }
        };

        video.onerror = () => {
          if (isMounted) {
            setError('Gagal memutar video');
            setLoading(false);
          }
        };

        // Continue downloading remaining chunks in background (caching)
        if (!result.isComplete) {
          downloadRemainingChunks(file, result.downloadedChunks, (p) => {
            if (isMounted) setProgress(Math.round(p * 100));
          });
        }
      } catch (e) {
        if (isMounted) {
          console.error('Progressive load failed:', e);
          setError('Gagal memuat: ' + e.message);
          setLoading(false);
        }
      }
    };

    const downloadRemainingChunks = async (file, startIdx, onProgress) => {
      const totalChunks = file.messageIds.length;
      let downloaded = startIdx;

      for (let i = startIdx; i < totalChunks; i++) {
        if (!isMounted) break;
        try {
          const msgId = typeof file.messageIds[i] === 'string'
            ? file.messageIds[i]
            : file.messageIds[i].msgId;

          const res = await window.electron.fetch(`${api.webhookUrl}/messages/${msgId}`);
          if (!res.ok) continue;

          const msg = JSON.parse(res.body);
          const url = msg.attachments?.[0]?.url;
          const bytes = await window.electron.proxyDownload(url);
          const decrypted = await api.decrypt(bytes);
          downloaded++;
          if (onProgress) onProgress((downloaded / totalChunks) * 100);
        } catch (e) {
          console.warn('Failed to download chunk', i, e);
        }
      }
    };

    loadProgressive();

    return () => {
      isMounted = false;
      if (videoRef.current) {
        const oldSrc = videoRef.current.src;
        if (oldSrc && oldSrc.startsWith('blob:')) {
          URL.revokeObjectURL(oldSrc);
        }
        videoRef.current.src = '';
      }
      removeTransfer(`progressive-${file.id}`);
    };
  }, [file, api, removeTransfer]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) video.pause();
    else video.play();
    setIsPlaying(!isPlaying);
  };

  return (
    <div className={styles.container}>
      <video
        ref={videoRef}
        className={styles.mediaElement}
        controls={false}
        onClick={togglePlay}
      />

      {loading && (
        <div className={styles.loader}>
          <div className={styles.progressText}>Memuat pratinjau... {progress}%</div>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}
