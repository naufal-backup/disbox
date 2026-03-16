// This is a patch for the FileThumbnail component in FileGrid.jsx
// Replace the existing FileThumbnail function with this version.
// Key change: for video files, only download the FIRST chunk to generate thumbnail,
// instead of downloading the entire file. This works because:
// - The first chunk contains enough video data to extract a frame
// - We create a partial Blob with just that chunk data

function FileThumbnail({ file, size = 32 }) {
  const { api, showPreviews, showImagePreviews, showVideoPreviews, addTransfer, updateTransfer, removeTransfer } = useApp();
  const [thumbUrl, setThumbUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const name = file.path.split('/').pop();
  const ext = name.split('.').pop().toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mkv', 'mov', 'avi'].includes(ext);

  useEffect(() => {
    const canShowImage = showPreviews && showImagePreviews && isImage;
    const canShowVideo = showPreviews && showVideoPreviews && isVideo;

    if (!canShowImage && !canShowVideo) {
      if (thumbUrl) {
        URL.revokeObjectURL(thumbUrl);
        setThumbUrl(null);
      }
      return;
    }

    let isMounted = true;
    let objectUrl = null;
    const transferId = `thumb-${file.id}`;

    const compressImage = (blob) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 256; 
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
          } else {
            if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
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
        
        // For partial video blobs (first chunk only), seek to 0 to get first frame
        video.onloadeddata = () => {
          video.currentTime = 0;
        };

        video.onseeked = () => {
          const canvas = document.createElement('canvas');
          const MAX_SIZE = 256;
          let width = video.videoWidth || 320;
          let height = video.videoHeight || 180;
          if (width > height) {
            if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
          } else {
            if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
          }
          canvas.width = Math.max(1, Math.floor(width));
          canvas.height = Math.max(1, Math.floor(height));
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob((resultBlob) => {
            URL.revokeObjectURL(url);
            resolve(resultBlob);
          }, 'image/webp', 0.7);
        };

        video.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };

        // Timeout fallback in case onseeked never fires (partial/truncated chunk)
        const timeout = setTimeout(() => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 320; canvas.height = 180;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, 320, 180);
            canvas.toBlob((resultBlob) => {
              URL.revokeObjectURL(url);
              resolve(resultBlob);
            }, 'image/webp', 0.7);
          } catch (_) {
            URL.revokeObjectURL(url);
            resolve(null);
          }
        }, 4000);

        video.addEventListener('onseeked', () => clearTimeout(timeout), { once: true });

        video.src = url;
      });
    };

    // Download only the first chunk for video thumbnails
    const downloadFirstChunkOnly = async (fileToDownload, signal, transferIdToUse) => {
      const messageIds = fileToDownload.messageIds || [];
      if (messageIds.length === 0) throw new Error('No chunks');
      
      // For images: download all chunks (images are usually 1 chunk anyway)
      if (!isVideo) {
        return await api.downloadFile(fileToDownload, (p) => updateTransfer(transferIdToUse, { progress: p }), signal, transferIdToUse);
      }
      
      // For videos: only download the FIRST chunk to extract a thumbnail frame
      // This avoids downloading potentially large video files just for a thumbnail
      const firstItem = messageIds[0];
      const firstMsgId = typeof firstItem === 'string' ? firstItem : firstItem.msgId;
      
      const msgUrl = `${api.webhookUrl}/messages/${firstMsgId}`;
      const msgRes = await window.electron.fetch(msgUrl, { transferId: transferIdToUse });
      if (!msgRes.ok) throw new Error(`Gagal fetch message: ${msgRes.status}`);
      
      const msg = JSON.parse(msgRes.body);
      const attachmentUrl = msg.attachments?.[0]?.url;
      if (!attachmentUrl) throw new Error('No attachment URL');
      
      const chunkData = await window.electron.proxyDownload(attachmentUrl, transferIdToUse);
      
      // Decrypt the first chunk
      const decryptedChunk = await api.decrypt(chunkData);
      updateTransfer(transferIdToUse, { progress: 1 });
      
      return decryptedChunk;
    };

    const loadThumb = async () => {
      setLoading(true);
      try {
        await enqueueThumb(transferId, async () => {
          if (!isMounted) return;
          const signal = addTransfer({ id: transferId, name: `Thumbnail: ${name}`, progress: 0, type: 'download', status: 'active', hidden: true });
          
          const buffer = await downloadFirstChunkOnly(file, signal, transferId);
          
          if (isMounted && !signal.aborted) {
            const originalBlob = new Blob([buffer], { type: getMimeType(name) });
            let compressedBlob;
            if (isVideo) {
              compressedBlob = await captureVideoFrame(originalBlob);
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
  }, [file.id, showPreviews, showImagePreviews, showVideoPreviews, isImage, isVideo]);

  const canShowImage = showPreviews && showImagePreviews && isImage;
  const canShowVideo = showPreviews && showVideoPreviews && isVideo;

  if (canShowImage || canShowVideo) {
    if (thumbUrl) return <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', flexShrink: 0, position: 'relative' }}>
      <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} draggable={false} />
      {isVideo && <div style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 4px', fontSize: 10, color: 'white', display: 'flex', alignItems: 'center' }}>▶</div>}
    </div>;
    if (loading) return <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 0 }} />;
  }
  
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width={size} height={size} style={{ opacity: 0.5 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
      </svg>
    </span>
  );
}
