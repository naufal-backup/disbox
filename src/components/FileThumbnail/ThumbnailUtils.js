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
export function captureFrameFromBlob(blob) {
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

    setTimeout(() => done(null), 8000);
    video.onloadedmetadata = () => { video.currentTime = Math.min(1, (video.duration || 2) / 2); };
    video.onseeked     = () => capture();
    video.onloadeddata = () => { if (!settled && video.readyState >= 2) capture(); };
    video.oncanplay    = () => { if (!settled) capture(); };
    video.onerror      = () => done(null);
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
