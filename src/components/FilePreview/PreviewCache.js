// ─── Persistent global cache (survives component unmount) ─────────────────────
// Key: file.id → value: { type, url, text }
// Object URLs are kept alive intentionally for the session.
export const globalPreviewCache = new Map();

// ─── Preload queue ────────────────────────────────────────────────────────────
export const preloadAborts = new Map(); // fileId → AbortController

export function cancelPreload(fileId) {
  const ctrl = preloadAborts.get(fileId);
  if (ctrl) { ctrl.abort(); preloadAborts.delete(fileId); }
}
