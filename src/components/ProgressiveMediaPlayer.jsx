import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/useAppHook.js';
import styles from './ProgressiveMediaPlayer.module.css';

export default function ProgressiveMediaPlayer({ file, type }) {
  const { api, addTransfer, updateTransfer, removeTransfer } = useApp();
  const mediaRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);

  const mimeMap = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    mov: 'video/quicktime',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    ogg_audio: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac'
  };

  const getMimeType = useCallback((fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    return mimeMap[ext] || (type === 'video' ? 'video/mp4' : 'audio/mpeg');
  }, [type]);

  useEffect(() => {
    const fileName = file.path.split('/').pop();
    const transferId = `progressive-${file.id}`;
    let isMounted = true;

    const loadProgressive = async () => {
      setLoading(true);
      setError('');
      setProgress(0);

      try {
        // Download initial chunks
        const initialChunks = type === 'video' ? 5 : 3;
        const result = await api.downloadPartialChunks(
          file,
          initialChunks,
          undefined,
          (p) => {
            if (isMounted) setProgress(Math.round(p * 100));
          }
        );

        if (!isMounted) return;

        const mediaElement = mediaRef.current;
        if (!mediaElement) return;

        // Create blob from partial buffer
        const blob = new Blob([result.buffer], { type: getMimeType(fileName) });
        const url = URL.createObjectURL(blob);
        mediaElement.src = url;
        mediaElement.load();

        mediaElement.onloadedmetadata = () => {
          if (isMounted) {
            setLoading(false);
            mediaElement.play().catch(() => {});
            setIsPlaying(true);
          }
        };

        mediaElement.onerror = () => {
          if (isMounted) {
            setError('Gagal memutar ' + type);
            setLoading(false);
          }
        };

        // Continue downloading remaining chunks in background to cache
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
      if (mediaRef.current) {
        const oldSrc = mediaRef.current.src;
        if (oldSrc && oldSrc.startsWith('blob:')) {
          URL.revokeObjectURL(oldSrc);
        }
        mediaRef.current.src = '';
      }
      removeTransfer(`progressive-${file.id}`);
    };
  }, [file, api, type, getMimeType, removeTransfer]);

  const togglePlay = () => {
    const el = mediaRef.current;
    if (!el) return;
    if (isPlaying) el.pause();
    else el.play();
    setIsPlaying(!isPlaying);
  };

  return (
    <div className={styles.container}>
      {type === 'video' ? (
        <video
          ref={mediaRef}
          className={styles.mediaElement}
          controls={false}
          onClick={togglePlay}
        />
      ) : (
        <div className={styles.audioWrapper} onClick={togglePlay}>
          <audio ref={mediaRef} />
          <div className={styles.audioPlayButton}>
            {isPlaying ? '⏸' : '▶'}
          </div>
          <div className={styles.audioInfo}>
            <span className={styles.fileName}>{file.path.split('/').pop()}</span>
          </div>
        </div>
      )}

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
