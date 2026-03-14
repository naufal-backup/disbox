import { HardDrive, Upload, Clock, Star, Trash2, Settings, RefreshCw, LogOut, Sun, Moon, Lock, Cloud } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { ConfirmModal } from './FolderModal.jsx';
import styles from './Sidebar.module.css';

export default function Sidebar({ activePage, onNavigate }) {
  const { disconnect, refresh, loading, files, theme, toggleTheme, showRecent, t } = useApp();
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const navItems = [
    { icon: HardDrive,  label: t('drive'),    id: 'drive' },
    { icon: Clock,      label: t('recent'),   id: 'recent' },
    { icon: Star,       label: t('starred'),  id: 'starred' },
    { icon: Lock,       label: t('locked'),   id: 'locked' },
    { icon: Cloud,      label: t('cloud_save'), id: 'cloud-save' },
  ];

  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);
  const formatSizeGB = (bytes) => {
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  return (
    <aside className={styles.sidebar}>
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
            if (item.id === 'recent' && !showRecent) return false;
            if (item.id === 'cloud-save' && !useApp().cloudSaveEnabled) return false;
            return true;
          })
          .map(({ icon: Icon, label, id }) => (
          <button
            key={id}
            className={`${styles.navItem} ${activePage === id ? styles.active : ''}`}
            onClick={() => onNavigate(id)}
          >
            <div className={styles.navIcon}>
              <Icon size={15} />
            </div>
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className={styles.divider} />

      {/* Actions */}
      <div className={styles.actions}>
        <button className={styles.actionBtn} onClick={toggleTheme}>
          <div className={styles.navIcon}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </div>
          <span>{theme === 'dark' ? t('light') : t('dark')}</span>
        </button>
        <button className={styles.actionBtn} onClick={refresh} disabled={loading}>
          <div className={styles.navIcon}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </div>
          <span>{t('refresh')}</span>
        </button>
        <button 
          className={`${styles.actionBtn} ${activePage === 'settings' ? styles.active : ''}`} 
          onClick={() => onNavigate('settings')}
        >
          <div className={styles.navIcon}>
            <Settings size={15} />
          </div>
          <span>{t('settings')}</span>
        </button>
        <button 
          className={`${styles.actionBtn} ${styles.danger}`} 
          onClick={() => setShowDisconnectConfirm(true)}
        >
          <div className={styles.navIcon}>
            <LogOut size={15} />
          </div>
          <span>Disconnect</span>
        </button>
      </div>

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
