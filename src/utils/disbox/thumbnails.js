import { ipc } from '@/utils/ipc';

const _bufferToBase64 = (buffer) => {
  return new Promise((resolve) => {
    const blob = new Blob([buffer]);
    const reader = new FileReader();
    reader.onloadend = () => {
      const b64 = reader.result.split(',')[1];
      resolve(b64);
    };
    reader.readAsDataURL(blob);
  });
};

export async function captureVideoThumbnail(videoBlob) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoBlob);
    let settled = false;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.src = '';
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const drawFrame = () => {
      try {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let w = video.videoWidth || 320;
        let h = video.videoHeight || 180;
        if (w > h) { if (w > MAX_SIZE) { h = Math.floor(h * MAX_SIZE / w); w = MAX_SIZE; } }
        else { if (h > MAX_SIZE) { w = Math.floor(w * MAX_SIZE / h); h = MAX_SIZE; } }
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(settle, 'image/webp', 0.75);
      } catch (e) { settle(null); }
    };

    const timer = setTimeout(() => drawFrame(), 8000);
    video.onloadeddata = () => drawFrame();
    video.oncanplay = () => { if (!settled) drawFrame(); };
    video.onerror = () => settle(null);
    video.src = url;
  });
}

export async function captureVideoThumbnailFfmpeg(videoBuffer, ext) {
  if (!ipc?.generateVideoThumbnail) return null;
  try {
    const b64 = await _bufferToBase64(videoBuffer);
    const result = await ipc.generateVideoThumbnail(b64, ext);
    if (!result.ok) {
      console.warn('[ffmpeg] Thumbnail gagal:', result.reason);
      return null;
    }
    const byteStr = atob(result.data);
    const arr = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) arr[i] = byteStr.charCodeAt(i);
    return new Blob([arr], { type: 'image/webp' });
  } catch (e) {
    console.warn('[ffmpeg] captureVideoThumbnailFfmpeg error:', e.message);
    return null;
  }
}
