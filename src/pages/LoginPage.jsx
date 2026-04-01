import { useState } from 'react';
import { Cloud, User, AlertCircle, Loader2, Key, X, Sparkles, Info, UserPlus, Zap } from 'lucide-react';
import { useApp } from '../context/useAppHook.js';
import { BASE_API } from '../utils/disbox.js';
import styles from './LoginPage.module.css';
import toast from 'react-hot-toast';

const DISCORD_WEBHOOK_REGEX = /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/.+$/;

export default function LoginPage() {
  const { connect, loading, t } = useApp();
  const [loginMode, setLoginMode] = useState(null); // 'manual', 'account', 'register' atau null
  const [showInfo, setShowInfo] = useState(false);
  
  // Manual States
  const [url, setUrl] = useState('');
  const [metadataUrl, setMetadataUrl] = useState('');
  
  // Account States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');

  const handleManualConnect = async () => {
    setError('');
    if (!url.trim()) { setError('Masukkan webhook URL'); return; }

    if (!DISCORD_WEBHOOK_REGEX.test(url.trim())) {
      setError('Format webhook URL tidak valid');
      return;
    }

    const result = await connect(url.trim(), { metadataUrl: metadataUrl.trim() });
    if (!result.ok) setError(result.message || 'Gagal connect.');
  };

  const handleAccountLogin = async () => {
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Masukkan username dan password');
      return;
    }

    try {
      // Menjiplak alur fetch web tapi dengan window.electron.fetch
      const res = await window.electron.fetch(`${BASE_API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      
      const data = JSON.parse(res.body);
      
      if (!res.ok || !data.ok) {
        setError(data.error || 'Login gagal');
        return;
      }

      localStorage.setItem('dbx_username', data.username);
      
      const result = await connect(data.webhook_url, { 
        forceId: data.last_msg_id,
        metadataUrl: data.cloud_metadata_url 
      });
      if (!result.ok) setError(result.message || 'Gagal menghubungkan drive.');
      
    } catch (e) {
      console.error('[Login] Error:', e);
      setError('Terjadi kesalahan server.');
    }
  };

  const handleRegister = async () => {
    setError('');
    if (!username.trim() || !password.trim() || !url.trim()) {
      setError('Username, Password, dan Webhook wajib diisi');
      return;
    }

    if (!DISCORD_WEBHOOK_REGEX.test(url.trim())) {
      setError('Format webhook URL tidak valid');
      return;
    }

    try {
      const res = await window.electron.fetch(`${BASE_API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: username.trim(), 
          password, 
          webhook_url: url.trim(),
          metadata_url: metadataUrl.trim() || null
        })
      });
      
      const data = JSON.parse(res.body);
      
      if (!res.ok || !data.ok) {
        setError(data.error || 'Registrasi gagal');
        return;
      }

      localStorage.setItem('dbx_username', username.trim().toLowerCase());
      toast.success('Akun berhasil dibuat! Silakan login.');
      setLoginMode('account');
      setPassword('');
    } catch (e) {
      console.error('[Register] Error:', e);
      setError('Terjadi kesalahan server saat registrasi.');
    }
  };

  const InfoPopup = () => (
    <div className={styles.infoOverlay} onClick={() => setShowInfo(false)}>
      <div className={styles.infoContent} onClick={e => e.stopPropagation()}>
        <h2 className={styles.infoTitle}><Info size={20} /> Informasi Akses</h2>
        <div className={styles.infoList}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Masuk dengan Akun</span>
            <span className={styles.infoText}>Gunakan jika Anda sudah memiliki akun Disbox Cloud. Seluruh data metadata akan otomatis tersinkronisasi.</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Daftar Akun Baru</span>
            <span className={styles.infoText}>Simpan konfigurasi drive Anda ke cloud. Metadata akan di-backup ke server Vercel & Discord. Bisa import metadata lama via link CDN.</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Setup Baru (Webhook)</span>
            <span className={styles.infoText}>Gunakan jika Anda benar-benar baru atau ingin menggunakan drive tanpa sistem akun (Metadata disimpan lokal/discord).</span>
          </div>
        </div>
        <button className={styles.closeInfo} onClick={() => setShowInfo(false)}>Tutup</button>
      </div>
    </div>
  );

  return (
    <div className={styles.page}>
      {showInfo && <InfoPopup />}
      
      <div className={styles.bg}>
        <div className={styles.glow1} /><div className={styles.glow2} /><div className={styles.grid} />
      </div>

      <div className={styles.card}>
        <button className={styles.infoBtn} onClick={() => setShowInfo(true)} style={{ position: 'absolute', right: 20, top: 20, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <Info size={18} />
        </button>

        <div className={styles.logo}>
          <div className={styles.logoRing}><Cloud size={28} strokeWidth={1.5} /></div>
        </div>

        <h1 className={styles.title}>Disbox</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>

        <div className={styles.divider} />

        {!loginMode ? (
          <div className={styles.methodSelector}>
            <button className={styles.methodBtnPrimary} onClick={() => setLoginMode('account')} disabled={loading}>
              <User size={20} />
              <div className={styles.methodInfo}>
                <span className={styles.methodTitle}>Masuk dengan Akun</span>
                <span className={styles.methodDesc}>Sync metadata otomatis via Cloud</span>
              </div>
            </button>

            <button className={styles.methodBtnSecondary} onClick={() => setLoginMode('register')} disabled={loading}>
              <UserPlus size={20} />
              <div className={styles.methodInfo}>
                <span className={styles.methodTitle}>Daftar Akun Baru</span>
                <span className={styles.methodDesc}>Simpan profil ke database Cloud</span>
              </div>
            </button>

            <button className={styles.methodBtnTernary} onClick={() => setLoginMode('manual')} disabled={loading}>
              <Zap size={20} />
              <div className={styles.methodInfo}>
                <span className={styles.methodTitle}>Setup Baru (Guest)</span>
                <span className={styles.methodDesc}>Input Webhook saja</span>
              </div>
            </button>
          </div>
        ) : loginMode === 'account' ? (
          <div className={styles.manualForm}>
            <div className={styles.formHeader}>
              <button className={styles.backBtn} onClick={() => { setLoginMode(null); setError(''); }}>← Kembali</button>
              <span className={styles.formTitle}>Login Akun</span>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Username</label>
              <input 
                type="text" className={styles.input} placeholder="Masukkan username"
                value={username} onChange={e => setUsername(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Password</label>
              <input 
                type="password" className={styles.input} placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAccountLogin()}
              />
            </div>

            {error && <div className={styles.errorMsg}><AlertCircle size={12} /> {error}</div>}

            <button className={styles.connectBtn} onClick={handleAccountLogin} disabled={loading}>
              {loading ? <><Loader2 size={16} className="spin" /> Memuat...</> : <><Key size={16} /> Masuk</>}
            </button>
          </div>
        ) : loginMode === 'register' ? (
          <div className={styles.manualForm}>
            <div className={styles.formHeader}>
              <button className={styles.backBtn} onClick={() => { setLoginMode(null); setError(''); }}>← Kembali</button>
              <span className={styles.formTitle}>Daftar Akun Cloud</span>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Username</label>
              <input 
                type="text" className={styles.input} placeholder="Username baru"
                value={username} onChange={e => setUsername(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Password</label>
              <input 
                type="password" className={styles.input} placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Webhook URL</label>
              <input 
                type="text" className={styles.input} placeholder="https://discord.com/api/webhooks/..."
                value={url} onChange={e => setUrl(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Link CDN Metadata (Opsional)</label>
              <input 
                type="text" className={styles.input} placeholder="https://cdn.discordapp.com/..."
                value={metadataUrl} onChange={e => setMetadataUrl(e.target.value)}
              />
              <p className={styles.helpText}>Gunakan jika ingin mengimpor data drive lama.</p>
            </div>

            {error && <div className={styles.errorMsg}><AlertCircle size={12} /> {error}</div>}

            <button className={styles.connectBtn} onClick={handleRegister} disabled={loading}>
              {loading ? <><Loader2 size={16} className="spin" /> Mendaftar...</> : <><UserPlus size={16} /> Daftar & Simpan</>}
            </button>
          </div>
        ) : (
          <div className={styles.manualForm}>
            <div className={styles.formHeader}>
              <button className={styles.backBtn} onClick={() => { setLoginMode(null); setError(''); }}>← Kembali</button>
              <span className={styles.formTitle}>Setup Baru</span>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Webhook URL</label>
              <input 
                type="text" className={styles.input} placeholder="https://discord.com/api/webhooks/..."
                value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualConnect()}
              />
            </div>

            {error && <div className={styles.errorMsg}><AlertCircle size={12} /> {error}</div>}

            <button className={styles.connectBtn} onClick={handleManualConnect} disabled={loading}>
              {loading ? <><Loader2 size={16} className="spin" /> Menghubungkan...</> : <><Cloud size={16} /> Connect Drive</>}
            </button>
          </div>
        )}

        <div className={styles.help}>
          <a className={styles.helpLink} href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks" target="_blank" rel="noreferrer">
            <Sparkles size={11} /> Apa itu Webhook?
          </a>
        </div>
      </div>

      <div className={styles.version}>
        <div>Disbox v4.5.4 · Web Aligned Edition</div>
      </div>
    </div>
  );
}
