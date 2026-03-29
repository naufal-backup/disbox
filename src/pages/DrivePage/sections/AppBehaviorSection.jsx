import { motion } from 'framer-motion';
import { useApp } from '@/AppContext.jsx';
import { Toggle } from './Common.jsx';
import styles from '../DrivePage.module.css';

export function AppBehaviorSection({ itemVariants, setShowAppLockModal, activeHelp, setActiveHelp }) {
  const {
    showPreviews, setShowPreviews,
    showImagePreviews, setShowImagePreviews,
    showVideoPreviews, setShowVideoPreviews,
    showRecent,
    autoCloseTransfers,
    animationsEnabled, setAnimationsEnabled,
    closeToTray, startMinimized, updatePrefs,
    appLockEnabled, setAppLockEnabled,
    appLockPin, t
  } = useApp();

  return (
    <motion.div variants={itemVariants} className={styles.settingsSection}>
      <h3 className={styles.sectionTitle}>{t('app_behavior')}</h3>
      <Toggle label={t('close_to_tray')} value={closeToTray} onChange={v => updatePrefs({ closeToTray: v })} description={t('close_to_tray_desc')} helpKey="close_to_tray" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
      <Toggle label={t('start_minimized')} value={startMinimized} onChange={v => updatePrefs({ startMinimized: v })} description={t('start_minimized_desc')} helpKey="start_minimized" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
      <Toggle label={t('previews')} value={showPreviews} onChange={v => updatePrefs({ showPreviews: v })} description={t('previews_desc')} helpKey="previews" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
      {showPreviews && (
        <div style={{ marginLeft: 24, borderLeft: '2px solid var(--border)', paddingLeft: 16 }}>
          <Toggle label={t('image_previews')} value={showImagePreviews} onChange={v => updatePrefs({ showImagePreviews: v })} description={t('image_previews_desc')} helpKey="image_previews" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
          <Toggle label={t('video_previews')} value={showVideoPreviews} onChange={v => updatePrefs({ showVideoPreviews: v })} description={t('video_previews_desc')} helpKey="video_previews" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
        </div>
      )}
      <Toggle label={t('auto_close')} value={autoCloseTransfers} onChange={v => updatePrefs({ autoCloseTransfers: v })} description={t('auto_close_desc')} helpKey="auto_close" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
      <Toggle label={t('animations')} value={animationsEnabled} onChange={v => setAnimationsEnabled(v)} description={t('animations_desc')} helpKey="animations" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
      <Toggle label={t('show_recent')} value={showRecent} onChange={v => updatePrefs({ showRecent: v })} description={t('show_recent_desc')} helpKey="show_recent" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
      <Toggle
        label={t('app_lock')}
        value={appLockEnabled}
        onChange={v => {
          if (v && !appLockPin) { setShowAppLockModal('set'); return; }
          setAppLockEnabled(v);
        }}
        description={t('app_lock_desc')}
        helpKey="app_lock"
        activeHelp={activeHelp}
        setActiveHelp={setActiveHelp}
        t={t}
      />
      {appLockEnabled && (
        <div style={{ marginLeft: 24, marginBottom: 16 }}>
          <button
            onClick={() => setShowAppLockModal('change')}
            className={styles.secondaryBtn}
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            {t('change_pin')} (Local)
          </button>
        </div>
      )}
    </motion.div>
  );
}
