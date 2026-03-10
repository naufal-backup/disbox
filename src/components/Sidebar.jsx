import { HardDrive, Upload, Clock, Star, Trash2, Settings, RefreshCw, LogOut } from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import styles from './Sidebar.module.css';

const navItems = [
  { icon: HardDrive,  label: 'My Drive',    id: 'drive' },
  { icon: Clock,      label: 'Recent',       id: 'recent' },
  { icon: Star,       label: 'Starred',      id: 'starred' },
  { icon: Trash2,     label: 'Trash',        id: 'trash' },
];

export default function Sidebar({ activePage, onNavigate }) {
  const { disconnect, refresh, loading, files } = useApp();

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
        {navItems.map(({ icon: Icon, label, id }) => (
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
        <button className={styles.actionBtn} onClick={refresh} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
        <button className={styles.actionBtn} onClick={() => onNavigate('settings')}>
          <Settings size={13} />
          <span>Settings</span>
        </button>
        <button className={`${styles.actionBtn} ${styles.danger}`} onClick={disconnect}>
          <LogOut size={13} />
          <span>Disconnect</span>
        </button>
      </div>
    </aside>
  );
}
