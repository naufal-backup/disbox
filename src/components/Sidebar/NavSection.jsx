import { motion } from 'framer-motion';
import { HardDrive, Link2, Star, Clock, Lock, Cloud } from 'lucide-react';
import styles from '../Sidebar.module.css';

export default function NavSection({ 
  activePage, onNavigate, shareEnabled, showRecent, 
  cloudSaveEnabled, animationsEnabled, t, handleSharedClick 
}) {
  const navItems = [
    { icon: HardDrive, label: t('drive'),      id: 'drive',      alwaysShow: true },
    { icon: Link2,     label: 'Shared',         id: 'shared',     alwaysShow: true, customClick: handleSharedClick },
    { icon: Star,      label: t('starred'),     id: 'starred',    alwaysShow: true },
    { icon: Clock,     label: t('recent'),      id: 'recent',     alwaysShow: false, showKey: 'showRecent' },
    { icon: Lock,      label: t('locked'),      id: 'locked',     alwaysShow: true },
    { icon: Cloud,     label: t('cloud_save'),  id: 'cloud-save', alwaysShow: false, showKey: 'cloudSaveEnabled' },
  ];

  const btnVariants = {
    hover: { x: 4 },
    tap: { scale: 0.98 }
  };

  return (
    <nav className={styles.nav}>
      {navItems
        .filter(item => {
          if (!item.alwaysShow) {
            if (item.showKey === 'showRecent' && !showRecent) return false;
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
  );
}
