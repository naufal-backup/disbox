import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/AppContext.jsx';
import { ipc } from '@/utils/ipc';
import { ShareSettingsSection } from '@/components/ShareSettingsSection/ShareSettingsSection.jsx';
import WorkerUsageCard from './WorkerUsageCard.jsx';
import styles from './DrivePage.module.css';

// Modals
import { PinSettingsModal } from './modals/PinSettingsModal.jsx';
import { AppLockSettingsModal } from './modals/AppLockSettingsModal.jsx';

// Sections
import { ThemeSection } from './sections/ThemeSection.jsx';
import { LanguageSection } from './sections/LanguageSection.jsx';
import { AppBehaviorSection } from './sections/AppBehaviorSection.jsx';
import { CloudSaveSection } from './sections/CloudSaveSection.jsx';
import { SecuritySection } from './sections/SecuritySection.jsx';
import { UIScaleSection } from './sections/UIScaleSection.jsx';
import { StorageSection } from './sections/StorageSection.jsx';
import { AboutSection } from './sections/AboutSection.jsx';

export default function SettingsPanel({ onNavigate }) {
  const {
    animationsEnabled,
    hasPin, setPinExists, api,
    t, pinExists
  } = useApp();

  const [showPinModal, setShowPinModal] = useState(null);
  const [showAppLockModal, setShowAppLockModal] = useState(null);
  const [currentVersion, setCurrentVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [activeHelp, setActiveHelp] = useState(null);
  const [isPinLoaded, setIsPinLoaded] = useState(!!api);

  useEffect(() => {
    const fetchVersions = async () => {
      if (ipc?.getVersion) {
        const v = await ipc.getVersion();
        setCurrentVersion('v' + v);
        try {
          const res = await ipc.fetch('https://api.github.com/repos/naufal-backup/disbox-linux/releases/latest');
          if (res.ok) {
            const data = JSON.parse(res.body);
            const latest = data.tag_name;
            setLatestVersion(latest);
            if (latest !== ('v' + v)) setIsUpdateAvailable(true);
          }
        } catch (e) {}
      }
    };
    fetchVersions();
  }, []);

  const containerVariants = { initial: {}, animate: { transition: { staggerChildren: 0.04 } } };
  const itemVariants = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }
  };

  useEffect(() => {
    if (!api) { setIsPinLoaded(false); return; }
    hasPin().then(() => setIsPinLoaded(true));
  }, [api, hasPin]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (activeHelp && !e.target.closest('.help-trigger')) setActiveHelp(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeHelp]);

  return (
    <motion.div
      initial="initial" animate="animate"
      variants={animationsEnabled ? containerVariants : {}}
      className={styles.settingsPanel}
    >
      <motion.h2 variants={itemVariants} className={styles.settingsTitle}>{t('settings')}</motion.h2>
      <div className={styles.settingsGrid}>
        <div className={styles.settingsLeft}>
          <ThemeSection itemVariants={itemVariants} />
          <LanguageSection itemVariants={itemVariants} />
          <AppBehaviorSection
            itemVariants={itemVariants}
            setShowAppLockModal={setShowAppLockModal}
            activeHelp={activeHelp}
            setActiveHelp={setActiveHelp}
          />
          <CloudSaveSection
            itemVariants={itemVariants}
            activeHelp={activeHelp}
            setActiveHelp={setActiveHelp}
          />

          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>Share & Privacy</h3>
            <ShareSettingsSection />
          </motion.div>

          <SecuritySection
            itemVariants={itemVariants}
            isPinLoaded={isPinLoaded}
            pinExists={pinExists}
            setShowPinModal={setShowPinModal}
            activeHelp={activeHelp}
            setActiveHelp={setActiveHelp}
          />
          <UIScaleSection
            itemVariants={itemVariants}
            activeHelp={activeHelp}
            setActiveHelp={setActiveHelp}
          />
          <StorageSection
            itemVariants={itemVariants}
            activeHelp={activeHelp}
            setActiveHelp={setActiveHelp}
          />
        </div>

        <div>
          <AboutSection
            itemVariants={itemVariants}
            latestVersion={latestVersion}
          />
          <motion.div variants={itemVariants}>
            <WorkerUsageCard t={t} />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {showPinModal && (
          <PinSettingsModal mode={showPinModal} onClose={() => { setShowPinModal(null); hasPin().then(setPinExists); }} />
        )}
        {showAppLockModal && (
          <AppLockSettingsModal mode={showAppLockModal} onClose={() => setShowAppLockModal(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
