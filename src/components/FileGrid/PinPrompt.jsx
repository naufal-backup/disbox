import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Lock } from 'lucide-react';
import { useApp } from '@/AppContext.jsx';
import styles from './FileGrid.module.css';

export default function PinPromptModal({ title, onSuccess, onClose }) {
  const { verifyPin, hasPin } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [exists, setExists] = useState(true);

  useEffect(() => {
    hasPin().then(setExists);
  }, [hasPin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!exists) {
      setError('PIN belum diset. Silakan set PIN di Settings.');
      return;
    }
    setChecking(true);
    setError('');
    const ok = await verifyPin(pin);
    if (ok) {
      onSuccess();
      onClose();
    } else {
      setError('PIN salah');
      setPin('');
    }
    setChecking(false);
  };

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.pinModal} onClick={e => e.stopPropagation()}>
        <div className={styles.pinHeader}>
          <Lock size={20} style={{ color: 'var(--accent-bright)' }} />
          <h3>{title}</h3>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Masukkan PIN"
            value={pin}
            onChange={e => setPin(e.target.value)}
            autoFocus
            className={styles.pinInput}
          />
          {error && <p className={styles.pinError}>{error}</p>}
          <div className={styles.pinActions}>
            <button type="button" onClick={onClose} className={styles.cancelBtn}>Batal</button>
            <button type="submit" disabled={checking || !pin} className={styles.confirmBtn}>
              {checking ? 'Memverifikasi...' : 'Buka Kunci'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
