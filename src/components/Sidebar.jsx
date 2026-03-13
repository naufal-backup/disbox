import { HardDrive, Upload, Clock, Star, Trash2, Settings, RefreshCw, LogOut, Sun, Moon, Lock } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../AppContext.jsx';
import { ConfirmModal } from './FolderModal.jsx';
import styles from './Sidebar.module.css';

const navItems = [
  { icon: HardDrive,  label: 'My Drive',    id: 'drive' },
  { icon: Clock,      label: 'Recent',       id: 'recent' },
  { icon: Star,       label: 'Starred',      id: 'starred' },
  { icon: Lock,       label: 'Locked',       id: 'locked' },
];

export default function Sidebar({ activePage, onNavigate }) {
  const { disconnect, refresh, loading, files, theme, toggleTheme, showRecent } = useApp();
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

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
          <span>Storage used</span>
          <span className={styles.storageValue}>{formatSizeGB(totalSize)}</span>
        </div>
        <div className={styles.storageBar}>
          <div className={styles.storageFill} style={{ width: '24%' }} />
        </div>
        <span className={styles.storageNote}>Discord Unlimited ∞</span>
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        {navItems.filter(item => item.id !== 'recent' || showRecent).map(({ icon: Icon, label, id }) => (
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
          <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
        <button className={styles.actionBtn} onClick={refresh} disabled={loading}>
          <div className={styles.navIcon}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </div>
          <span>Refresh</span>
        </button>
        <button className={styles.actionBtn} onClick={() => onNavigate('settings')}>
          <div className={styles.navIcon}>
            <Settings size={15} />
          </div>
          <span>Settings</span>
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
