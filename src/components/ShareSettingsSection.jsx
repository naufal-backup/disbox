import { useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { useApp } from '../context/useAppHook.js';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

import WorkerSetupModal from './ShareSettingsSection/WorkerSetupModal.jsx';
import RevokeWarningModal from './ShareSettingsSection/RevokeWarningModal.jsx';

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
  const [showRevokeWarning, setShowRevokeWarning] = useState(false);
  const [showWorkerMenu, setShowWorkerMenu] = useState(false);
  const [workerUsage, setWorkerUsage] = useState({});

  const PUBLIC_WORKERS = [
    { label: 'Disbox Public #1 (Main)', url: 'https://disbox-shared-link.naufal-backup.workers.dev' },
    { label: 'Disbox Public #2 (New)', url: 'https://disbox-shared-link.alamsyahnaufal453.workers.dev' },
    { label: 'Disbox Public #3', url: 'https://disbox-worker-2.naufal-backup.workers.dev' },
    { label: 'Disbox Public #4', url: 'https://disbox-worker-3.naufal-backup.workers.dev' },
  ];

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

  const handleModeChange = async (mode) => {
    if (mode === 'private') {
      toast.error('Private mode is currently disabled');
      return;
    }
    setShareMode(mode);
    await saveShareSettings({ enabled: shareEnabled, mode, cf_worker_url: cfWorkerUrl });
  };

  const handleWorkerSelect = async (url) => {
    setCfWorkerUrl(url);
    await saveShareSettings({ enabled: shareEnabled, mode: 'public', cf_worker_url: url });
    setShowWorkerMenu(false);
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployError('');
    try {
      const res = await deployWorker(apiToken);
      if (res.ok) {
        toast.success('Worker berhasil di-deploy!');
        setCfWorkerUrl(res.url);
        await saveShareSettings({ enabled: shareEnabled, mode: 'public', cf_worker_url: res.url });
        setShowWorkerSetup(false);
      } else {
        setDeployError(res.error || 'Gagal deploy worker');
      }
    } catch (e) {
      setDeployError(e.message);
    } finally {
      setDeploying(false);
    }
  };

  const backdropVariants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  const modalVariants = {
    initial: { opacity: 0, scale: 0.95, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
    exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.2 } }
  };
  const transition = animationsEnabled ? {} : { duration: 0 };

  const selectedWorkerLabel = PUBLIC_WORKERS.find(w => w.url === cfWorkerUrl)?.label || (cfWorkerUrl ? 'Custom Worker' : 'Select Worker...');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }} onClick={() => setShowWorkerMenu(false)}>
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
                background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', opacity: 0.5
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
                  width: '100%', padding: '10px 12px', borderRadius: 10, background: 'var(--bg-surface)',
                  border: `1px solid ${showWorkerMenu ? 'var(--accent)' : 'var(--border)'}`,
                  color: 'var(--text-primary)', fontSize: 12, fontWeight: 500, display: 'flex',
                  alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                  transition: 'all 0.2s ease', outline: 'none',
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
                      position: 'absolute', top: '42px', left: 0, right: 0, marginTop: 6,
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
                      borderRadius: 12, padding: 6, zIndex: 1000, boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                      display: 'flex', flexDirection: 'column', gap: 2
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {PUBLIC_WORKERS.map(worker => (
                      <button
                        key={worker.url}
                        onClick={() => handleWorkerSelect(worker.url)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                          width: '100%', border: 'none',
                          background: cfWorkerUrl === worker.url ? 'var(--accent-dim)' : 'transparent',
                          color: cfWorkerUrl === worker.url ? 'var(--accent-bright)' : 'var(--text-secondary)',
                          fontSize: '13px', fontFamily: 'var(--font-body)', cursor: 'pointer',
                          borderRadius: '6px', transition: 'all 0.1s', textAlign: 'left'
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showWorkerSetup && (
          <WorkerSetupModal 
            onClose={() => setShowWorkerSetup(false)}
            backdropVariants={backdropVariants}
            modalVariants={modalVariants}
            transition={transition}
            apiToken={apiToken}
            setApiToken={setApiToken}
            handleDeploy={handleDeploy}
            deploying={deploying}
            deployError={deployError}
          />
        )}

        {showRevokeWarning && (
          <RevokeWarningModal 
            onClose={() => setShowRevokeWarning(false)}
            backdropVariants={backdropVariants}
            modalVariants={modalVariants}
            transition={transition}
            shareLinks={shareLinks}
            onConfirmRevoke={async () => {
              await revokeAllLinks();
              await saveShareSettings({ enabled: false, mode: shareMode, cf_worker_url: cfWorkerUrl });
              setShareEnabled(false);
              setShowRevokeWarning(false);
            }}
            onConfirmKeep={async () => {
              await saveShareSettings({ enabled: false, mode: shareMode, cf_worker_url: cfWorkerUrl });
              setShareEnabled(false);
              setShowRevokeWarning(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
