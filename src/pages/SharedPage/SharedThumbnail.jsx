import { useState, useEffect } from 'react';
import { useApp } from '../../context/useAppHook.js';
import { getFileIcon, getMimeType } from '../../utils/disbox.js';
import styles from '../SharedPage.module.css';

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

export default function SharedThumbnail({ file, size = 32 }) {
  const { api, showPreviews, showImagePreviews, showVideoPreviews, showAudioPreviews, addTransfer, updateTransfer, removeTransfer } = useApp();
  const [thumbUrl, setThumbUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const name = file.path?.split('/').pop() || '';
  const ext = name.split('.').pop().toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi'].includes(ext);
  const isAudio = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(ext);

  useEffect(() => {
    const canShowImage = showPreviews && showImagePreviews && isImage;
    const canShowVideo = showPreviews && showVideoPreviews && isVideo;
    const canShowAudio = showPreviews && showAudioPreviews && isAudio;

    if (!canShowImage && !canShowVideo && !canShowAudio) {
      if (thumbUrl) {
        URL.revokeObjectURL(thumbUrl);
        setThumbUrl(null);
      }
      return;
    }

    let isMounted = true;
    let objectUrl = null;
    const transferId = `shared-thumb-${file.id}`;

    const compressImage = (blob) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 256; 
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((resultBlob) => resolve(resultBlob), 'image/webp', 0.7);
        };
        img.src = URL.createObjectURL(blob);
      });
    };

    const captureVideoFrame = (blob) => {
      return new Promise((resolve) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        const url = URL.createObjectURL(blob);
        
        video.onloadedmetadata = () => {
          video.currentTime = Math.min(1, video.duration / 2);
        };

        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 256;
          let width = video.videoWidth;
          let height = video.videoHeight;
          if (width > height) {
            if (width > MAX_SIZE) {
              height *= MAX_SIZE / width;
              width = MAX_SIZE;
            }
          } else {
            if (height > MAX_SIZE) {
              width *= MAX_SIZE / height;
              height = MAX_SIZE;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, width, height);
          canvas.toBlob((resultBlob) => {
            URL.revokeObjectURL(url);
            resolve(resultBlob);
          }, 'image/webp', 0.7);
        };

        video.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };

        video.src = url;
      });
    };

    const captureAudioArtwork = (blob) => {
      return new Promise((resolve) => {
        if (!window.jsmediatags) { resolve(null); return; }
        window.jsmediatags.read(blob, {
          onSuccess: function(tag) {
            const { tags } = tag;
            if (tags.picture) {
              const { data, format } = tags.picture;
              let base64String = "";
              for (let i = 0; i < data.length; i++) base64String += String.fromCharCode(data[i]);
              const base64 = `data:${format};base64,${window.btoa(base64String)}`;
              fetch(base64).then(res => res.blob()).then(imgBlob => {
                compressImage(imgBlob).then(resolve);
              }).catch(() => resolve(null));
            } else resolve(null);
          },
          onError: () => resolve(null)
        });
      });
    };

const loadThumb = async () => {
  setLoading(true);
  try {
    await enqueueThumb(transferId, async () => {
      if (!isMounted) return;
      const signal = addTransfer({ id: transferId, name: `Thumbnail: ${name}`, progress: 0, type: 'download', status: 'active', hidden: true });

      const isLargeMedia = (isVideo || isAudio) && Number(file.size) > 5 * 1024 * 1024;
      
      let buffer;
      if (isLargeMedia) {
        buffer = await api.downloadFirstChunk(file, signal, transferId);
      } else {
        buffer = await api.downloadFile(file, (p) => updateTransfer(transferId, { progress: p }), signal, transferId);
      }

      if (isMounted && !signal.aborted) {
        const originalBlob = new Blob([buffer], { type: getMimeType(name) });
        let compressedBlob;

        if (isVideo) {
          compressedBlob = await captureVideoFrame(originalBlob);
        } else if (isAudio) {
          compressedBlob = await captureAudioArtwork(originalBlob);
        } else {
          compressedBlob = await compressImage(originalBlob);
        }

        if (compressedBlob && isMounted) {
          objectUrl = URL.createObjectURL(compressedBlob);
          setThumbUrl(objectUrl);
        }
        updateTransfer(transferId, { status: 'done', progress: 1 });
        setTimeout(() => removeTransfer(transferId), 500);
      }
    });
  } catch (e) {
    if (isMounted) console.error('Thumb failed:', e);
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
  }, [file.id, showPreviews, showImagePreviews, showVideoPreviews, showAudioPreviews, isImage, isVideo, isAudio]);

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
