import { HardDrive, Clock, Star, Settings, RefreshCw, LogOut, Sun, Moon, Lock, Cloud, Link2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { ConfirmModal } from './FolderModal.jsx';
import styles from './Sidebar.module.css';
import { motion } from 'framer-motion';

export default function Sidebar({ activePage, onNavigate }) {
  const {
    disconnect, refresh, loading, files, theme, toggleTheme,
    showRecent, t, animationsEnabled, cloudSaveEnabled, isSidebarOpen,
    shareEnabled
  } = useApp();
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showSharePopup, setShowSharePopup] = useState(false);

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
        <span className={styles.storageNote}>Discord Unlimited ∞</span>
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
