import { useState, useMemo } from 'react';
import { useApp } from '../AppContext.jsx';
import { User, Edit2, Trash2, Key, AlertCircle, Eye, EyeOff, HardDrive, FileText, Plus, Loader2, CheckCircle } from 'lucide-react';
import { ConfirmModal } from '../components/FolderModal.jsx';
import styles from './ProfilePage.module.css';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const DISCORD_WEBHOOK_REGEX = /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/.+$/;

export default function ProfilePage() {
  const { savedWebhooks, updateWebhookLabel, removeWebhook, t, animationsEnabled, files, connect } = useApp();
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
      // Pengecekan real ke Discord
      const res = await window.electron.fetch(url);
      if (res.ok) {
        setVerifyStatus('valid');
        // Simpan ke list via localStorage (AppContext akan refresh saat dipanggil fungsi connect atau sejenisnya)
        // Disini kita memanggil connect agar dia otomatis tersimpan ke list tanpa harus login
        // Tapi jika kita tidak ingin ganti akun, kita bisa panggil fungsi manual nanti di AppContext
        // Untuk sekarang, kita pakai trick: connect(url) lalu kembali? 
        // Lebih baik kita expose saveWebhookToList di AppContext.
        
        // Kita butuh fungsi ini di AppContext, mari kita asumsikan sudah ada atau kita tambahkan nanti.
        // Update: Saya akan memanggil connect saja agar dia tersimpan, tapi user mungkin tidak mau pindah akun.
        // Jadi saya akan menambahkan fungsi 'addOnly' di AppContext nanti.
        
        // Sementara kita simpan manual ke localStorage agar tidak mengganggu sesi aktif
        const saved = JSON.parse(localStorage.getItem('disbox_saved_webhooks') || '[]');
        if (!saved.some(i => i.url === url)) {
          saved.unshift({ url, label: addName.trim() || `Webhook #${url.split('/').pop().slice(-6)}`, lastUsed: Date.now() });
          localStorage.setItem('disbox_saved_webhooks', JSON.stringify(saved.slice(0, 50)));
          window.dispatchEvent(new Event('storage')); // Trigger update di tab lain jika ada
        }
        
        toast.success(t('webhook_valid'));
        setShowAddModal(false);
        setAddUrl('');
        setAddName('');
        setVerifyStatus(null);
        // Refresh saved webhooks di AppContext dengan memanggil refresh (jika ada) atau biarkan useEffect bekerja
        window.location.reload(); // Quick fix untuk refresh list di AppContext
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
        <div className={styles.section} style={{ marginBottom: '32px' }}>
          <h3 className={styles.sectionTitle}>Account Statistics</h3>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(88, 101, 242, 0.1)', color: 'var(--accent)' }}>
                <HardDrive size={20} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Storage Used</span>
                <span className={styles.statValue}>{stats.size}</span>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon} style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <FileText size={20} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statLabel}>Total Files</span>
                <span className={styles.statValue}>{stats.count}</span>
              </div>
            </div>
          </div>
        </div>

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
              <Key className={styles.emptyIcon} />
              <p>{t('no_saved_webhooks') || 'No saved webhooks found.'}</p>
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
                        <div className={`${styles.cardUrl} ${!isVisible ? styles.blurred : ''}`}>
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
                          className={`${styles.actionBtn} ${styles.danger}`} 
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
      </div>

      {/* Add Webhook Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div 
            initial={animationsEnabled ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={animationsEnabled ? { opacity: 0 } : false}
            className={styles.modalOverlay}
          >
            <motion.div 
              initial={animationsEnabled ? { scale: 0.9, opacity: 0, y: 20 } : false}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={animationsEnabled ? { scale: 0.9, opacity: 0, y: 20 } : false}
              className={styles.modal}
            >
              <h3>{t('add_webhook')}</h3>
              <div className={styles.formGroup}>
                <label>Webhook URL</label>
                <input 
                  className={`${styles.input} ${verifyStatus === 'invalid' ? styles.inputError : ''} ${verifyStatus === 'valid' ? styles.inputValid : ''}`}
                  value={addUrl}
                  onChange={e => { setAddUrl(e.target.value); setVerifyStatus(null); }}
                  placeholder="https://discord.com/api/webhooks/123456/abcdef..."
                  autoFocus
                />
              </div>
              <div className={styles.formGroup}>
                <label>{t('display_name')} (Optional)</label>
                <input 
                  className={styles.input}
                  value={addName}
                  onChange={e => setAddName(e.target.value)}
                  placeholder={t('webhook_name_placeholder')}
                />
              </div>

              <AnimatePresence>
                {isVerifying && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--accent)', marginBottom: 16 }}
                  >
                    <Loader2 size={14} className="spin" />
                    <span>{t('verifying_webhook')}</span>
                  </motion.div>
                )}

                {verifyStatus === 'valid' && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#10b981', marginBottom: 16 }}
                  >
                    <CheckCircle size={14} />
                    <span>{t('webhook_valid')}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className={styles.modalActions}>
                <button 
                  className={`${styles.modalBtn} ${styles.btnCancel}`} 
                  onClick={() => setShowAddModal(false)}
                  disabled={isVerifying}
                >
                  {t('cancel')}
                </button>
                <button 
                  className={`${styles.modalBtn} ${styles.btnConfirm}`} 
                  onClick={handleVerifyAndAdd}
                  disabled={!addUrl.trim() || isVerifying}
                >
                  {isVerifying ? t('verifying') : t('confirm')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingWebhook && (
          <motion.div 
            initial={animationsEnabled ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            exit={animationsEnabled ? { opacity: 0 } : false}
            className={styles.modalOverlay}
          >
            <motion.div 
              initial={animationsEnabled ? { scale: 0.9, opacity: 0, y: 20 } : false}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={animationsEnabled ? { scale: 0.9, opacity: 0, y: 20 } : false}
              className={styles.modal}
            >
              <h3>{t('edit_webhook')}</h3>
              <div className={styles.formGroup}>
                <label>{t('display_name')}</label>
                <input 
                  className={styles.input}
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder={t('webhook_name_placeholder')}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveLabel()}
                />
              </div>
              <div className={styles.modalActions}>
                <button className={`${styles.modalBtn} ${styles.btnCancel}`} onClick={() => setEditingWebhook(null)}>
                  {t('cancel')}
                </button>
                <button 
                  className={`${styles.modalBtn} ${styles.btnConfirm}`} 
                  onClick={handleSaveLabel}
                  disabled={!newLabel.trim()}
                >
                  {t('save')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Delete */}
      {confirmDelete && (
        <ConfirmModal
          title={t('remove_webhook')}
          message={t('remove_webhook_desc')}
          danger={true}
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
