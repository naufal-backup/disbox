// ─── Image compressor ─────────────────────────────────────────────────────────
export function compressImageBlob(blob) {
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

// ─── Video frame capturer ─────────────────────────────────────────────────────
export function captureFrameFromURL(url) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      video.pause();
      video.onerror = null; // Prevent triggering error event when clearing src
      video.src = '';
      video.load();
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      resolve(result);
    };

    const capture = () => {
      if (settled) return;
      if (!video.videoWidth || !video.videoHeight) {
        console.log(`[thumb-utils] Video not ready for capture: ${video.videoWidth}x${video.videoHeight}, state: ${video.readyState}`);
        return;
      }

      console.log(`[thumb-utils] Capturing frame at ${video.currentTime}s, size: ${video.videoWidth}x${video.videoHeight}`);
      // Small delay to ensure frame is rendered after seek
      setTimeout(() => {
        if (settled) return;
        try {
          const MAX = 256;
          let w = video.videoWidth, h = video.videoHeight;
          if (w > h) { if (w > MAX) { h = Math.floor(h * MAX / w); w = MAX; } }
          else       { if (h > MAX) { w = Math.floor(w * MAX / h); h = MAX; } }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, w);
          canvas.height = Math.max(1, h);
          const ctx = canvas.getContext('2d', { alpha: false });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob((b) => {
            console.log(`[thumb-utils] Capture success for ${url.slice(0, 50)}..., blob size: ${b?.size}`);
            done(b);
          }, 'image/webp', 0.8);
        } catch (e) {
          console.error('[thumb-utils] Canvas draw error:', e);
          done(null);
        }
      }, 100);
    };

    const timeout = setTimeout(() => {
      console.warn('[thumb-utils] Capture timeout for:', url.slice(0, 100));
      done(null);
    }, 20000);

    video.onloadedmetadata = () => {
      const seekTime = Math.min(1.0, (video.duration || 2) / 2);
      console.log(`[thumb-utils] Metadata loaded. Duration: ${video.duration}, Seeking to ${seekTime}s`);
      video.currentTime = seekTime; 
    };

    video.onseeked = () => {
      console.log(`[thumb-utils] Seeked to ${video.currentTime}s`);
      capture();
    };

    video.oncanplay = () => {
      console.log(`[thumb-utils] CanPlay event at ${video.currentTime}s`);
      capture();
    };

    video.onerror = () => {
      console.error('[thumb-utils] Video error:', video.error?.message || 'unknown', 'URL:', url.slice(0, 100));
      if (!settled) done(null);
    };

    video.src = url;
    video.load();
  });
}

// ─── Audio artwork extractor ───────────────────────────────────────────────────
export function captureAudioArtworkFromBlob(blob) {
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
        } else {
          resolve(null);
        }
      },
      onError: function(error) {
        console.warn('[jsmediatags] Read error:', error.type, error.info);
        resolve(null);
      }
    });
  });
}
