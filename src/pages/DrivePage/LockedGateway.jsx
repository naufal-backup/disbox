import { useState, useEffect } from 'react';
import { Lock, Shield } from 'lucide-react';
import { useApp } from '../../context/useAppHook.js';

export default function LockedGateway({ onVerified }) {
  const { verifyPin, hasPin, t } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinExists, setPinExists] = useState(true);

  useEffect(() => { hasPin().then(setPinExists); }, [hasPin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await verifyPin(pin);
    if (ok) {
      onVerified();
    } else {
      setError(t('pin_error_wrong'));
      setPin('');
    }
    setLoading(false);
  };

  if (!pinExists) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20 }}>
        <div style={{
          background: 'var(--bg-elevated)', padding: 24, borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)', textAlign: 'center', maxWidth: 400
        }}>
          <Lock size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>{t('pin_not_set')}</h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
            {t('pin_not_set_desc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20 }}>
      <div style={{
        background: 'var(--bg-elevated)', padding: 32, borderRadius: 16,
        border: '1px solid var(--border-bright)', textAlign: 'center',
        width: '100%', maxWidth: 360, boxShadow: 'var(--shadow-lg)'
      }}>
        <Shield size={48} style={{ color: 'var(--accent)', marginBottom: 16 }} />
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>{t('locked_area')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>{t('locked_area_desc')}</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="disbox_gateway_pin"
            autoComplete="off"
            value={pin}
            onChange={e => setPin(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-input)',
              borderRadius: 12,
              padding: 16,
              color: 'var(--text-primary)',
              textAlign: 'center',
              fontSize: 24,
              letterSpacing: '0.4em',
              marginBottom: 12,
              outline: 'none',
              WebkitTextSecurity: 'disc'
            }}
            placeholder={t('pin_placeholder')}
          />
          {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>{error}</p>}
          <button
            type="submit"
            disabled={loading || !pin}
            style={{
              width: '100%', padding: 14, background: 'var(--accent)', border: 'none',
              borderRadius: 12, color: 'var(--text-on-accent)', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', transition: 'all 0.2s',
            }}
          >
            {loading ? t('verifying') : t('unlock_access')}
          </button>
        </form>
      </div>
    </div>
  );
}
