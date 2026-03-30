import { 
  HardDrive, Clock, Star, Settings, RefreshCw, LogOut, 
  Sun, Moon, Lock, Cloud, Link2, User, Repeat, ChevronRight, Plus, Infinity
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useApp } from '@/AppContext.jsx';
import { ConfirmModal } from '@/components/FolderModal/FolderModal.jsx';
import styles from './Sidebar.module.css';
import { motion, AnimatePresence } from 'framer-motion';

export default function Sidebar({ activePage, onNavigate }) {
  const {
    disconnect, refresh, loading, files, theme, toggleTheme,
    showRecent, t, animationsEnabled, cloudSaveEnabled, isSidebarOpen,
    shareEnabled, savedWebhooks, connect, webhookUrl
  } = useApp();
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showSharePopup, setShowSharePopup] = useState(false);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const switcherRef = useRef(null);

  const handleSharedClick = () => {
    if (!shareEnabled) {
      setShowSharePopup(true);
    } else {
      onNavigate('shared');
    }
  };

  const navItems = [
    { icon: HardDrive, label: t('drive'),      id: 'drive',      alwaysShow: true },
    { icon: Link2,     label: 'Shared',         id: 'shared',     alwaysShow: true, customClick: handleSharedClick },
    { icon: Star,      label: t('starred'),     id: 'starred',    alwaysShow: true },
    { icon: Clock,     label: t('recent'),      id: 'recent',     alwaysShow: false, showKey: 'showRecent' },
    { icon: Lock,      label: t('locked'),      id: 'locked',     alwaysShow: true },
    { icon: Cloud,     label: t('cloud_save'),  id: 'cloud-save', alwaysShow: false, showKey: 'cloudSaveEnabled' },
  ];

  const currentUsername = localStorage.getItem('dbx_username');
  const activeWebhook = savedWebhooks.find(w => w.url === webhookUrl);
  const userLabel = currentUsername ? `@${currentUsername}` : (activeWebhook ? activeWebhook.label : 'Guest User');

  const handleSwitchAccount = async (url) => {
    if (currentUsername) return; 
    if (url === webhookUrl) return;
    setShowSwitcher(false);
    await connect(url);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setShowSwitcher(false);
      }
    };
    if (showSwitcher) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSwitcher]);

  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  const formatSizeGB = (bytes) => {
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const btnVariants = {
    hover: { x: 4 },
    tap: { scale: 0.98 }
  };

  return (
    <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.open : ''}`}>
      {/* Storage indicator */}
      <div className={styles.storage}>
        <div className={styles.storageLabel}>
          <span>{t('storage')}</span>
          <span className={styles.storageValue}>{formatSizeGB(totalSize)}</span>
        </div>
        <span className={styles.storageNote}>Discord Unlimited <Infinity size={11} style={{ verticalAlign: 'middle', marginBottom: 1 }} /></span>
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {navItems
          .filter(item => {
            if (!item.alwaysShow) {
              if (item.showKey === 'showRecent' && !showRecent) return false;
              if (item.showKey === 'cloudSaveEnabled' && !cloudSaveEnabled) return false;
            }
            return true;
          })
          .map(({ icon: Icon, label, id, customClick }) => {
            const isSharedDisabled = id === 'shared' && !shareEnabled;
            return (
              <motion.button
                key={id}
                whileHover={animationsEnabled ? "hover" : ""}
                whileTap={animationsEnabled ? "tap" : ""}
                variants={btnVariants}
                className={`${styles.navItem} ${activePage === id ? styles.active : ''} ${isSharedDisabled ? styles.navItemDisabled : ''}`}
                onClick={() => customClick ? customClick() : onNavigate(id)}
              >
                <div className={styles.navIcon}>
                  <Icon size={15} />
                </div>
                <span>{label}</span>
                {isSharedDisabled && (
                  <Lock size={10} style={{ marginLeft: 'auto', opacity: 0.5, flexShrink: 0 }} />
                )}
              </motion.button>
            );
          })}
      </nav>

      <div className={styles.divider} />

      {/* Profile Section */}
      <div className={styles.userSection} ref={switcherRef}>
        <div className={styles.userBadgeWrapper}>
          <motion.button
            whileHover={animationsEnabled ? { scale: 1.02, x: 2 } : {}}
            whileTap={animationsEnabled ? { scale: 0.98 } : {}}
            className={`${styles.userBadge} ${activePage === 'profile' ? styles.activeUser : ''}`}
            onClick={() => onNavigate('profile')}
          >
            <div className={styles.avatar}>
              <User size={18} />
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{userLabel}</span>
              <span className={styles.userStatus}>{currentUsername ? 'Cloud Account' : 'Online'}</span>
            </div>
          </motion.button>
          
          {!currentUsername && (
            <button 
              className={styles.switchBtn} 
              onClick={(e) => { e.stopPropagation(); setShowSwitcher(!showSwitcher); }}
              title="Switch Account"
            >
              <Repeat size={14} />
            </button>
          )}
        </div>

        <AnimatePresence>
          {showSwitcher && (
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className={styles.switcherPopup}
            >
              <div className={styles.switcherHeader}>
                <span>Switch Webhook</span>
                <button 
                  className={styles.addMiniBtn} 
                  onClick={() => { setShowSwitcher(false); onNavigate('profile'); }}
                  title="Add New Webhook"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className={styles.switcherList}>
                {savedWebhooks.map((webhook) => (
                  <button
                    key={webhook.url}
                    className={`${styles.switcherItem} ${webhook.url === webhookUrl ? styles.switcherItemActive : ''}`}
                    onClick={() => handleSwitchAccount(webhook.url)}
                  >
                    <div className={styles.switcherItemInfo}>
                      <span className={styles.switcherItemLabel}>{webhook.label}</span>
                      <span className={styles.switcherItemUrl}>{webhook.url.split('/').pop().slice(0, 10)}...</span>
                    </div>
                    {webhook.url === webhookUrl && <div className={styles.activeDot} />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={styles.divider} />

      {/* Actions */}
      <div className={styles.actions}>
        <motion.button
          whileHover={animationsEnabled ? "hover" : ""}
          whileTap={animationsEnabled ? "tap" : ""}
          variants={btnVariants}
          className={styles.actionBtn}
          onClick={toggleTheme}
        >
          <div className={styles.navIcon}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </div>
          <span>{theme === 'dark' ? t('light') : t('dark')}</span>
        </motion.button>
        <motion.button
          whileHover={animationsEnabled ? "hover" : ""}
          whileTap={animationsEnabled ? "tap" : ""}
          variants={btnVariants}
          className={styles.actionBtn}
          onClick={refresh}
          disabled={loading}
        >
          <div className={styles.navIcon}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </div>
          <span>{t('refresh')}</span>
        </motion.button>
        <motion.button
          whileHover={animationsEnabled ? "hover" : ""}
          whileTap={animationsEnabled ? "tap" : ""}
          variants={btnVariants}
          className={`${styles.actionBtn} ${activePage === 'settings' ? styles.active : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <div className={styles.navIcon}>
            <Settings size={15} />
          </div>
          <span>{t('settings')}</span>
        </motion.button>
        <motion.button
          whileHover={animationsEnabled ? "hover" : ""}
          whileTap={animationsEnabled ? "tap" : ""}
          variants={btnVariants}
          className={`${styles.actionBtn} ${styles.danger}`}
          onClick={() => setShowDisconnectConfirm(true)}
        >
          <div className={styles.navIcon}>
            <LogOut size={15} />
          </div>
          <span>Disconnect</span>
        </motion.button>
      </div>

      {/* Share disabled popup */}
      {showSharePopup && (
        <div className={styles.sharePopupOverlay} onClick={() => setShowSharePopup(false)}>
          <div className={styles.sharePopup} onClick={e => e.stopPropagation()}>
            <Link2 size={28} style={{ color: 'var(--accent)', marginBottom: 12 }} />
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Aktifkan Fitur Shared?</h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
              Bagikan file ke siapapun via link. Penerima cukup buka link di browser, tanpa perlu install Disbox.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                style={{ flex: 1, padding: '8px 0', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
                onClick={() => setShowSharePopup(false)}
              >
                Batal
              </button>
              <button
                style={{ flex: 1, padding: '8px 0', background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                onClick={() => { setShowSharePopup(false); onNavigate('settings'); }}
              >
                Ke Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {showDisconnectConfirm && (
        <ConfirmModal
          title="Disconnect Session"
          message="Apakah Anda yakin ingin memutus sesi? Semua perubahan metadata yang belum terunggah akan hilang."
          danger={true}
          onConfirm={disconnect}
          onClose={() => setShowDisconnectConfirm(false)}
        />
      )}
    </aside>
  );
}
