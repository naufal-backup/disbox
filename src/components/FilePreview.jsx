import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../context/useAppHook.js';
import { getMimeType, BASE_API } from '../utils/disbox.js';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './FilePreview.module.css';

import { globalPreviewCache, preloadAborts } from './FilePreview/PreviewCache.js';
import FilePreviewHeader from './FilePreview/FilePreviewHeader.jsx';
import FileListPanel from './FilePreview/FileListPanel.jsx';
import FilePreviewContent from './FilePreview/FilePreviewContent.jsx';

export default function FilePreview({ file, allFiles = [], onFileChange, onClose }) {
  const { api, addTransfer, updateTransfer, removeTransfer, animationsEnabled } = useApp();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState(null);
  const [error, setError] = useState('');
  const [isFull, setIsFull] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showFilelist, setShowFilelist] = useState(false);
  const viewportRef = useRef(null);

  const name = file.path.split('/').pop();
  const ext = name.split('.').pop().toLowerCase();
  const mime = getMimeType(name);

  const navigatableFiles = useMemo(() => {
    if (!allFiles.length) return [];
    return allFiles.filter(f => !f.path.endsWith('/.keep') && f.path.split('/').pop() !== '.keep');
  }, [allFiles]);

  const currentIndex = useMemo(() => {
    return navigatableFiles.findIndex(f => f.id === file.id || f.path === file.path);
  }, [navigatableFiles, file]);

  const hasNext = currentIndex < navigatableFiles.length - 1;
  const hasPrev = currentIndex > 0;

  const goToNext = useCallback((e) => {
    e?.stopPropagation();
    if (hasNext && onFileChange) onFileChange(navigatableFiles[currentIndex + 1]);
  }, [hasNext, currentIndex, navigatableFiles, onFileChange]);

  const goToPrevious = useCallback((e) => {
    e?.stopPropagation();
    if (hasPrev && onFileChange) onFileChange(navigatableFiles[currentIndex - 1]);
  }, [hasPrev, currentIndex, navigatableFiles, onFileChange]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrevious, onClose]);

  const downloadFileContent = useCallback(async (targetFile, signal, onProgress) => {
    const targetName = targetFile.path.split('/').pop();
    const targetExt = targetName.split('.').pop().toLowerCase();
    const targetMime = getMimeType(targetName);

    const buffer = await api.downloadFile(targetFile, onProgress, signal);

    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(targetExt);
    const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(targetExt);
    const isAudio = ['mp3', 'wav', 'flac', 'ogg'].includes(targetExt);
    const isPdf = targetExt === 'pdf';
    const isText = ['txt', 'md', 'js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'html', 'css',
                    'json', 'yml', 'yaml', 'sql', 'sh', 'bash', 'xml', 'cpp', 'c', 'java'].includes(targetExt);

    if (isImage || isVideo || isAudio || isPdf) {
      const blob = new Blob([buffer], { type: targetMime });
      const objectUrl = URL.createObjectURL(blob);
      return { type: isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'pdf', url: objectUrl };
    } else if (isText) {
      const text = new TextDecoder().decode(buffer);
      return { type: 'text', text };
    } else {
      return { type: 'unsupported' };
    }
  }, [api]);

  useEffect(() => {
    let isMounted = true;
    const transferId = `preview-${file.id}`;

    const loadContent = async () => {
      if (globalPreviewCache.has(file.id)) {
        setContent(globalPreviewCache.get(file.id));
        setLoading(false);
        setError('');
        return;
      }

      setLoading(true);
      setError('');
      setContent(null);

      try {
        const isVideo = ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'].includes(ext);
        const isAudio = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(ext);

        // For desktop/electron, download file first for audio/video preview
        // Streaming via BASE_API requires server endpoint that may not be available
        const signal = addTransfer({
          id: transferId, name: `Preview: ${name}`,
          progress: 0, type: 'download', status: 'active', hidden: true
        });

        const result = await downloadFileContent(
          file,
          signal,
          (p) => {
            if (isMounted) {
              setDownloadProgress(Math.round(p * 100));
              updateTransfer(transferId, { progress: p });
            }
          }
        );

        if (!isMounted || (signal && signal.aborted)) return;

        globalPreviewCache.set(file.id, result);
        setContent(result);
        updateTransfer(transferId, { status: 'done', progress: 1 });
        setTimeout(() => removeTransfer(transferId), 500);
      } catch (e) {
        if (isMounted) {
          console.error('Preview failed:', e);
          setError('Gagal memuat pratinjau: ' + e.message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadContent();

    return () => {
      isMounted = false;
      if (window.electron?.cancelUpload) window.electron.cancelUpload(transferId);
      removeTransfer(transferId);
    };
  }, [file.id]);

  useEffect(() => {
    const toPreload = [];
    if (hasNext) toPreload.push(navigatableFiles[currentIndex + 1]);
    if (hasPrev) toPreload.push(navigatableFiles[currentIndex - 1]);

    toPreload.forEach(async (targetFile) => {
      if (!targetFile || globalPreviewCache.has(targetFile.id)) return;
      if (preloadAborts.has(targetFile.id)) return;

      const ctrl = new AbortController();
      preloadAborts.set(targetFile.id, ctrl);
      const transferId = `preload-${targetFile.id}`;

      try {
        const signal = addTransfer({
          id: transferId,
          name: `Preload: ${targetFile.path.split('/').pop()}`,
          progress: 0, type: 'download', status: 'active', hidden: true
        });

        const result = await downloadFileContent(targetFile, signal, () => {});
        if (!ctrl.signal.aborted) {
          globalPreviewCache.set(targetFile.id, result);
        }
        updateTransfer(transferId, { status: 'done', progress: 1 });
        setTimeout(() => removeTransfer(transferId), 500);
      } catch (e) {
        if (!ctrl.signal.aborted) {
          console.warn('[preload] Failed:', targetFile.path, e.message);
        }
      } finally {
        preloadAborts.delete(targetFile.id);
        removeTransfer(transferId);
      }
    });
  }, [currentIndex]);

  const handleDownload = useCallback(async () => {
    const fileName = file.path.split('/').pop();
    const transferId = `preview-dl-${file.id}-${Date.now()}`;
    const totalBytes = file.size || 0;
    const CHUNK_SIZE = 7.5 * 1024 * 1024;
    const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE) || 1;
    const signal = addTransfer({
      id: transferId, name: fileName, progress: 0,
      type: 'download', status: 'active', totalBytes, totalChunks, chunk: 0
    });

    try {
      const cached = globalPreviewCache.get(file.id);
      if (cached?.url) {
        // Native fetch is fine for blob: URLs
        const res = await fetch(cached.url);
        const buffer = await res.arrayBuffer();
        const blob = new Blob([buffer], { type: getMimeType(fileName) });
        const url = URL.createObjectURL(blob);
        if (window.electron) {
          const savePath = await window.electron.saveFile(fileName);
          if (savePath) await window.electron.writeFile(savePath, new Uint8Array(buffer));
        } else {
          const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
        }
        URL.revokeObjectURL(url);
        updateTransfer(transferId, { status: 'done', progress: 1 });
        setTimeout(() => removeTransfer(transferId), 1000);
        return;
      }

      const buffer = await api.downloadFile(file, (p) => {
        if (signal && !signal.aborted) {
          const chunk = totalChunks ? Math.min(Math.floor(p * totalChunks), totalChunks - 1) : 0;
          updateTransfer(transferId, { progress: p, chunk });
        }
      }, signal, transferId);

      if (signal && signal.aborted) return;
      const blob = new Blob([buffer], { type: getMimeType(fileName) });
      const url = URL.createObjectURL(blob);
      if (window.electron) {
        const savePath = await window.electron.saveFile(fileName);
        if (savePath) await window.electron.writeFile(savePath, new Uint8Array(buffer));
      } else {
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
      }
      URL.revokeObjectURL(url);
      updateTransfer(transferId, { status: 'done', progress: 1 });
      setTimeout(() => removeTransfer(transferId), 1000);
    } catch (e) {
      if (e.name !== 'AbortError' && signal && !signal.aborted)
        updateTransfer(transferId, { status: 'error', error: e.message });
    }
  }, [file, api, addTransfer, updateTransfer, removeTransfer]);

  const backdropVariants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  const modalVariants = {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
    exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
  };
  const transition = animationsEnabled ? {} : { duration: 0 };

  return (
    <motion.div
      className={`${styles.overlay} ${isFull ? styles.isFull : ''}`}
      onClick={onClose}
      initial="initial" animate="animate" exit="exit"
      variants={backdropVariants} transition={transition}
    >
      <motion.div
        className={styles.modal}
        onClick={e => e.stopPropagation()}
        variants={modalVariants} transition={transition}
      >
        <FilePreviewHeader
          name={name} file={file} mime={mime}
          navigatableFiles={navigatableFiles} currentIndex={currentIndex}
          showFilelist={showFilelist} setShowFilelist={setShowFilelist}
          handleDownload={handleDownload} isFull={isFull} setIsFull={setIsFull}
          onClose={onClose}
        />

        <div className={styles.viewport} ref={viewportRef} style={{ position: 'relative' }}>
          <FileListPanel
            showFilelist={showFilelist} navigatableFiles={navigatableFiles}
            file={file} onFileChange={onFileChange} setShowFilelist={setShowFilelist}
          />

          {hasPrev && (
            <button className={`${styles.navBtn} ${styles.prevBtn}`} onClick={goToPrevious} title="Previous">
              <ChevronLeft size={24} />
            </button>
          )}
          {hasNext && (
            <button className={`${styles.navBtn} ${styles.nextBtn}`} onClick={goToNext} title="Next">
              <ChevronRight size={24} />
            </button>
          )}

          <FilePreviewContent
            loading={loading} downloadProgress={downloadProgress}
            error={error} handleDownload={handleDownload}
            content={content} name={name} ext={ext} file={file}
            navigatableFiles={navigatableFiles} onFileChange={onFileChange}
            onClose={onClose}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}
