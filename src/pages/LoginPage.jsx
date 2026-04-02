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
      const res = await window.electron.fetch(`${BASE_API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      const data = JSON.parse(res.body);

      if (!data.ok) {
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

      if (!data.ok) {
        setError(data.error || 'Registrasi gagal');
        return;
      }

      localStorage.setItem('dbx_username', username.trim().toLowerCase());
      toast.success('Akun berhasil dibuat! Silakan login.');
      setLoginMode('account');
      setPassword('');
    } catch (e) {
      setError('Terjadi kesalahan server saat registrasi.');
    }
  };

  const InfoPopup = () => (
    <div className={styles.infoOverlay} onClick={() => setShowInfo(false)}>
      <div className={styles.infoContent} onClick={e => e.stopPropagation()}>
        <h2 className={styles.infoTitle}><Info size={20} /> {t('access_info')}</h2>
        <div className={styles.infoList}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>{t('login_with_account')}</span>
            <span className={styles.infoText}>{t('login_account_desc')}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>{t('register_new_account')}</span>
            <span className={styles.infoText}>{t('register_account_desc')}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>{t('setup_new_drive')}</span>
            <span className={styles.infoText}>{t('setup_drive_desc')}</span>
          </div>
        </div>
        <button className={styles.closeInfo} onClick={() => setShowInfo(false)}>{t('close')}</button>
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
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div className={styles.langSelector}>
                <Globe size={14} style={{ color: 'var(--text-muted)' }} />
                <select 
                  value={language} 
                  onChange={e => setLanguage(e.target.value)}
                  className={styles.langSelect}
                >
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                </select>
              </div>
            </div>

            <div className={styles.methodSelector}>
            <button className={styles.methodBtnPrimary} onClick={() => setLoginMode('account')} disabled={loading}>
              <User size={20} />
              <div className={styles.methodInfo}>
                <span className={styles.methodTitle}>{t('login_with_account')}</span>
                <span className={styles.methodDesc}>{t('login_account_desc')}</span>
              </div>
            </button>

            <button className={styles.methodBtnSecondary} onClick={() => setLoginMode('register')} disabled={loading}>
              <UserPlus size={20} />
              <div className={styles.methodInfo}>
                <span className={styles.methodTitle}>{t('register_new_account')}</span>
                <span className={styles.methodDesc}>{t('register_account_desc')}</span>
              </div>
            </button>

            <button className={styles.methodBtnTernary} onClick={() => setLoginMode('manual')} disabled={loading}>
              <Zap size={20} />
              <div className={styles.methodInfo}>
                <span className={styles.methodTitle}>{t('setup_new_drive')}</span>
                <span className={styles.methodDesc}>{t('setup_drive_desc')}</span>
              </div>
            </button>
          </div>
        ) : loginMode === 'account' ? (
          <div className={styles.manualForm}>
            <div className={styles.formHeader}>
              <button className={styles.backBtn} onClick={() => { setLoginMode(null); setError(''); }}>← {t('back')}</button>
              <span className={styles.formTitle}>{t('welcome')}</span>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>{t('username')}</label>
              <input 
                type="text" className={styles.input} placeholder={t('enter_username')}
                value={username} onChange={e => setUsername(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>{t('password')}</label>
              <input 
                type="password" className={styles.input} placeholder={t('password_placeholder')}
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAccountLogin()}
              />
            </div>

            {error && <div className={styles.errorMsg}><AlertCircle size={12} /> {error}</div>}

            <button className={styles.connectBtn} onClick={handleAccountLogin} disabled={loading}>
              {loading ? <><Loader2 size={16} className="spin" /> {t('loading')}</> : <><Key size={16} /> {t('next')}</>}
            </button>
          </div>
        ) : loginMode === 'register' ? (
          <div className={styles.manualForm}>
            <div className={styles.formHeader}>
              <button className={styles.backBtn} onClick={() => { setLoginMode(null); setError(''); }}>← {t('back')}</button>
              <span className={styles.formTitle}>{t('register')}</span>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>{t('username')}</label>
              <input 
                type="text" className={styles.input} placeholder={t('new_username')}
                value={username} onChange={e => setUsername(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>{t('password')}</label>
              <input 
                type="password" className={styles.input} placeholder={t('password_placeholder')}
                value={password} onChange={e => setPassword(e.target.value)}
              />
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Webhook URL</label>
              <input 
                type="text" className={styles.input} placeholder={t('webhook_placeholder')}
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
              {loading ? <><Loader2 size={16} className="spin" /> {t('status_syncing')}</> : <><UserPlus size={16} /> {t('register')}</>}
            </button>
          </div>
        ) : (
          <div className={styles.manualForm}>
            <div className={styles.formHeader}>
              <button className={styles.backBtn} onClick={() => { setLoginMode(null); setError(''); }}>← {t('back')}</button>
              <span className={styles.formTitle}>{t('add_webhook')}</span>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Webhook URL</label>
              <input 
                type="text" className={styles.input} placeholder={t('webhook_placeholder')}
                value={url} onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleManualConnect()}
              />
            </div>

            {error && <div className={styles.errorMsg}><AlertCircle size={12} /> {error}</div>}

            <button className={styles.connectBtn} onClick={handleManualConnect} disabled={loading}>
              {loading ? <><Loader2 size={16} className="spin" /> {t('verifying')}</> : <><Cloud size={16} /> {t('connect_drive')}</>}
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
        <div>Disbox v4.5.5 · Web Aligned Edition</div>
      </div>
    </div>
  );
}
