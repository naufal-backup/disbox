import Sidebar from '../components/Sidebar.jsx';
import FileGrid from '../components/FileGrid.jsx';
import TransferPanel from '../components/TransferPanel.jsx';
import { useApp } from '../AppContext.jsx';
import { CheckCircle, Cloud, Clock, AlertCircle, RefreshCw, Lock, Shield, Key, Unlock } from 'lucide-react';
import styles from './DrivePage.module.css';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export default function DrivePage({ activePage, onNavigate }) {
  const { isVerified, setIsVerified, hasPin, setCurrentPath } = useApp();
  const [checkingPin, setCheckingPin] = useState(false);

  // Reset verification and path when switching tabs
  const handleNavigate = (page) => {
    if (page !== activePage) {
      setCurrentPath('/'); // Reset path to root on tab change
    }
    
    if (activePage === 'locked' && page !== 'locked') {
      setIsVerified(false);
    }
    onNavigate(page);
  };

  return (
    <div className={styles.layout}>
      <Sidebar activePage={activePage} onNavigate={handleNavigate} />
      <main className={styles.main}>
        {activePage === 'drive' && <FileGrid onNavigate={onNavigate} />}
        {activePage === 'locked' && (
          isVerified ? (
            <FileGrid isLockedView={true} onNavigate={onNavigate} />
          ) : (
            <LockedGateway onVerified={() => setIsVerified(true)} />
          )
        )}
        {activePage === 'recent' && <FileGrid isRecentView={true} onNavigate={onNavigate} />}
        {activePage === 'starred' && <FileGrid isStarredView={true} onNavigate={onNavigate} />}
        {activePage === 'settings' && <SettingsPanel />}
      </main>
      <TransferPanel />
    </div>
  );
}

function Placeholder({ label, icon }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)' }}>
      <span style={{ fontSize: 48 }}>{icon}</span>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 12 }}>Coming soon</p>
    </div>
  );
}

function LockedGateway({ onVerified }) {
  const { verifyPin, hasPin } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinExists, setPinExists] = useState(true);

  useEffect(() => {
    hasPin().then(setPinExists);
  }, [hasPin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await verifyPin(pin);
    if (ok) {
      onVerified();
    } else {
      setError('PIN salah');
      setPin('');
    }
    setLoading(false);
  };

  if (!pinExists) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20 }}>
        <div style={{ background: 'var(--bg-elevated)', padding: 24, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', textAlign: 'center', maxWidth: 400 }}>
          <Lock size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>PIN Belum Diset</h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
            Anda belum mengatur Master PIN. Silakan buat PIN terlebih dahulu di menu Settings untuk menggunakan fitur folder terkunci.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', padding: 32, borderRadius: 16, border: '1px solid var(--border-bright)', textAlign: 'center', width: '100%', maxWidth: 360, boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
        <Shield size={48} style={{ color: 'var(--accent)', marginBottom: 16 }} />
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Area Terkunci</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>Masukkan PIN Anda untuk melihat konten yang dilindungi</p>
        
        <form onSubmit={handleSubmit}>
          <input 
            type="password" 
            placeholder="••••" 
            value={pin}
            onChange={e => setPin(e.target.value)}
            autoFocus
            style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, color: 'white', textAlign: 'center', fontSize: 24, letterSpacing: '0.4em', marginBottom: 12, outline: 'none' }}
          />
          {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>{error}</p>}
          <button 
            type="submit" 
            disabled={loading || !pin}
            style={{ width: '100%', padding: 14, background: 'var(--accent)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            {loading ? 'Verifikasi...' : 'Buka Akses'}
          </button>
        </form>
      </div>
    </div>
  );
}

function SettingsPanel() {
  const { 
    uiScale, setUiScale, chunkSize, setChunkSize, 
    showPreviews, setShowPreviews,
    showRecent,
    closeToTray, startMinimized, updatePrefs,
    hasPin, setPin, removePin, verifyPin
  } = useApp();

  const [pinExists, setPinExists] = useState(false);
  const [showPinModal, setShowPinModal] = useState(null); // 'set', 'change', 'remove'

  useEffect(() => {
    hasPin().then(setPinExists);
  }, [hasPin]);

  const CHUNK_OPTIONS = [
    { label: 'Free (10MB)', value: 10 * 1024 * 1024, desc: 'Batas standar webhook Discord (Free)' },
    { label: 'Nitro (25MB)', value: 25 * 1024 * 1024, desc: 'Batas untuk akun Discord Nitro Basic' },
    { label: 'Nitro Premium (500MB)', value: 500 * 1024 * 1024, desc: 'Batas untuk akun Discord Nitro Premium' }
  ];

  const currentOptionIndex = CHUNK_OPTIONS.findIndex(opt => opt.value === chunkSize);
  const safeIndex = currentOptionIndex === -1 ? 1 : currentOptionIndex; // Default ke 25MB jika tidak cocok

  const Toggle = ({ label, value, onChange, description }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</p>
      </div>
      <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
        <input 
          type="checkbox" 
          checked={value} 
          onChange={e => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0 }}
        />
        <span style={{
          position: 'absolute', cursor: 'pointer', inset: 0,
          backgroundColor: value ? 'var(--accent)' : '#333',
          transition: '.3s', borderRadius: 20
        }}>
          <span style={{
            position: 'absolute', height: 14, width: 14, left: value ? 19 : 3, bottom: 3,
            backgroundColor: 'white', transition: '.3s', borderRadius: '50%'
          }} />
        </span>
      </label>
    </div>
  );

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Settings</h2>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 320px', 
        gap: 24,
        alignItems: 'start'
      }}>
        {/* Left Column: Configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* App Behavior Section */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>App Behavior</h3>
            <Toggle 
              label="Close to Tray" 
              value={closeToTray} 
              onChange={v => updatePrefs({ closeToTray: v })}
              description="Sembunyikan ke tray saat menekan tombol close."
            />
            <Toggle 
              label="Start Minimized" 
              value={startMinimized} 
              onChange={v => updatePrefs({ startMinimized: v })}
              description="Jalankan aplikasi dalam keadaan tersembunyi."
            />
            <Toggle 
              label="Live File Previews" 
              value={showPreviews} 
              onChange={setShowPreviews}
              description="Tampilkan isi file (gambar) sebagai ikon di grid."
            />
            <Toggle 
              label="Show Recent Tab" 
              value={showRecent} 
              onChange={v => updatePrefs({ showRecent: v })}
              description="Tampilkan tab Recent di sidebar."
            />
          </div>

          {/* PIN Management Section */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Security</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Master PIN</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {pinExists ? 'PIN aktif. Item terkunci aman.' : 'PIN belum diset. Item tidak dapat dikunci.'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!pinExists ? (
                    <button 
                      onClick={() => setShowPinModal('set')}
                      style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: 'white', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}
                    >
                      Set PIN
                    </button>
                  ) : (
                    <>
                      <button 
                        onClick={() => setShowPinModal('change')}
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}
                      >
                        Ubah PIN
                      </button>
                      <button 
                        onClick={() => setShowPinModal('remove')}
                        style={{ background: 'rgba(237,66,69,0.1)', border: '1px solid rgba(237,66,69,0.2)', borderRadius: 6, color: 'var(--red)', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}
                      >
                        Hapus PIN
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* UI Scaling Section */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Interface Zoom</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input
                type="range"
                min="0.8"
                max="1.3"
                step="0.05"
                value={uiScale}
                onChange={e => setUiScale(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', minWidth: 40, color: 'var(--accent-bright)' }}>
                {(uiScale * 100).toFixed(0)}%
              </span>
              <button 
                onClick={() => setUiScale(1)}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}
              >
                Reset
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>Atur skala antarmuka aplikasi agar sesuai dengan ukuran monitor Anda.</p>
          </div>

          {/* Chunk Size Section */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Chunk Size</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input
                type="range"
                min="0"
                max="2"
                step="1"
                value={safeIndex}
                onChange={e => setChunkSize(CHUNK_OPTIONS[parseInt(e.target.value)].value)}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {CHUNK_OPTIONS.map((opt, i) => (
                  <span 
                    key={i} 
                    style={{ 
                      fontSize: 11, 
                      color: i === safeIndex ? 'var(--accent-bright)' : 'var(--text-muted)',
                      fontWeight: i === safeIndex ? 700 : 400,
                      textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center',
                      flex: 1
                    }}
                  >
                    {opt.label.split(' ')[0]}
                  </span>
                ))}
              </div>
              <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-elevated)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{CHUNK_OPTIONS[safeIndex].label}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{CHUNK_OPTIONS[safeIndex].desc}</p>
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16 }}>
              <b>PENTING:</b> Pastikan ukuran chunk sesuai dengan limit akun Discord Anda.
            </p>
          </div>
        </div>

        {/* Right Column: About Card */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20, position: 'sticky', top: 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>About Disbox</h3>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <p style={{ fontWeight: 700, color: 'var(--accent-bright)', fontSize: 15 }}>Disbox Linux v3.0</p>
            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Discord-based cloud storage with virtual file system and AES-GCM encryption.</p>
            
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Naufal Alamsyah</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>GitHub: naufal-backup</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email: naufalalamsyah453@gmail.com</p>
              
              <div style={{ marginTop: 16 }}>
                <a 
                  href="https://github.com/naufal-backup/disbox" 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={e => { e.preventDefault(); window.open?.(e.currentTarget.href, '_blank'); }}
                >
                  View Source Code
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showPinModal && (
        <PinSettingsModal 
          mode={showPinModal} 
          onClose={() => { setShowPinModal(null); hasPin().then(setPinExists); }} 
        />
      )}
    </div>
  );
}

function PinSettingsModal({ mode, onClose }) {
  const { setPin, verifyPin, removePin } = useApp();
  const [step, setStep] = useState(mode === 'set' ? 'new' : 'verify');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await verifyPin(currentPin);
    if (ok) {
      if (mode === 'remove') {
        await removePin(currentPin);
        toast.success('PIN berhasil dihapus');
        onClose();
      } else {
        setStep('new');
        setCurrentPin('');
        setError('');
      }
    } else {
      setError('PIN saat ini salah');
    }
    setLoading(false);
  };

  const handleSetNew = async (e) => {
    e.preventDefault();
    if (newPin.length < 4) {
      setError('PIN minimal 4 angka');
      return;
    }
    if (newPin !== confirmPin) {
      setError('Konfirmasi PIN tidak cocok');
      return;
    }
    setLoading(true);
    const ok = await setPin(newPin);
    if (ok) {
      toast.success(mode === 'set' ? 'PIN berhasil diset' : 'PIN berhasil diubah');
      onClose();
    } else {
      setError('Gagal menyimpan PIN');
    }
    setLoading(false);
  };

  const title = mode === 'set' ? 'Set Master PIN' : mode === 'change' ? 'Ubah PIN' : 'Hapus PIN';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 320, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Shield size={32} style={{ color: 'var(--accent)', marginBottom: 12 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {step === 'verify' ? 'Masukkan PIN saat ini untuk melanjutkan' : 'Masukkan PIN baru (minimal 4 digit)'}
          </p>
        </div>

        {step === 'verify' ? (
          <form onSubmit={handleVerify}>
            <input 
              type="password" 
              placeholder="PIN Saat Ini" 
              value={currentPin}
              onChange={e => setCurrentPin(e.target.value)}
              autoFocus
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'white', textAlign: 'center', fontSize: 18, letterSpacing: '0.2em', marginBottom: 12, outline: 'none' }}
            />
            {error && <p style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center', marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer' }}>Batal</button>
              <button type="submit" disabled={loading || !currentPin} style={{ flex: 1, padding: 10, background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                {loading ? 'Verifikasi...' : 'Lanjut'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSetNew}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <input 
                type="password" 
                placeholder="PIN Baru" 
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                autoFocus
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'white', textAlign: 'center', fontSize: 18, letterSpacing: '0.2em', outline: 'none' }}
              />
              <input 
                type="password" 
                placeholder="Konfirmasi PIN" 
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'white', textAlign: 'center', fontSize: 18, letterSpacing: '0.2em', outline: 'none' }}
              />
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center', marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer' }}>Batal</button>
              <button type="submit" disabled={loading || !newPin || !confirmPin} style={{ flex: 1, padding: 10, background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                {loading ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
