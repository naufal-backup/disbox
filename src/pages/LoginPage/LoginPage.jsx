import { useState } from 'react';
import { Cloud, User, AlertCircle, Loader2, Key, Sparkles, X, Clock, ChevronDown } from 'lucide-react';
import { useApp } from '@/AppContext.jsx';
import styles from './LoginPage.module.css';

import { ipc } from '@/utils/ipc';

const DISCORD_WEBHOOK_REGEX = /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/.+$/;
const BASE_API_URL = 'https://disbox.naufal.dev';

export default function LoginPage() {
  const { connect, loading, savedWebhooks, t } = useApp();
  const [loginMode, setLoginMode] = useState(null); // 'manual', 'account', atau null
  
  // Manual States
  const [url, setUrl] = useState('');
  const [metadataUrl, setMetadataUrl] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  
  // Account States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [error, setError] = useState('');

  const handleManualConnect = async (webhookUrl) => {
    const target = webhookUrl || url.trim();
    const cdnTarget = metadataUrl.trim();

    setError('');
    if (!target) { setError(t('error_no_url')); return; }
    if (!cdnTarget && !webhookUrl) { setError('Masukkan Link CDN Metadata'); return; }

    if (!DISCORD_WEBHOOK_REGEX.test(target)) {
      setError(t('error_invalid_url'));
      return;
    }

    if (webhookUrl) setUrl(webhookUrl);
    const result = await connect(target, { metadataUrl: cdnTarget });
    if (!result.ok) {
      setError(result.message || 'Gagal connect. Pastikan Webhook URL dan CDN Link benar.');
    }
  };

  const handleAccountLogin = async () => {
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Masukkan username dan password');
      return;
    }

    try {
      const res = await ipc.fetch(`${BASE_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });
      
      let data;
      try {
        if (!res.body || res.body.trim() === '') {
          throw new Error('Response body is empty');
        }
        data = JSON.parse(res.body);
      } catch (e) {
        console.error('[Login] JSON Parse error:', e.message);
        console.error('[Login] Raw Response Body:', res.body);
        console.error('[Login] Response Status:', res.status);
        setError(`Gagal memproses respons server (HTTP ${res.status}).`);
        return;
      }
      
      if (!res.ok || !data.ok) {
        setError(data.error || 'Login gagal');
        return;
      }

      localStorage.setItem('dbx_username', data.username);
      if (data.user_id) {
        localStorage.setItem('dbx_user_id', data.user_id);
        sessionStorage.setItem('dbx_user_id', data.user_id);
      }
      
      const result = await connect(data.webhook_url, { 
        forceId: data.last_msg_id,
        metadataUrl: data.cloud_metadata_url 
      });
      if (!result.ok) setError(result.message || 'Gagal menghubungkan drive.');
      
    } catch (e) {
      console.error('[Login] Error:', e);
      setError('Terjadi kesalahan koneksi ke server.');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.bg}>
        <div className={styles.glow1} /><div className={styles.glow2} /><div className={styles.grid} />
      </div>

      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoRing}><Cloud size={28} strokeWidth={1.5} /></div>
        </div>

        <h1 className={styles.title}>Disbox</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>

        <div className={styles.features}>
          {[t('feature_unlimited'), t('feature_chunk'), t('feature_local'), t('feature_virtual')].map(f => (
            <div key={f} className={styles.feature}>
              <div className={styles.featureDot} />
              <span>{f}</span>
            </div>
          ))}
        </div>

        <div className={styles.divider} />

        {!loginMode ? (
          <div className={styles.methodSelector}>
            <button className={styles.methodBtnPrimary} onClick={() => setLoginMode('account')} disabled={loading}>
              <User size={20} />
              <div className={styles.methodInfo}>
                <span className={styles.methodTitle}>Masuk dengan Akun</span>
                <span className={styles.methodDesc}>Username & Password</span>
              </div>
            </button>

            <button className={styles.methodBtnSecondary} onClick={() => setLoginMode('manual')} disabled={loading}>
              <Cloud size={20} />
              <div className={styles.methodInfo}>
                <span className={styles.methodTitle}>Masuk Manual</span>
                <span className={styles.methodDesc}>Webhook + Link Metadata</span>
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

            {error && <div className={styles.errorMsg} style={{ marginBottom: 15 }}><AlertCircle size={12} /> {error}</div>}

            <button className={styles.connectBtn} onClick={handleAccountLogin} disabled={loading}>
              {loading ? <><Loader2 size={16} className="spin" /> Memuat...</> : <><Key size={16} /> Masuk</>}
            </button>
          </div>
        ) : (
          <div className={styles.manualForm}>
            <div className={styles.formHeader}>
              <button className={styles.backBtn} onClick={() => { setLoginMode(null); setError(''); }}>← Kembali</button>
              <span className={styles.formTitle}>Masuk Manual</span>
            </div>

            {savedWebhooks.length > 0 && (
              <div className={styles.savedSection}>
                <button className={styles.savedToggle} onClick={() => setShowHistory(h => !h)}>
                  <Clock size={12} />
                  <span>{t('saved_webhooks_count', { count: savedWebhooks.length })}</span>
                  <ChevronDown size={12} style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </button>
                {showHistory && (
                  <div className={styles.savedList}>
                    {savedWebhooks.map((w, i) => (
                      <button key={i} className={styles.savedItem} onClick={() => handleManualConnect(w.url)} disabled={loading}>
                        <div className={styles.savedIcon}><Cloud size={11} /></div>
                        <div className={styles.savedInfo}><span className={styles.savedLabel}>{w.label}</span><span className={styles.savedUrl}>{w.url.slice(0, 48)}…</span></div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className={styles.inputGroup}>
              <label className={styles.label}>Webhook URL</label>
              <div className={styles.inputRow}>
                <input 
                  type="text" className={styles.input} placeholder="https://discord.com/api/webhooks/..."
                  value={url} onChange={e => setUrl(e.target.value)}
                />
                {url && <button className={styles.clearBtn} onClick={() => setUrl('')}><X size={12} /></button>}
              </div>
            </div>

            <div className={styles.inputGroup}>
              <label className={styles.label}>Link CDN Metadata</label>
              <div className={styles.inputRow}>
                <input 
                  type="text" className={styles.input} placeholder="https://cdn.discordapp.com/attachments/..."
                  value={metadataUrl} onChange={e => setMetadataUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleManualConnect()}
                />
                {metadataUrl && <button className={styles.clearBtn} onClick={() => setMetadataUrl('')}><X size={12} /></button>}
              </div>
              <p className={styles.helpText}>Klik kanan file disbox_metadata.json di Discord &gt; Copy Link</p>
            </div>

            {error && <div className={styles.errorMsg} style={{ marginBottom: 15 }}><AlertCircle size={12} /> {error}</div>}

            <button className={styles.connectBtn} onClick={() => handleManualConnect()} disabled={loading}>
              {loading ? <><Loader2 size={16} className="spin" /> Menghubungkan...</> : <><Cloud size={16} /> Connect Drive</>}
            </button>
          </div>
        )}

        <div className={styles.help}>
          <a className={styles.helpLink} href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks" target="_blank" rel="noreferrer" onClick={e => { e.preventDefault(); window.open?.(e.currentTarget.href, '_blank'); }}>
            <Sparkles size={11} /> Apa itu Webhook?
          </a>
        </div>
      </div>

      <div className={styles.version}>
        <div>Disbox v4.0.1 · Cloud Profile Edition</div>
      </div>
    </div>
  );
}
