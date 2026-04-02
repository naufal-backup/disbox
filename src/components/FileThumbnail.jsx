import { useState, useEffect, useRef } from 'react';
import { Folder } from 'lucide-react';
import { useApp } from '../context/useAppHook.js';
import { getMimeType } from '../utils/disbox.js';
import { enqueueThumb, cancelThumb, getCachedThumb, isThumbCached } from '../utils/thumbnailCache.js';
import { compressImageBlob, captureFrameFromBlob, captureAudioArtworkFromBlob } from './FileThumbnail/ThumbnailUtils.js';
import { visibilityMap, getObserver } from './FileThumbnail/VisibilityObserver.js';

export default function FileThumbnail({ file, size = 32 }) {
  const {
    api,
    showPreviews, showImagePreviews, showVideoPreviews, showAudioPreviews,
    addTransfer, updateTransfer, removeTransfer
  } = useApp();

  const name   = file.path.split('/').pop();
  const ext    = name.split('.').pop().toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi', 'flv', 'wmv', 'm4v', '3gp', 'ts', 'mts', 'm2ts'].includes(ext);
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
        id: transferId,
        name: `Thumbnail: ${name}`,
        progress: 0,
        type: 'download',
        status: 'active',
        hidden: true,
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
          buffer = await api.downloadFile(file, (p) => updateTransfer(transferId, { progress: p }), combinedAbort.signal, transferId);
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
  }, [file.id, shouldLoad, api, addTransfer, updateTransfer, removeTransfer, name, isVideo, isAudio]);

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
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          draggable={false}
        />
      ) : shouldLoad && isLoading ? (
        <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 0 }} />
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
          <Folder size={size} style={{ opacity: 0.5 }} />
        </span>
      )}
    </div>
  );
}
