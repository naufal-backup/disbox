import { useRef, useEffect } from 'react';

export default function useRubberBand(contentRef, { uiScale, selectedFiles, setSelectedFiles, setIsSelectionMode }) {
  const rubberOrigin = useRef(null);
  const isRubbering = useRef(false);
  const rubberBandElRef = useRef(null);
  const itemBoundsCache = useRef([]);
  const lastSelectedIds = useRef(new Set());
  const selectedFilesRef = useRef(selectedFiles);

  useEffect(() => {
    selectedFilesRef.current = selectedFiles;
  }, [selectedFiles]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const rbEl = document.createElement('div');
    rbEl.className = 'rubberBand';
    rbEl.style.position = 'fixed';
    rbEl.style.border = '1.5px solid var(--accent)';
    rbEl.style.background = 'rgba(88, 101, 242, 0.12)';
    rbEl.style.borderRadius = '4px';
    rbEl.style.pointerEvents = 'none';
    rbEl.style.zIndex = '9999';
    rbEl.style.display = 'none';
    document.body.appendChild(rbEl);
    rubberBandElRef.current = rbEl;

    const onMouseDown = (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('[data-item-id]')) return;
      if (e.target.closest('button, input, a, [role="button"]')) return;
      
      const rect = content.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) return;
      
      rubberOrigin.current = { x: e.clientX, y: e.clientY };
      isRubbering.current = false;
      const items = content.querySelectorAll('[data-item-id]');
      itemBoundsCache.current = Array.from(items).map(el => ({ 
        id: el.dataset.itemId, 
        rect: el.getBoundingClientRect() 
      }));
      
      if (!e.ctrlKey) {
        setSelectedFiles(new Set());
        lastSelectedIds.current = new Set();
        setIsSelectionMode(false);
      } else {
        lastSelectedIds.current = new Set(selectedFilesRef.current);
      }

      let rafId = null;
      const onMouseMove = (me) => {
        if (!rubberOrigin.current) return;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          const dx = me.clientX - rubberOrigin.current.x;
          const dy = me.clientY - rubberOrigin.current.y;
          
          if (!isRubbering.current) {
            if (Math.sqrt(dx * dx + dy * dy) < 6) return;
            isRubbering.current = true;
            rbEl.style.display = 'block';
          }
          
          const cr = content.getBoundingClientRect();
          const clampedX2 = Math.max(cr.left, Math.min(me.clientX, cr.right));
          const clampedY2 = Math.max(cr.top, Math.min(me.clientY, cr.bottom));
          
          const rb = {
            x: Math.min(rubberOrigin.current.x, clampedX2),
            y: Math.min(rubberOrigin.current.y, clampedY2),
            w: Math.abs(clampedX2 - rubberOrigin.current.x),
            h: Math.abs(clampedY2 - rubberOrigin.current.y)
          };
          
          rbEl.style.left = `${rb.x}px`;
          rbEl.style.top = `${rb.y}px`;
          rbEl.style.width = `${rb.w}px`;
          rbEl.style.height = `${rb.h}px`;
          
          const newSelection = new Set(e.ctrlKey ? lastSelectedIds.current : []);
          let changed = false;
          
          itemBoundsCache.current.forEach(item => {
            const er = item.rect;
            const overlaps = rb.x < er.right && rb.x + rb.w > er.left && rb.y < er.bottom && rb.y + rb.h > er.top;
            if (overlaps) {
              if (!newSelection.has(item.id)) {
                newSelection.add(item.id);
                changed = true;
              }
            } else if (!e.ctrlKey) {
              if (newSelection.has(item.id)) {
                newSelection.delete(item.id);
                changed = true;
              }
            }
          });
          
          if (changed) {
            setSelectedFiles(newSelection);
            setIsSelectionMode(newSelection.size > 0);
          }
        });
      };

      const onMouseUp = () => {
        if (rafId) cancelAnimationFrame(rafId);
        isRubbering.current = false;
        rbEl.style.display = 'none';
        rubberOrigin.current = null;
        itemBoundsCache.current = [];
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    content.addEventListener('mousedown', onMouseDown);
    return () => {
      content.removeEventListener('mousedown', onMouseDown);
      if (rbEl.parentNode) rbEl.parentNode.removeChild(rbEl);
    };
  }, [uiScale, setSelectedFiles, setIsSelectionMode, contentRef]);
}
