// ═══════════════════════════════════════════════════════════════════
// KOMPONEN SHARE SETTINGS — tambahkan ke DrivePage.jsx
// ═══════════════════════════════════════════════════════════════════

// 1. Tambahkan import di bagian atas DrivePage.jsx:
// import { Link2, ExternalLink, CheckCircle } from 'lucide-react';  (tambah ke existing imports)
// import SharedPage from './SharedPage.jsx';

// 2. Tambahkan di DrivePage render, setelah cloud-save:
// {activePage === 'shared' && <SharedPage onNavigateToSettings={() => handleNavigate('settings')} />}

// 3. Tambahkan di mobileHeader title:
// {activePage === 'shared' && 'Shared'}

// 4. Tambahkan komponen ShareSettingsSection di dalam SettingsPanel,
//    setelah Cloud Save section:

import { useState } from 'react';
import { Link2, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import { motion, AnimatePresence } from 'framer-motion';

export function ShareSettingsSection() {
  const {
    shareEnabled, setShareEnabled, shareMode, setShareMode,
    cfWorkerUrl, setCfWorkerUrl, saveShareSettings, deployWorker,
    revokeAllLinks, shareLinks, isTransferring, t, animationsEnabled
  } = useApp();

  const [showWorkerSetup, setShowWorkerSetup] = useState(false);
  const [apiToken, setApiToken] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState('');
  const [deploySuccess, setDeploySuccess] = useState(false);
  const [showRevokeWarning, setShowRevokeWarning] = useState(false);
  const [cfInput, setCfInput] = useState(cfWorkerUrl || '');

  const backdropVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const modalVariants = {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 300 }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: 20,
      transition: { duration: 0.2 }
    }
  };

  const transition = animationsEnabled ? {} : { duration: 0 };

  const handleToggleShare = async (val) => {
    if (!val && shareLinks.length > 0) {
      setShowRevokeWarning(true);
      return;
    }
    await saveShareSettings({ enabled: val, mode: shareMode, cf_worker_url: cfWorkerUrl });
    setShareEnabled(val);
  };

  const handleModeChange = async (mode) => {
    setShareMode(mode);
    await saveShareSettings({ enabled: shareEnabled, mode, cf_worker_url: cfWorkerUrl });
  };

  const handleDeploy = async () => {
    if (!apiToken.trim()) return;
    setDeploying(true);
    setDeployError('');
    const result = await deployWorker(apiToken.trim());
    if (result.ok) {
      setCfInput(result.workerUrl);
      setCfWorkerUrl(result.workerUrl);
      await saveShareSettings({
        enabled: shareEnabled,
        mode: 'private',
        cf_worker_url: result.workerUrl,
        cf_api_token: result.userApiKey || ''
      });
      setDeploySuccess(true);
      setShowWorkerSetup(false);
      setApiToken('');
    } else {
      setDeployError(result.message || `Gagal: ${result.reason}`);
      if (result.reason === 'no_subdomain') {
        setTimeout(() => {
          window.electron?.openExternal?.('https://dash.cloudflare.com/?to=/:account/workers/subdomain');
        }, 3000);
      }
    }
    setDeploying(false);
  };

  const handleSaveCfUrl = async () => {
    setCfWorkerUrl(cfInput);
    await saveShareSettings({ enabled: shareEnabled, mode: shareMode, cf_worker_url: cfInput });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Enable Share</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Bagikan file via link ke siapapun</p>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20 }}>
          <input
            type="checkbox"
            checked={shareEnabled}
            onChange={e => handleToggleShare(e.target.checked)}
            disabled={isTransferring}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span style={{
            position: 'absolute', cursor: 'pointer', inset: 0,
            backgroundColor: shareEnabled ? 'var(--accent)' : '#333',
            transition: '.3s', borderRadius: 20
          }}>
            <span style={{
              position: 'absolute', height: 14, width: 14,
              left: shareEnabled ? 19 : 3, bottom: 3,
              backgroundColor: 'white', transition: '.3s', borderRadius: '50%'
            }} />
          </span>
        </label>
      </div>

      {/* Mode selector — only visible when enabled */}
      {shareEnabled && (
        <div style={{ padding: '14px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Mode</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => handleModeChange('public')}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                background: shareMode === 'public' ? 'var(--accent)' : 'var(--bg-surface)',
                border: shareMode === 'public' ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: shareMode === 'public' ? 'white' : 'var(--text-secondary)'
              }}
            >
              Public
            </button>
            <button
              onClick={() => handleModeChange('private')}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                background: shareMode === 'private' ? 'var(--accent)' : 'var(--bg-surface)',
                border: shareMode === 'private' ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: shareMode === 'private' ? 'white' : 'var(--text-secondary)'
              }}
            >
              Private
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            {shareMode === 'public'
              ? 'Menggunakan server Disbox. Tidak perlu setup.'
              : 'CF Worker di akun Cloudflare kamu sendiri.'}
          </p>

          {/* Private mode — worker setup */}
          {shareMode === 'private' && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deploySuccess || cfWorkerUrl ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(0, 212, 170, 0.1)', border: '1px solid rgba(0, 212, 170, 0.3)', borderRadius: 8 }}>
                  <CheckCircle size={14} style={{ color: '#00d4aa', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#00d4aa', flex: 1, wordBreak: 'break-all' }}>{cfWorkerUrl}</span>
                  <button
                    onClick={() => setShowWorkerSetup(true)}
                    style={{ fontSize: 10, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                  >
                    Redeploy
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowWorkerSetup(true)}
                  style={{ padding: '10px 0', background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Setup Worker
                </button>
              )}

              {/* Manual URL input */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="https://disbox-worker.xxx.workers.dev"
                  value={cfInput}
                  onChange={e => setCfInput(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 11, outline: 'none' }}
                />
                <button
                  onClick={handleSaveCfUrl}
                  style={{ padding: '8px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer' }}
                >
                  Simpan
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {/* Worker Setup Modal */}
        {showWorkerSetup && (
          <motion.div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} 
            onClick={() => setShowWorkerSetup(false)}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={backdropVariants}
            transition={transition}
          >
            <motion.div 
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 16, padding: 28, width: 420, maxWidth: '90vw' }} 
              onClick={e => e.stopPropagation()}
              variants={modalVariants}
              transition={transition}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                <Link2 size={20} style={{ color: 'var(--accent)' }} />
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Setup Cloudflare Worker</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                {/* Step 1 */}
                <div style={{ padding: 14, background: 'var(--bg-surface)', borderRadius: 10, borderLeft: '3px solid var(--accent)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>1</div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>Daftar / Login Cloudflare</p>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
                    Gratis. Klik tombol di bawah untuk membuka halaman pendaftaran Cloudflare.
                    Jika sudah punya akun, langsung login saja.
                  </p>
                  <button
                    onClick={() => window.electron?.shareOpenCFTokenPage?.()}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                  >
                    <ExternalLink size={12} /> Buka Cloudflare
                  </button>
                </div>

                {/* Step 2 */}
                <div style={{ padding: 14, background: 'var(--bg-surface)', borderRadius: 10, borderLeft: '3px solid var(--accent)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>2</div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>Buat API Token</p>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8 }}>
                    Setelah login, kamu akan diarahkan ke halaman buat token. Ikuti langkah berikut:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 0 }}>
                    {[
                      'Di Account Resources → pilih akun kamu di dropdown kanan',
                      'Zone Resources → biarkan "All zones" (tidak perlu diubah)',
                      'Klik Continue to Summary',
                      'Klik Create Token',
                      'Copy token yang muncul',
                    ].map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(88,101,242,0.2)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>{i+1}</div>
                        <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Step 3 */}
                <div style={{ padding: 14, background: 'var(--bg-surface)', borderRadius: 10, borderLeft: '3px solid var(--accent)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>3</div>
                    <p style={{ fontSize: 12, fontWeight: 600 }}>Paste Token & Deploy</p>
                  </div>
                  <input
                    type="password"
                    placeholder="Paste API token di sini..."
                    value={apiToken}
                    onChange={e => setApiToken(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
                  />
                  <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                    Disbox akan otomatis deploy Worker ke akun Cloudflare kamu. Tidak perlu konfigurasi apapun lagi.
                  </p>
                  {deployError && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: 'var(--red, #ed4245)', fontSize: 11 }}>
                      <AlertCircle size={12} /> {deployError}
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowWorkerSetup(false); setApiToken(''); setDeployError(''); }} style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>
                  Batal
                </button>
                <button
                  onClick={handleDeploy}
                  disabled={deploying || !apiToken.trim()}
                  style={{ flex: 1, padding: 10, background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: (deploying || !apiToken.trim()) ? 0.6 : 1 }}
                >
                  {deploying ? 'Deploying...' : 'Deploy'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Revoke warning on disable */}
        {showRevokeWarning && (
          <motion.div 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} 
            onClick={() => setShowRevokeWarning(false)}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={backdropVariants}
            transition={transition}
          >
            <motion.div 
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 14, padding: 24, width: 360, maxWidth: '90vw', textAlign: 'center' }} 
              onClick={e => e.stopPropagation()}
              variants={modalVariants}
              transition={transition}
            >
              <AlertCircle size={32} style={{ color: 'var(--amber, #f0a500)', marginBottom: 12 }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Matikan Fitur Share?</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
                Kamu masih punya {shareLinks.length} link aktif. Link yang sudah dibagikan tetap aktif sampai expired.
                <br /><br />
                Ingin revoke semua link sekarang?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={async () => {
                    await revokeAllLinks();
                    await saveShareSettings({ enabled: false, mode: shareMode, cf_worker_url: cfWorkerUrl });
                    setShareEnabled(false);
                    setShowRevokeWarning(false);
                  }}
                  style={{ flex: 1, padding: 10, background: 'var(--red, #ed4245)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
                >
                  Revoke Semua
                </button>
                <button
                  onClick={async () => {
                    await saveShareSettings({ enabled: false, mode: shareMode, cf_worker_url: cfWorkerUrl });
                    setShareEnabled(false);
                    setShowRevokeWarning(false);
                  }}
                  style={{ flex: 1, padding: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
                >
                  Biarkan
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
