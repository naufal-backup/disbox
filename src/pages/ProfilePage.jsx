import { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/useAppHook.js';
import { Edit2, Trash2, Key, AlertCircle, Eye, EyeOff, HardDrive, FileText, Plus, Loader2, CheckCircle, ShieldCheck, Info, Activity, Globe } from 'lucide-react';
import { ConfirmModal } from '../components/FolderModal.jsx';
import styles from './ProfilePage.module.css';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { BASE_API } from '../utils/disbox.js';

const DISCORD_WEBHOOK_REGEX = /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/.+$/;

export default function ProfilePage() {
  const { savedWebhooks, updateWebhookLabel, removeWebhook, addWebhook, t, animationsEnabled, files, uiScale } = useApp();
  const [editingWebhook, setEditingWebhook] = useState(null); // { url, label }
  const [newLabel, setNewLabel] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // url
  const [visibleWebhooks, setVisibleWebhooks] = useState({}); // { url: boolean }
  
  // Add Webhook States
  const [showAddModal, setShowAddModal] = useState(false);
  const [addUrl, setAddUrl] = useState('');
  const [addName, setAddName] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState(null); // 'valid' | 'invalid' | null

  const stats = useMemo(() => {
    const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
    const totalFiles = files.length;
    
    const formatSize = (bytes) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return {
      size: formatSize(totalSize),
      count: totalFiles
    };
  }, [files]);

  const toggleWebhookVisibility = (url) => {
    setVisibleWebhooks(prev => ({ ...prev, [url]: !prev[url] }));
  };

  const handleEditClick = (webhook) => {
    setEditingWebhook(webhook);
    setNewLabel(webhook.label);
  };

  const handleSaveLabel = () => {
    if (!newLabel.trim()) return;
    updateWebhookLabel(editingWebhook.url, newLabel.trim());
    setEditingWebhook(null);
    toast.success('Label updated');
  };

  const handleDelete = () => {
    removeWebhook(confirmDelete);
    setConfirmDelete(null);
    toast.success('Webhook removed');
  };

  const handleVerifyAndAdd = async () => {
    const url = addUrl.trim();
    if (!DISCORD_WEBHOOK_REGEX.test(url)) {
      setVerifyStatus('invalid');
      toast.error('Format URL tidak valid');
      return;
    }

    setIsVerifying(true);
    setVerifyStatus(null);
    
    try {
      // Pengecekan real ke Discord via Electron fetch
      const res = await window.electron.fetch(url);
      if (res.ok) {
        setVerifyStatus('valid');
        addWebhook(url, addName.trim() || "Webhook #" + url.split('/').pop().slice(-6));
        toast.success(t('webhook_valid'));
        setShowAddModal(false);
        setAddUrl('');
        setAddName('');
        setVerifyStatus(null);
      } else {
        setVerifyStatus('invalid');
        toast.error(t('webhook_invalid'));
      }
    } catch (e) {
      setVerifyStatus('invalid');
      toast.error('Gagal menghubungi server Discord');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2>{t('profile') || 'Profile'}</h2>
      </header>

      <div className={styles.content}>
        {/* Storage Stats Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('storage')}</h3>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(88, 101, 242, 0.1)', color: 'var(--accent)' }}>
                <HardDrive size={20} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>{t('storage')}</span>
                <span className={styles.statValue}>{stats.size}</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <FileText size={20} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>{t('total_files')}</span>
                <span className={styles.statValue}>{stats.count}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── CLOUD SAVE SECTION ─── */}
        <CloudSaveSection />

        {/* System Info Section */}
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>{t('about_disbox') || 'About Disbox'}</h3>
          <AboutCard t={t} />
        </div>

        <div className={styles.section}>
          <WorkerUsageCard />
        </div>

        {/* Hanya tampilkan history jika TIDAK sedang dalam mode Cloud Account */}
        {!localStorage.getItem('dbx_username') && (
          <div className={styles.section}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
                {t('saved_webhooks')}
              </h3>
              <button className={styles.addBtn} onClick={() => setShowAddModal(true)}>
                <Plus size={16} />
                <span>{t('add_webhook')}</span>
              </button>
            </div>
            
            {savedWebhooks.length === 0 ? (
              <div className={styles.emptyState}>
                <Key className={styles.emptyIcon} size={40} />
                <p>{t('no_saved_webhooks')}</p>
              </div>
            ) : (
              <div className={styles.list}>
                <AnimatePresence>
                  {savedWebhooks.map((webhook, idx) => {
                    const isVisible = visibleWebhooks[webhook.url];
                    return (
                      <motion.div
                        key={webhook.url}
                        initial={animationsEnabled ? { opacity: 0, y: 10 } : false}
                        animate={{ opacity: 1, y: 0 }}
                        exit={animationsEnabled ? { opacity: 0, scale: 0.95 } : false}
                        transition={animationsEnabled ? { duration: 0.2, delay: idx * 0.05 } : { duration: 0 }}
                        className={styles.card}
                      >
                        <div className={styles.cardMain}>
                          <div className={styles.cardLabel}>{webhook.label}</div>
                          <div className={styles.cardUrl + (isVisible ? '' : ' ' + styles.blurred)}>
                            {webhook.url}
                          </div>
                        </div>
                        <div className={styles.cardActions}>
                          <button 
                            className={styles.actionBtn} 
                            onClick={() => toggleWebhookVisibility(webhook.url)}
                            title={isVisible ? 'Hide URL' : 'Show URL'}
                          >
                            {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                          <button 
                            className={styles.actionBtn} 
                            onClick={() => handleEditClick(webhook)}
                            title="Edit Name"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            className={styles.actionBtn + ' ' + styles.danger} 
                            onClick={() => setConfirmDelete(webhook.url)}
                            title="Remove"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.modalOverlay} style={{ zIndex: 2000 }}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className={styles.modal}>
              <h3>{t('add_webhook')}</h3>
              <div className={styles.formGroup}>
                <label>Webhook URL</label>
                <input 
                  className={styles.input + (verifyStatus === 'invalid' ? ' ' + styles.inputError : '') + (verifyStatus === 'valid' ? ' ' + styles.inputValid : '')}
                  value={addUrl}
                  onChange={e => { setAddUrl(e.target.value); setVerifyStatus(null); }}
                  placeholder="https://discord.com/api/webhooks/123456/abcdef..."
                  autoFocus
                />
              </div>
              <div className={styles.formGroup}>
                <label>{t('display_name')} (Optional)</label>
                <input className={styles.input} value={addName} onChange={e => setAddName(e.target.value)} placeholder={t('webhook_name_placeholder')} />
              </div>

              {isVerifying && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--accent)', marginBottom: 16 }}><Loader2 size={14} className="spin" /><span>{t('verifying_webhook')}</span></div>}
              {verifyStatus === 'valid' && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#10b981', marginBottom: 16 }}><CheckCircle size={14} /><span>{t('webhook_valid')}</span></div>}

              <div className={styles.modalActions}>
                <button className={styles.modalBtn + ' ' + styles.btnCancel} onClick={() => setShowAddModal(false)} disabled={isVerifying}>{t('cancel')}</button>
                <button className={styles.modalBtn + ' ' + styles.btnConfirm} onClick={handleVerifyAndAdd} disabled={!addUrl.trim() || isVerifying}>{isVerifying ? t('verifying') : t('confirm')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {editingWebhook && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.modalOverlay} style={{ zIndex: 2000 }}>
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }} className={styles.modal}>
              <h3>{t('edit_webhook')}</h3>
              <div className={styles.formGroup}>
                <label>{t('display_name')}</label>
                <input className={styles.input} value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder={t('webhook_name_placeholder')} autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveLabel()} />
              </div>
              <div className={styles.modalActions}>
                <button className={styles.modalBtn + ' ' + styles.btnCancel} onClick={() => setEditingWebhook(null)}>{t('cancel')}</button>
                <button className={styles.modalBtn + ' ' + styles.btnConfirm} onClick={handleSaveLabel} disabled={!newLabel.trim()}>{t('save')}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {confirmDelete && (
        <ConfirmModal title={t('remove_webhook')} message={t('remove_webhook_desc')} danger={true} onConfirm={handleDelete} onClose={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

function CloudSaveSection() {
  const { webhookUrl, api, files, t } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const currentAccount = localStorage.getItem('dbx_username');

  const handleRegister = async (e) => {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      const currentId = api?.lastSyncedId || localStorage.getItem("dbx_last_sync_" + api?.hashedWebhook);
      const res = await window.electron.fetch(`${BASE_API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, webhook_url: webhookUrl, last_msg_id: currentId })
      });
      const data = JSON.parse(res.body);
      if (res.ok && data.ok) {
        setStatus({ type: 'success', msg: 'Akun terdaftar!' });
        localStorage.setItem('dbx_username', username.trim().toLowerCase());
        if (api && files.length > 0) await api.persistCloud(files);
      } else {
        setStatus({ type: 'error', msg: data.error || 'Gagal mendaftar.' });
      }
    } catch (e) {
      setStatus({ type: 'error', msg: 'Gagal menghubungi server.' });
    } finally { setBusy(false); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      const res = await window.electron.fetch(`${BASE_API}/api/auth/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_username: currentAccount, new_username: username.trim() || currentAccount, new_password: password || null })
      });
      const data = JSON.parse(res.body);
      if (res.ok && data.ok) {
        setStatus({ type: 'success', msg: 'Akun berhasil diperbarui!' });
        localStorage.setItem('dbx_username', data.username);
        setTimeout(() => { setIsEditing(false); setStatus(null); }, 2000);
      } else {
        setStatus({ type: 'error', msg: data.error || 'Gagal memperbarui.' });
      }
    } catch (e) {
      setStatus({ type: 'error', msg: 'Gagal memperbarui profil.' });
    } finally { setBusy(false); }
  };

  if (currentAccount && !isEditing) {
    return (
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{t('security')}</h3>
        <div className={styles.cloudBadge} style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ShieldCheck size={20} color="#10b981" />
            <span>{t('connected_as')}: <strong>@{currentAccount}</strong></span>
          </div>
          <button onClick={() => { setIsEditing(true); setUsername(currentAccount); }} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer', color: 'var(--text-secondary)' }}>{t('edit_account')}</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>{currentAccount ? t('edit_account') : t('cloud_save')}</h3>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        {currentAccount ? t('edit_account_hint') : t('register_hint')}
      </p>
      <form onSubmit={currentAccount ? handleUpdate : handleRegister} className={styles.cloudForm}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input type="text" placeholder={t('username')} className={styles.input} style={{ flex: 1, minWidth: '150px' }} value={username} onChange={e => setUsername(e.target.value)} required={!currentAccount} />
          <input type="password" placeholder={currentAccount ? t('new_password_optional') : t('password')} className={styles.input} style={{ flex: 1, minWidth: '150px' }} value={password} onChange={e => setPassword(e.target.value)} required={!currentAccount} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className={styles.saveBtn} disabled={busy} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '12px', padding: '0 16px', fontWeight: '600', cursor: 'pointer' }}>{busy ? '...' : (currentAccount ? t('save') : t('register'))}</button>
            {isEditing && <button type="button" onClick={() => setIsEditing(false)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: '12px', padding: '0 12px', cursor: 'pointer' }}>{t('cancel')}</button>}
          </div>

        </div>
        {status && <div style={{ marginTop: '10px', fontSize: '12px', color: status.type === 'success' ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertCircle size={14} /> {status.msg}</div>}
      </form>
    </div>
  );
}

function AboutCard({ t }) {
  return (
    <div className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '12px', minHeight: '160px', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className={styles.statIcon} style={{ background: 'rgba(88, 101, 242, 0.1)', color: 'var(--accent)' }}>
          <Info size={20} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px' }}>Disbox Desktop</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>v4.9.3 Stable</div>
        </div>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5', margin: 0 }}>
        {t('about_desc') || 'Discord-based cloud storage with AES-GCM encryption.'}
      </p>
      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
        <button 
          onClick={() => window.open('https://github.com/naufal-backup/disbox-linux', '_blank')}
          className={styles.actionBtn} 
          style={{ flex: 1, fontSize: '11px', padding: '6px' }}
        >
          GitHub
        </button>
        <button 
          onClick={() => window.open('https://disbox.naufal.dev', '_blank')}
          className={styles.actionBtn} 
          style={{ flex: 1, fontSize: '11px', padding: '6px' }}
        >
          Website
        </button>
      </div>
    </div>
  );
}

function WorkerUsageCard() {
  const { cfWorkerUrl, t } = useApp();
  const [workerUsage, setWorkerUsage] = useState({});
  const [loading, setLoading] = useState(true);

  const PUBLIC_WORKERS = [
    { label: 'Disbox Public #1 (Main)', url: 'https://disbox-shared-link.naufal-backup.workers.dev' },
    { label: 'Disbox Public #2 (New)', url: 'https://disbox-shared-link.alamsyahnaufal453.workers.dev' },
    { label: 'Disbox Public #3', url: 'https://disbox-worker-2.naufal-backup.workers.dev' },
    { label: 'Disbox Public #4', url: 'https://disbox-worker-3.naufal-backup.workers.dev' },
  ];

  // Include user's worker if exists
  const allWorkers = cfWorkerUrl ? [{ label: 'My Worker', url: cfWorkerUrl }, ...PUBLIC_WORKERS] : PUBLIC_WORKERS;

  useEffect(() => {
    let isMounted = true;
    const fetchUsage = async () => {
      setLoading(true);
      const results = {};
      await Promise.all(allWorkers.map(async (worker) => {
        try {
          const res = await window.electron.fetch(`${worker.url.replace(/\/+$/, '')}/share/stats`);
          if (res.ok && isMounted) {
            results[worker.url] = JSON.parse(res.body);
          }
        } catch (e) {}
      }));
      if (isMounted) {
        setWorkerUsage(results);
        setLoading(false);
      }
    };

    fetchUsage();
    const interval = setInterval(fetchUsage, 60000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [cfWorkerUrl]);

  return (
    <div className={styles.statCard} style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '300px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
          <Activity size={20} />
        </div>
        <h3 className={styles.sectionTitle} style={{ margin: 0, fontSize: '14px' }}>Worker Usage</h3>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {allWorkers.map(worker => (
          <div key={worker.url} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{worker.label}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {worker.url.replace('https://', '')}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', marginLeft: '12px' }}>
              {workerUsage[worker.url] ? (
                <>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-primary)' }}>{workerUsage[worker.url].links} links</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{workerUsage[worker.url].requests} reqs</span>
                </>
              ) : loading ? (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>...</span>
              ) : (
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Offline</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
