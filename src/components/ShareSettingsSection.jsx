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

import { useState, useEffect } from 'react';
import { Link2, ExternalLink, CheckCircle, AlertCircle, ChevronDown, Check, Activity } from 'lucide-react';
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

  const [showWorkerMenu, setShowWorkerMenu] = useState(false);
  const [workerUsage, setWorkerUsage] = useState({});

  useEffect(() => {
    if (!shareEnabled) return;
    const fetchUsage = async () => {
      const results = {};
      for (const worker of PUBLIC_WORKERS) {
        try {
          const res = await window.electron.fetch(`${worker.url}/share/stats`);
          if (res.ok) {
            const data = JSON.parse(res.body);
            results[worker.url] = data.count;
          }
        } catch (e) {
          console.warn(`[share] Failed to fetch usage for ${worker.label}:`, e.message);
        }
      }
      setWorkerUsage(results);
    };
    fetchUsage();
  }, [shareEnabled]);

  const handleToggleShare = async (val) => {
    if (!val && shareLinks.length > 0) {
      setShowRevokeWarning(true);
      return;
    }
    await saveShareSettings({ enabled: val, mode: shareMode, cf_worker_url: cfWorkerUrl });
    setShareEnabled(val);
  };

  const PUBLIC_WORKERS = [
    { label: 'Disbox Public #1 (Main)', url: 'https://disbox-shared-link.naufal-backup.workers.dev' },
    { label: 'Disbox Public #2 (New)', url: 'https://disbox-shared-link.alamsyahnaufal453.workers.dev' },
    { label: 'Disbox Public #3', url: 'https://disbox-worker-2.naufal-backup.workers.dev' },
    { label: 'Disbox Public #4', url: 'https://disbox-worker-3.naufal-backup.workers.dev' },
  ];

  const handleModeChange = async (mode) => {
    // Force public mode
    if (mode === 'private') {
      toast.error('Private mode is currently disabled');
      return;
    }
    setShareMode(mode);
    await saveShareSettings({ enabled: shareEnabled, mode, cf_worker_url: cfWorkerUrl });
  };

  const handleWorkerSelect = async (url) => {
    setCfInput(url);
    setCfWorkerUrl(url);
    await saveShareSettings({ enabled: shareEnabled, mode: 'public', cf_worker_url: url });
    setShowWorkerMenu(false);
  };

  const selectedWorkerLabel = PUBLIC_WORKERS.find(w => w.url === cfWorkerUrl)?.label || (cfWorkerUrl ? 'Custom Worker' : 'Select Worker...');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }} onClick={() => setShowWorkerMenu(false)}>
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
              disabled
              style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'not-allowed', transition: 'all 0.2s',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                opacity: 0.5
              }}
            >
              Private (Disabled)
            </button>
          </div>
          
          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Select Worker</p>
            <div style={{ position: 'relative' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setShowWorkerMenu(!showWorkerMenu); }}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--bg-surface)',
                  border: `1px solid ${showWorkerMenu ? 'var(--accent)' : 'var(--border)'}`,
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  outline: 'none',
                  boxShadow: showWorkerMenu ? '0 0 0 3px var(--accent-dim)' : 'none'
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>
                  {selectedWorkerLabel}
                </span>
                <ChevronDown size={14} style={{ transform: showWorkerMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-muted)' }} />
              </button>

              <AnimatePresence>
                {showWorkerMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    style={{
                      position: 'absolute',
                      top: '42px',
                      left: 0,
                      right: 0,
                      marginTop: 6,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-bright)',
                      borderRadius: 12,
                      padding: 6,
                      zIndex: 1000,
                      boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {PUBLIC_WORKERS.map(worker => (
                      <button
                        key={worker.url}
                        onClick={() => handleWorkerSelect(worker.url)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '8px 12px',
                          width: '100%',
                          border: 'none',
                          background: cfWorkerUrl === worker.url ? 'var(--accent-dim)' : 'transparent',
                          color: cfWorkerUrl === worker.url ? 'var(--accent-bright)' : 'var(--text-secondary)',
                          fontSize: '13px',
                          fontFamily: 'var(--font-body)',
                          cursor: 'pointer',
                          borderRadius: '6px',
                          transition: 'all 0.1s',
                          textAlign: 'left'
                        }}
                        onMouseEnter={(e) => {
                          if (cfWorkerUrl !== worker.url) {
                            e.currentTarget.style.background = 'var(--bg-hover)';
                            e.currentTarget.style.color = 'var(--text-primary)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (cfWorkerUrl !== worker.url) {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                          }
                        }}
                      >
                        <div style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {cfWorkerUrl === worker.url && <Check size={12} />}
                        </div>
                        <span style={{ flex: 1 }}>{worker.label}</span>
                        {workerUsage[worker.url] !== undefined && (
                          <span style={{ fontSize: 10, opacity: 0.5, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, fontFamily: 'var(--font-mono)' }}>
                            {typeof workerUsage[worker.url] === 'object' ? workerUsage[worker.url].links : workerUsage[worker.url]} links
                          </span>
                        )}
                      </button>
                    ))}
                    
                    {cfWorkerUrl && !PUBLIC_WORKERS.find(w => w.url === cfWorkerUrl) && (
                      <>
                        <div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
                        <div style={{ padding: '4px 10px', fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Custom URL</div>
                        <button
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: 'var(--accent-dim)',
                            border: 'none',
                            color: 'var(--accent-bright)',
                            fontSize: 11,
                            textAlign: 'left',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          {cfWorkerUrl}
                        </button>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
            Menggunakan server Disbox. Tidak perlu setup sendiri.
          </p>
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
