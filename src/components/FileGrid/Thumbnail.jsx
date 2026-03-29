import { useState, useEffect } from 'react';
import { useApp } from '@/AppContext.jsx';
import { getMimeType } from '@/utils/disbox.js';
import { ipc } from '@/utils/ipc';

// ─── Thumbnail Queue — serial (1 per 1) ─────────────────────────────────────
const thumbQueue = [];
let thumbRunning = false;

function enqueueThumb(id, task) {
  return new Promise((resolve, reject) => {
    thumbQueue.push({ id, task, resolve, reject });
    processThumbQueue();
  });
}

function processThumbQueue() {
  if (thumbRunning || thumbQueue.length === 0) return;
  const { task, resolve, reject } = thumbQueue.shift();
  thumbRunning = true;
  task()
    .then(resolve)
    .catch(reject)
    .finally(() => {
      thumbRunning = false;
      processThumbQueue();
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function compressImageBlob(blob) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const MAX = 256;
      let w = img.width, h = img.height;
      if (w > h) { if (w > MAX) { h = Math.floor(h * MAX / w); w = MAX; } }
      else       { if (h > MAX) { w = Math.floor(w * MAX / h); h = MAX; } }
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(resolve, 'image/webp', 0.7);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function captureFrameFromBlob(blob) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    const url = URL.createObjectURL(blob);
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.src = '';
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const capture = () => {
      if (!video.videoWidth || !video.videoHeight) {
        done(null);
        return;
      }
      try {
        const MAX = 256;
        let w = video.videoWidth, h = video.videoHeight;
        if (w > h) { if (w > MAX) { h = Math.floor(h * MAX / w); w = MAX; } }
        else       { if (h > MAX) { w = Math.floor(w * MAX / h); h = MAX; } }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(done, 'image/webp', 0.7);
      } catch (e) {
        done(null);
      }
    };

    const timer = setTimeout(() => done(null), 8000);

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 2) / 2);
    };
    video.onseeked     = () => capture();
    video.onloadeddata = () => { if (!settled && video.readyState >= 2) capture(); };
    video.oncanplay    = () => { if (!settled) capture(); };
    video.onerror      = () => done(null);

    video.src = url;
    video.load();
  });
}

function captureAudioArtworkFromBlob(blob) {
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
            compressImageBlob(imgBlob).then(resolve);
          }).catch(() => resolve(null));
        } else resolve(null);
      },
      onError: () => resolve(null)
    });
  });
}

export default function FileThumbnail({ file, size = 32 }) {
  const { api, showPreviews, showImagePreviews, showVideoPreviews, showAudioPreviews, addTransfer, updateTransfer, removeTransfer } = useApp();
  const [thumbUrl, setThumbUrl] = useState(null);
  const [loading, setLoading] = useState(false);

  const name = file.path.split('/').pop();
  const ext  = name.split('.').pop().toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi'].includes(ext);
  const isAudio = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(ext);

  useEffect(() => {
    const canShowImage = showPreviews && showImagePreviews && isImage;
    const canShowVideo = showPreviews && showVideoPreviews && isVideo;
    const canShowAudio = showPreviews && showAudioPreviews && isAudio;

    if (!canShowImage && !canShowVideo && !canShowAudio) {
      if (thumbUrl) { URL.revokeObjectURL(thumbUrl); setThumbUrl(null); }
      return;
    }

    let isMounted  = true;
    let objectUrl  = null;
    const transferId = `thumb-${file.id}`;

    const loadThumb = async () => {
      setLoading(true);
      try {
        await enqueueThumb(transferId, async () => {
          if (!isMounted) return;

          const signal = addTransfer({
            id: transferId, name: `Thumbnail: ${name}`,
            progress: 0, type: 'download', status: 'active', hidden: true
          });

          let buffer;

          if (isVideo || isAudio) {
            buffer = await api.downloadFirstChunk(file, signal, transferId);
          } else {
            buffer = await api.downloadFile(
              file,
              (p) => updateTransfer(transferId, { progress: p }),
              signal,
              transferId
            );
          }

          if (!isMounted || signal.aborted) return;

          const mime = getMimeType(name);
          const blob = new Blob([buffer], { type: mime });

          let compressedBlob = null;

          if (isVideo) {
            compressedBlob = await captureFrameFromBlob(blob);
          } else if (isAudio) {
            compressedBlob = await captureAudioArtworkFromBlob(blob);
          } else {
            compressedBlob = await compressImageBlob(blob);
          }

          if (compressedBlob && isMounted) {
            objectUrl = URL.createObjectURL(compressedBlob);
            setThumbUrl(objectUrl);
          }

          updateTransfer(transferId, { status: 'done', progress: 1 });
          setTimeout(() => removeTransfer(transferId), 500);
        });
      } catch (e) {
        if (isMounted) console.warn('[thumb] Failed:', name, e.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadThumb();

    return () => {
      isMounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      ipc?.cancelUpload?.(transferId);
      removeTransfer(transferId);
      const idx = thumbQueue.findIndex(q => q.id === transferId);
      if (idx >= 0) thumbQueue.splice(idx, 1);
    };
  }, [file.id, showPreviews, showImagePreviews, showVideoPreviews, showAudioPreviews, isImage, isVideo, isAudio]);

  const canShowImage = showPreviews && showImagePreviews && isImage;
  const canShowVideo = showPreviews && showVideoPreviews && isVideo;
  const canShowAudio = showPreviews && showAudioPreviews && isAudio;

  if ((canShowImage || canShowVideo || canShowAudio) && thumbUrl) {
    return (
      <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: 0, display: 'flex', alignItems: canShowAudio ? 'center' : 'flex-start', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
        <img
          src={thumbUrl}
          alt=""
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: canShowAudio ? 'center' : 'top',
            boxShadow: canShowAudio ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
            borderRadius: canShowAudio ? '4px' : '0'
          }}
          draggable={false}
        />
      </div>
    );
  }

  if ((canShowImage || canShowVideo || canShowAudio) && loading) {
    return <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 0 }} />;
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={size} height={size} style={{ opacity: 0.5 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
    </span>
  );
}
