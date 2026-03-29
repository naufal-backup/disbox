import { useState, useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import styles from '../DrivePage.module.css';

export const InfoIcon = ({ helpKey, activeHelp, setActiveHelp, t }) => {
  const isOpen = activeHelp === helpKey;
  const triggerRef = useRef(null);
  const [verticalPos, setVerticalPos] = useState('top');
  const [bubbleStyle, setBubbleStyle] = useState({ left: '50%', transform: 'translateX(-50%)', width: 260 });
  const [arrowStyle, setArrowStyle] = useState({ left: '50%' });

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const width = 260; const padding = 20; const halfWidth = width / 2;
      let newLeft = '50%'; let newTransform = 'translateX(-50%)';
      let newArrowLeft = '50%'; let newRight = 'auto'; let newVertical = 'top';
      if (rect.top < 120) newVertical = 'bottom';
      if (rect.left < halfWidth + padding) {
        newLeft = `-${rect.left - padding}px`; newTransform = 'none';
        newArrowLeft = `${rect.left - padding + 10}px`;
      } else if (window.innerWidth - rect.right < halfWidth + padding) {
        newLeft = 'auto'; newRight = `-${window.innerWidth - rect.right - padding}px`;
        newTransform = 'none'; newArrowLeft = `calc(100% - ${window.innerWidth - rect.right - padding + 10}px)`;
      }
      setVerticalPos(newVertical);
      setBubbleStyle({
        left: newLeft, right: newRight, transform: newTransform, width,
        top: newVertical === 'bottom' ? 'calc(100% + 12px)' : 'auto',
        bottom: newVertical === 'top' ? 'calc(100% + 12px)' : 'auto'
      });
      setArrowStyle({ left: newArrowLeft });
    }
  }, [isOpen]);

  return (
    <div className="help-trigger" style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={triggerRef}
        onClick={() => setActiveHelp(isOpen ? null : helpKey)}
        style={{
          background: 'transparent', border: 'none', padding: 4, cursor: 'pointer',
          color: isOpen ? 'var(--accent-bright)' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: '50%', transition: 'all 0.2s', marginLeft: 6
        }}
      >
        <AlertCircle size={14} />
      </button>
      {isOpen && (
        <div style={{
          position: 'absolute', ...bubbleStyle,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
          borderRadius: 14, padding: '12px 16px', boxShadow: 'var(--shadow-lg)',
          zIndex: 1000, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6,
          textAlign: 'left', pointerEvents: 'auto'
        }}>
          {t(helpKey + '_help')}
          {verticalPos === 'top' ? (
            <div style={{
              position: 'absolute', top: '100%', ...arrowStyle, marginLeft: -8,
              borderWidth: 8, borderStyle: 'solid',
              borderColor: 'var(--border-bright) transparent transparent transparent'
            }} />
          ) : (
            <div style={{
              position: 'absolute', bottom: '100%', ...arrowStyle, marginLeft: -8,
              borderWidth: 8, borderStyle: 'solid',
              borderColor: 'transparent transparent var(--border-bright) transparent'
            }} />
          )}
        </div>
      )}
    </div>
  );
};

export const Toggle = ({ label, value, onChange, description, helpKey, activeHelp, setActiveHelp, t }) => (
  <div className={styles.toggleWrapper}>
    <div className={styles.toggleHeader}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <p className={styles.toggleLabel}>{label}</p>
          {helpKey && <InfoIcon helpKey={helpKey} activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />}
        </div>
        <p className={styles.toggleDesc}>{description}</p>
      </div>
      <label className={styles.toggleSwitch}>
        <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className={styles.toggleInput} />
        <span className={styles.toggleSlider}><span className={styles.toggleCircle} /></span>
      </label>
    </div>
  </div>
);
