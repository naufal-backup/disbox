// ─── Global Intersection Observer ────────────────────────────────────────────
export const visibilityMap = new Map(); // fileId → boolean
let sharedObserver = null;

export function getObserver() {
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
