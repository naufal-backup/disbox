import { useState } from 'react';
import { Shield } from 'lucide-react';
import { useApp } from '../../context/useAppHook.js';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import styles from '../DrivePage.module.css';

export default function PinSettingsModal({ mode, onClose }) {
  const { setPin, verifyPin, removePin, t, hasPin } = useApp();
  const [step, setStep] = useState(mode === 'set' ? 'new' : 'verify');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const backdropVariants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  const modalVariants = {
    initial: { opacity: 0, scale: 0.9, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
    exit: { opacity: 0, scale: 0.9, y: 20, transition: { duration: 0.2 } }
  };

  const handleVerify = async (e) => {
    e.preventDefault(); setLoading(true);
    if (await verifyPin(currentPin)) {
      if (mode === 'remove') {
        await removePin(currentPin);
        toast.success(t('pin_remove_success'));
        onClose();
      } else {
        setStep('new'); setCurrentPin(''); setError('');
      }
    } else {
      setError(t('pin_error_wrong'));
    }
    setLoading(false);
  };

  const handleSetNew = async (e) => {
    e.preventDefault();
    if (newPin.length < 4) { setError(t('pin_error_min_length')); return; }
    if (newPin !== confirmPin) { setError(t('pin_error_mismatch')); return; }
    setLoading(true);
    if (await setPin(newPin)) {
      toast.success(mode === 'set' ? t('pin_set_success') : t('pin_change_success'));
      onClose();
    } else {
      setError(t('pin_error_save'));
    }
    setLoading(false);
  };

  const title = mode === 'set' ? t('set_pin') : mode === 'change' ? t('change_pin') : t('remove_pin');
  const inputStyle = {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1px solid var(--border-input)',
    borderRadius: 8, padding: 12,
    color: 'var(--text-primary)',
    textAlign: 'center', fontSize: 18, letterSpacing: '0.2em',
    outline: 'none', transition: 'border-color 0.2s',
  };

  return (
    <motion.div
      className={styles.pinModalOverlay}
      onClick={onClose}
      initial="initial" animate="animate" exit="exit"
      variants={backdropVariants}
    >
      <motion.div className={styles.pinModalContent} onClick={e => e.stopPropagation()} variants={modalVariants}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Shield size={32} style={{ color: 'var(--accent)', marginBottom: 12 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {step === 'verify' ? t('pin_verify_desc') : t('pin_new_desc')}
          </p>
        </div>
        <form onSubmit={step === 'verify' ? handleVerify : handleSetNew}>
          {step === 'verify' ? (
            <PasswordInput
              placeholder={t('pin_current_placeholder')}
              value={currentPin} onChange={e => setCurrentPin(e.target.value)}
              autoFocus style={{ ...inputStyle, marginBottom: 12 }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              <PasswordInput
                placeholder={t('app_lock_placeholder')}
                value={newPin} onChange={e => setNewPin(e.target.value)}
                autoFocus style={inputStyle}
              />
              <PasswordInput
                placeholder={t('pin_confirm_placeholder')}
                value={confirmPin} onChange={e => setConfirmPin(e.target.value)}
                style={inputStyle}
              />
            </div>
          )}
          {error && <p style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center', marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button" onClick={onClose}
              style={{
                flex: 1, padding: 10, background: 'transparent',
                border: '1px solid var(--border)', borderRadius: 8,
                color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              {t('cancel')}
            </button>
            <button
              type="submit" disabled={loading}
              style={{
                flex: 1, padding: 10, background: 'var(--accent)', border: 'none',
                borderRadius: 8, color: 'var(--text-on-accent)', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              {loading ? t('verifying') : t('next')}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
