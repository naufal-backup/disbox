/**
 * Thumbnail.jsx
 *
 * Aligned with disbox-web thumbnail system:
 * - Persistent cache (survives folder navigation)
 * - Concurrency control (3 parallel)
 * - Intersection Observer (priority load)
 */

import { useState, useEffect, useRef } from 'react';
import { useApp } from '@/AppContext.jsx';
import { getMimeType } from '@/utils/disbox.js';
import { ipc } from '@/utils/ipc';
import { enqueueThumb, cancelThumb, getCachedThumb, isThumbCached } from '@/utils/thumbnailCache.js';

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
      if (!video.videoWidth || !video.videoHeight) { done(null); return; }
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
      } catch (e) { done(null); }
    };

    const timer = setTimeout(() => done(null), 8000);
    video.onloadedmetadata = () => { video.currentTime = Math.min(1, (video.duration || 2) / 2); };
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

// ─── Global Intersection Observer ────────────────────────────────────────────
const visibilityMap = new Map();
let sharedObserver = null;

function getObserver() {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          const id = e.target.dataset.thumbId;
          if (id) visibilityMap.set(id, e.isIntersecting);
        });
      },
      { rootMargin: '200px' }
    );
  }
  return sharedObserver;
}

export default function FileThumbnail({ file, size = 32 }) {
  const {
    api, showPreviews, showImagePreviews, showVideoPreviews, showAudioPreviews,
    addTransfer, updateTransfer, removeTransfer
  } = useApp();

  const name   = file.path.split('/').pop();
  const ext    = name.split('.').pop().toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi'].includes(ext);
  const isAudio = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(ext);

  const canShowImage = showPreviews && showImagePreviews && isImage;
  const canShowVideo = showPreviews && showVideoPreviews && isVideo;
  const canShowAudio = showPreviews && showAudioPreviews && isAudio;
  const shouldLoad   = canShowImage || canShowVideo || canShowAudio;

  const [thumbUrl, setThumbUrl]   = useState(() => shouldLoad ? getCachedThumb(file.id) : null);
  const [isLoading, setIsLoading] = useState(() => shouldLoad && !isThumbCached(file.id));

  const containerRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (!shouldLoad || !containerRef.current) return;
    const el = containerRef.current;
    el.dataset.thumbId = file.id;
    const obs = getObserver();
    obs.observe(el);
    return () => obs.unobserve(el);
  }, [file.id, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) {
      setThumbUrl(null);
      setIsLoading(false);
      return;
    }

    if (isThumbCached(file.id)) {
      setThumbUrl(getCachedThumb(file.id));
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const priority = visibilityMap.get(file.id) === false ? 100 : 0;
    const transferId = `thumb-${file.id}`;

    const task = async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const { signal } = ctrl;

      const transferSignal = addTransfer({
        id: transferId, name: `Thumbnail: ${name}`,
        progress: 0, type: 'download', status: 'active', hidden: true
      });

      const combinedAbort = new AbortController();
      const onAbort = () => combinedAbort.abort();
      signal.addEventListener('abort', onAbort);
      transferSignal?.addEventListener?.('abort', onAbort);

      try {
        let buffer;
        if (isVideo || isAudio) {
          buffer = await api.downloadFirstChunk(file, combinedAbort.signal, transferId);
        } else {
          buffer = await api.downloadFile(
            file,
            (p) => updateTransfer(transferId, { progress: p }),
            combinedAbort.signal,
            transferId
          );
        }

        if (combinedAbort.signal.aborted) return null;

        const mime = getMimeType(name);
        const blob = new Blob([buffer], { type: mime });
        
        let compressed;
        if (isVideo) {
          compressed = await captureFrameFromBlob(blob);
        } else if (isAudio) {
          compressed = await captureAudioArtworkFromBlob(blob);
        } else {
          compressed = await compressImageBlob(blob);
        }

        if (!compressed) return null;

        const objectUrl = URL.createObjectURL(compressed);
        updateTransfer(transferId, { status: 'done', progress: 1 });
        setTimeout(() => removeTransfer(transferId), 500);
        return objectUrl;

      } catch (e) {
        if (!combinedAbort.signal.aborted) {
          console.warn('[thumb] Failed:', name, e.message);
        }
        removeTransfer(transferId);
        return null;
      } finally {
        signal.removeEventListener('abort', onAbort);
        transferSignal?.removeEventListener?.('abort', onAbort);
        abortRef.current = null;
      }
    };

    enqueueThumb(file.id, priority, task)
      .then((url) => {
        if (!isMounted) return;
        setThumbUrl(url);
        setIsLoading(false);
      })
      .catch(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
      abortRef.current?.abort();
      cancelThumb(file.id);
    };
  }, [file.id, shouldLoad]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {shouldLoad && thumbUrl ? (
        <img
          src={thumbUrl}
          alt=""
          style={{
            width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: isAudio ? 'center' : 'top',
            boxShadow: isAudio ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
            borderRadius: isAudio ? '4px' : '0'
          }}
          draggable={false}
        />
      ) : shouldLoad && isLoading ? (
        <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 0 }} />
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={size} height={size} style={{ opacity: 0.5 }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
          </svg>
        </span>
      )}
    </div>
  );
}
