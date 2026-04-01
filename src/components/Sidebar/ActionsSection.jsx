import { motion } from 'framer-motion';
import { Sun, Moon, RefreshCw, Settings, LogOut } from 'lucide-react';
import styles from '../Sidebar.module.css';

export default function ActionsSection({ 
  theme, toggleTheme, refresh, loading, activePage, onNavigate, 
  setShowDisconnectConfirm, animationsEnabled, t 
}) {
  const btnVariants = {
    hover: { x: 4 },
    tap: { scale: 0.98 }
  };

  return (
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
  );
}
