import { useState, useEffect, useRef } from 'react';
import { 
  Menu
} from 'lucide-react';
import Sidebar from '../components/Sidebar.jsx';
import FileGrid from '../components/FileGrid.jsx';
import TransferPanel from '../components/TransferPanel.jsx';
import SharedPage from './SharedPage.jsx';
import ProfilePage from './ProfilePage.jsx';
import CloudSavePage from './CloudSavePage/CloudSavePage.jsx';
import { useApp } from '../context/useAppHook.js';
import styles from './DrivePage.module.css';
import { motion, AnimatePresence } from 'framer-motion';

import LockedGateway from './DrivePage/LockedGateway.jsx';
import SettingsPanel from './DrivePage/SettingsPanel.jsx';

export default function DrivePage({ activePage, onNavigate }) {
  const { 
    isVerified, setIsVerified, setCurrentPath, t, 
    animationsEnabled, isSidebarOpen, setIsSidebarOpen,
    currentTrack
  } = useApp();

  const handleNavigate = (page) => {
    if (page !== activePage) setCurrentPath('/');
    if (activePage === 'locked' && page !== 'locked') setIsVerified(false);
    onNavigate(page);
    setIsSidebarOpen(false);
  };

  const pageVariants = {
    initial: { opacity: 0, y: 5 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -5 }
  };
  const transition = animationsEnabled ? { duration: 0.2 } : { duration: 0 };

  return (
    <div className={styles.layout}>
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className={styles.sidebarOverlay}
          />
        )}
      </AnimatePresence>

      <Sidebar activePage={activePage} onNavigate={handleNavigate} />

      <main className={`${styles.main} ${currentTrack ? styles.hasMusicBar : ''}`}>
        <header className={styles.mobileHeader}>
          <button className={styles.menuBtn} onClick={() => setIsSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <h1 className={styles.mobileTitle}>
            {activePage === 'drive' && t('drive')}
            {activePage === 'recent' && t('recent')}
            {activePage === 'starred' && t('starred')}
            {activePage === 'locked' && t('locked')}
            {activePage === 'shared' && 'Shared'}
            {activePage === 'profile' && t('profile')}
            {activePage === 'settings' && t('settings')}
            {activePage === 'cloud-save' && t('cloud_save')}
          </h1>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            initial="initial" animate="animate" exit="exit"
            variants={pageVariants} transition={transition}
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            {activePage === 'drive' && <FileGrid onNavigate={onNavigate} />}
            {activePage === 'profile' && <ProfilePage />}
            {activePage === 'locked' && (
              isVerified
                ? <FileGrid isLockedView={true} onNavigate={onNavigate} />
                : <LockedGateway onVerified={() => setIsVerified(true)} />
            )}
            {activePage === 'recent' && <FileGrid isRecentView={true} onNavigate={onNavigate} />}
            {activePage === 'starred' && <FileGrid isStarredView={true} onNavigate={onNavigate} />}
            {activePage === 'cloud-save' && <CloudSavePage />}
            {activePage === 'shared' && <SharedPage onNavigateToSettings={() => handleNavigate('settings')} />}
            {activePage === 'settings' && (
              <div className={styles.settingsContainer}>
                <SettingsPanel onNavigate={handleNavigate} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      <TransferPanel activePage={activePage} />
    </div>
  );
}
