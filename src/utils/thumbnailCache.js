/**
 * thumbnailCache.js
 * 
 * Global persistent thumbnail system:
 * - Cache: object URLs hidup sepanjang session (tidak perlu download ulang)
 * - Queue: concurrency-limited (3 parallel), prioritas file yang visible di viewport
 * - Auto-cancel: thumbnail di-cancel kalau komponen unmount sebelum selesai
 */

// ─── Persistent cache ─────────────────────────────────────────────────────────
// Key: file.id → object URL (string) | 'error'
const thumbCache = new Map();

// ─── Concurrency-limited queue ────────────────────────────────────────────────
const CONCURRENCY = 3; // 3 parallel downloads
let activeCount = 0;
const queue = []; // { id, priority, task, resolve, reject, cancelled }

function processQueue() {
  while (activeCount < CONCURRENCY && queue.length > 0) {
    // Ambil item dengan priority tertinggi (angka terkecil = prioritas tinggi)
    queue.sort((a, b) => a.priority - b.priority);
    const item = queue.shift();

    if (item.cancelled) continue; // skip yang sudah di-cancel

    activeCount++;
    item.task()
      .then(item.resolve)
      .catch(item.reject)
      .finally(() => {
        activeCount--;
        processQueue();
      });
  }
}

/**
 * Enqueue thumbnail download.
 * @param {string} fileId - unique file ID (used as cache key & cancel key)
 * @param {number} priority - lower = higher priority (0 = visible, 100 = offscreen)
 * @param {Function} task - async function that returns object URL or null
 * @returns {Promise<string|null>}
 */
export function enqueueThumb(fileId, priority, task) {
  // Already cached
  if (thumbCache.has(fileId)) {
    const cached = thumbCache.get(fileId);
    return Promise.resolve(cached === 'error' ? null : cached);
  }

  // Already in queue — update priority if higher
  const existing = queue.find(q => q.id === fileId);
  if (existing) {
    existing.priority = Math.min(existing.priority, priority);
    return new Promise((resolve, reject) => {
      existing.extraCallbacks = existing.extraCallbacks || [];
      existing.extraCallbacks.push({ resolve, reject });
    });
  }

  return new Promise((resolve, reject) => {
    const item = {
      id: fileId,
      priority,
      cancelled: false,
      extraCallbacks: [],
      task: async () => {
        const result = await task();
        if (result) {
          thumbCache.set(fileId, result);
        } else {
          thumbCache.set(fileId, 'error');
        }
        // Resolve semua listeners
        item.extraCallbacks.forEach(cb => cb.resolve(result));
        return result;
      },
      resolve,
      reject,
    };
    queue.push(item);
    processQueue();
  });
}

/**
 * Cancel a pending thumbnail (if not yet started).
 * Does NOT cancel an in-progress download — use AbortController for that.
 */
export function cancelThumb(fileId) {
  const item = queue.find(q => q.id === fileId);
  if (item) item.cancelled = true;
}

/**
 * Get cached thumbnail URL synchronously (null if not cached).
 */
export function getCachedThumb(fileId) {
  const cached = thumbCache.get(fileId);
  return (cached && cached !== 'error') ? cached : null;
}

/**
 * Check if thumbnail is cached (including error state).
 */
export function isThumbCached(fileId) {
  return thumbCache.has(fileId);
}

/**
 * Clear all cached thumbnails and revoke object URLs.
 * Call this on logout/disconnect.
 */
export function clearThumbCache() {
  thumbCache.forEach((url) => {
    if (url && url !== 'error') URL.revokeObjectURL(url);
  });
  thumbCache.clear();
  queue.length = 0;
  activeCount = 0;
}
