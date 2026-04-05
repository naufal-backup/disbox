import { useState, useEffect, useRef } from 'react';
import { 
  Shield, AlertCircle, RefreshCw, Check
} from 'lucide-react';
import { useApp } from '../../context/useAppHook.js';
import { ShareSettingsSection } from '../../components/ShareSettingsSection.jsx';
import WorkerUsageCard from './WorkerUsageCard.jsx';
import styles from '../DrivePage.module.css';
import { motion, AnimatePresence } from 'framer-motion';

import PinSettingsModal from './PinSettingsModal.jsx';
import AppLockSettingsModal from './AppLockSettingsModal.jsx';

export default function SettingsPanel({ onNavigate }) {
  const {
    uiScale, setUiScale, chunkSize, setChunkSize,
    showPreviews, setShowPreviews,
    showImagePreviews, setShowImagePreviews,
    showVideoPreviews, setShowVideoPreviews,
    showAudioPreviews, setShowAudioPreviews,
    showRecent,
    autoCloseTransfers,
    animationsEnabled, setAnimationsEnabled,
    hideSyncOverlay,
    closeToTray, startMinimized, chunksPerMessage, updatePrefs,
    appLockEnabled, setAppLockEnabled,
    appLockPin, setAppLockPin,
    shareEnabled, shareLinks,
    hasPin, pinExists, setPinExists, setPin, removePin, verifyPin,
    language, setLanguage, t, api,
    theme, setTheme
  } = useApp();

  const themes = [
    { id: 'dark', label: 'Dark', colors: ['#0a0a15', '#5865f2'] },
    { id: 'light', label: 'Light', colors: ['#f0f2f5', '#5865f2'] },
    { id: 'grayscale', label: 'Grayscale', colors: ['#212529', '#9ea4b0'] },
    { id: 'colorful', label: 'Colorful', colors: ['#1a3a52', '#f9f871'] }
  ];

  const [showPinModal, setShowPinModal] = useState(null);
  const [showAppLockModal, setShowAppLockModal] = useState(null);
  const [currentVersion, setCurrentVersion] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [activeHelp, setActiveHelp] = useState(null);
  const [isPinLoaded, setIsPinLoaded] = useState(!!api);

  useEffect(() => {
    const fetchVersions = async () => {
      if (window.electron?.getVersion) {
        const v = await window.electron.getVersion();
        setCurrentVersion('v' + v);
        try {
          const res = await fetch('https://api.github.com/repos/naufal-backup/disbox-linux/releases/latest');
          if (res.ok) {
            const data = await res.json();
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

  const CHUNK_OPTIONS = [
    { label: 'Free (8MB)', value: 7.5 * 1024 * 1024, desc: t('chunk_free_desc') },
    { label: 'Nitro (25MB)', value: 24.5 * 1024 * 1024, desc: t('chunk_nitro_desc') },
    { label: 'Nitro Premium (500MB)', value: 499 * 1024 * 1024, desc: t('chunk_premium_desc') }
  ];

  const InfoIcon = ({ helpKey }) => {
    const isOpen = activeHelp === helpKey;
    const triggerRef = useRef(null);
    const [verticalPos, setVerticalPos] = useState('top');
    const [bubbleStyle, setBubbleStyle] = useState({ left: '50%', transform: 'translateX(-50%)', width: 260 });
    const [arrowStyle, setArrowStyle] = useState({ left: '50%' });

    useEffect(() => {
      if (isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const width = 260; const padding = 20; const halfWidth = width / 2;
        let newLeft = '50%'; let newTransform = 'translateX(-50%)';
        let newArrowLeft = '50%'; let newRight = 'auto'; let newVertical = 'top';
        if (rect.top < 120) newVertical = 'bottom';
        if (rect.left < halfWidth + padding) {
          newLeft = `-${rect.left - padding}px`; newTransform = 'none';
          newArrowLeft = `${rect.left - padding + 10}px`;
        } else if (window.innerWidth - rect.right < halfWidth + padding) {
          newLeft = 'auto'; newRight = `-${window.innerWidth - rect.right - padding}px`;
          newTransform = 'none'; newArrowLeft = `calc(100% - ${window.innerWidth - rect.right - padding + 10}px)`;
        }
        setVerticalPos(newVertical);
        setBubbleStyle({
          left: newLeft, right: newRight, transform: newTransform, width,
          top: newVertical === 'bottom' ? 'calc(100% + 12px)' : 'auto',
          bottom: newVertical === 'top' ? 'calc(100% + 12px)' : 'auto'
        });
        setArrowStyle({ left: newArrowLeft });
      }
    }, [isOpen]);

    return (
      <div className="help-trigger" style={{ position: 'relative', display: 'inline-flex' }}>
        <button
          ref={triggerRef}
          onClick={() => setActiveHelp(isOpen ? null : helpKey)}
          style={{
            background: 'transparent', border: 'none', padding: 4, cursor: 'pointer',
            color: isOpen ? 'var(--accent-bright)' : 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '50%', transition: 'all 0.2s', marginLeft: 6
          }}
        >
          <AlertCircle size={14} />
        </button>
        {isOpen && (
          <div style={{
            position: 'absolute', ...bubbleStyle,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)',
            borderRadius: 14, padding: '12px 16px', boxShadow: 'var(--shadow-lg)',
            zIndex: 1000, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6,
            textAlign: 'left', pointerEvents: 'auto'
          }}>
            {t(helpKey + '_help')}
            {verticalPos === 'top' ? (
              <div style={{
                position: 'absolute', top: '100%', ...arrowStyle, marginLeft: -8,
                borderWidth: 8, borderStyle: 'solid',
                borderColor: 'var(--border-bright) transparent transparent transparent'
              }} />
            ) : (
              <div style={{
                position: 'absolute', bottom: '100%', ...arrowStyle, marginLeft: -8,
                borderWidth: 8, borderStyle: 'solid',
                borderColor: 'transparent transparent var(--border-bright) transparent'
              }} />
            )}
          </div>
        )}
      </div>
    );
  };

  const Toggle = ({ label, value, onChange, description, helpKey }) => (
    <div className={styles.toggleWrapper}>
      <div className={styles.toggleHeader}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <p className={styles.toggleLabel}>{label}</p>
            {helpKey && <InfoIcon helpKey={helpKey} />}
          </div>
          <p className={styles.toggleDesc}>{description}</p>
        </div>
        <label className={styles.toggleSwitch}>
          <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className={styles.toggleInput} />
          <span className={styles.toggleSlider}><span className={styles.toggleCircle} /></span>
        </label>
      </div>
    </div>
  );

  return (
    <motion.div
      initial="initial" animate="animate"
      variants={animationsEnabled ? containerVariants : {}}
      className={styles.settingsPanel}
    >
      <motion.h2 variants={itemVariants} className={styles.settingsTitle}>{t('settings')}</motion.h2>
      <div className={styles.settingsGrid}>
        <div className={styles.settingsLeft}>

          {/* Theme */}
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>{t('theme')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              {themes.map(th => (
                <button
                  key={th.id}
                  onClick={() => setTheme(th.id)}
                  className={styles.langBtn}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: '8px', padding: '12px',
                    borderColor: theme === th.id ? 'var(--accent)' : 'var(--border)',
                    background: theme === th.id ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                    position: 'relative', overflow: 'hidden'
                  }}
                >
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {th.colors.map((c, i) => (
                      <div key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: '1px solid rgba(255,255,255,0.1)' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: theme === th.id ? 'var(--accent-bright)' : 'var(--text-primary)' }}>
                    {th.label}
                  </span>
                  {theme === th.id && (
                    <div style={{
                      position: 'absolute', top: 0, right: 0, width: 0, height: 0,
                      borderStyle: 'solid', borderWidth: '0 20px 20px 0',
                      borderColor: `transparent var(--accent) transparent transparent`
                    }} />
                  )}
                </button>
              ))}
            </div>
          </motion.div>

          {/* Language */}
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>{t('language')}</h3>
            <div className={styles.languageGrid}>
              {[{ code: 'id', label: 'Indonesia' }, { code: 'en', label: 'English' }, { code: 'zh', label: '中国 (China)' }].map(lang => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={`${styles.langBtn} ${language === lang.code ? styles.active : ''}`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </motion.div>

          {/* App Behavior */}
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>{t('app_behavior')}</h3>
            <Toggle label={t('close_to_tray')} value={closeToTray} onChange={v => updatePrefs({ closeToTray: v })} description={t('close_to_tray_desc')} helpKey="close_to_tray" />
            <Toggle label={t('start_minimized')} value={startMinimized} onChange={v => updatePrefs({ startMinimized: v })} description={t('start_minimized_desc')} helpKey="start_minimized" />
            <Toggle label={t('previews')} value={showPreviews} onChange={v => updatePrefs({ showPreviews: v })} description={t('previews_desc')} helpKey="previews" />
            {showPreviews && (
              <div style={{ marginLeft: 24, borderLeft: '2px solid var(--border)', paddingLeft: 16 }}>
                <Toggle label={t('image_previews')} value={showImagePreviews} onChange={v => updatePrefs({ showImagePreviews: v })} description={t('image_previews_desc')} helpKey="image_previews" />
                <Toggle label={t('video_previews')} value={showVideoPreviews} onChange={v => updatePrefs({ showVideoPreviews: v })} description={t('video_previews_desc')} helpKey="video_previews" />
                <Toggle label={t('audio_previews')} value={showAudioPreviews} onChange={v => updatePrefs({ showAudioPreviews: v })} description={t('audio_previews_desc')} helpKey="audio_previews" />
              </div>
            )}
            <Toggle label={t('auto_close')} value={autoCloseTransfers} onChange={v => updatePrefs({ autoCloseTransfers: v })} description={t('auto_close_desc')} helpKey="auto_close" />
            <Toggle label={t('animations')} value={animationsEnabled} onChange={v => setAnimationsEnabled(v)} description={t('animations_desc')} helpKey="animations" />
            <Toggle label={t('hide_sync_overlay') || 'Hide Sync Overlay'} value={hideSyncOverlay} onChange={v => updatePrefs({ hideSyncOverlay: v })} description={t('hide_sync_overlay_desc') || 'Hide sync indicator overlay.'} helpKey="hide_sync_overlay" />
            <Toggle label={t('show_recent')} value={showRecent} onChange={v => updatePrefs({ showRecent: v })} description={t('show_recent_desc')} helpKey="show_recent" />
            <Toggle
              label={t('app_lock')}
              value={appLockEnabled}
              onChange={v => {
                if (v && !appLockPin) { setShowAppLockModal('set'); return; }
                setAppLockEnabled(v);
              }}
              description={t('app_lock_desc')}
              helpKey="app_lock"
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

          {/* Share */}
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>Share & Privacy</h3>
            <ShareSettingsSection />
          </motion.div>

          {/* Security / PIN */}
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{t('security')}</h3>
              <InfoIcon helpKey="security" />
            </div>
            <div className={styles.pinManagementRow}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Master PIN</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {!isPinLoaded ? t('loading') : (pinExists ? t('pin_active') : t('pin_not_set_security'))}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!isPinLoaded ? (
                  <div className="pulse" style={{ width: 80, height: 28, background: 'var(--bg-elevated)', borderRadius: 6, opacity: 0.5 }} />
                ) : !pinExists ? (
                  <button
                    onClick={() => setShowPinModal('set')}
                    style={{
                      background: 'var(--accent)', border: 'none', borderRadius: 6,
                      color: 'var(--text-on-accent)', fontSize: 12, fontWeight: 600,
                      padding: '6px 12px', cursor: 'pointer'
                    }}
                  >
                    {t('set_pin')}
                  </button>
                ) : (
                  <>
                    <button onClick={() => setShowPinModal('change')} className={styles.secondaryBtn}>{t('change_pin')}</button>
                    <button onClick={() => setShowPinModal('remove')} className={styles.dangerBtn}>{t('remove_pin')}</button>
                  </>
                )}
              </div>
            </div>
          </motion.div>

          {/* UI Scale */}
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{t('ui_scale')}</h3>
              <InfoIcon helpKey="ui_scale" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input
                type="range" min="0.8" max="1.3" step="0.05" value={uiScale}
                onChange={e => setUiScale(parseFloat(e.target.value))}
                className={styles.sliderInput}
              />
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', minWidth: 40, color: 'var(--accent-bright)' }}>
                {(uiScale * 100).toFixed(0)}%
              </span>
              <button onClick={() => setUiScale(1)} className={styles.resetBtn}>{t('reset')}</button>
            </div>
          </motion.div>

          {/* Chunk Size */}
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{t('chunk_size')}</h3>
              <InfoIcon helpKey="chunk_size" />
            </div>
            <div style={{ padding: '0 10px' }}>
              <input
                type="range" min="0" max="2" step="1"
                value={CHUNK_OPTIONS.findIndex(opt => opt.value === chunkSize) === -1 ? 1 : CHUNK_OPTIONS.findIndex(opt => opt.value === chunkSize)}
                onChange={e => setChunkSize(CHUNK_OPTIONS[parseInt(e.target.value)].value)}
                className={styles.sliderInput}
                style={{ width: '100%', display: 'block' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, position: 'relative', height: 14 }}>
                {CHUNK_OPTIONS.map((opt, i) => {
                  const isActive = i === CHUNK_OPTIONS.findIndex(o => o.value === chunkSize);
                  return (
                    <span key={i} style={{
                      fontSize: 11,
                      color: isActive ? 'var(--accent-bright)' : 'var(--text-muted)',
                      fontWeight: isActive ? 700 : 400,
                      position: 'absolute',
                      left: i === 0 ? '0%' : i === 1 ? '50%' : '100%',
                      transform: i === 0 ? 'none' : i === 1 ? 'translateX(-50%)' : 'translateX(-100%)',
                      transition: 'all 0.2s ease', whiteSpace: 'nowrap'
                    }}>
                      {opt.label.split(' ')[0]}
                    </span>
                  );
                })}
              </div>
            </div>
            {CHUNK_OPTIONS.find(opt => opt.value === chunkSize) && (
              <div className={styles.chunkInfo} style={{ marginTop: 24 }}>
                <p style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>
                  {CHUNK_OPTIONS.find(opt => opt.value === chunkSize).label}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {CHUNK_OPTIONS.find(opt => opt.value === chunkSize).desc}
                </p>
              </div>
            )}

            <div style={{ margin: '24px 0', borderTop: '1px solid var(--border)', opacity: 0.5 }} />

            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{t('chunks_per_message')}</h3>
              <InfoIcon helpKey="chunks_per_message" />
            </div>
            <div style={{ padding: '0 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                <input
                  type="range" min="1" max="10" step="1"
                  value={chunksPerMessage}
                  onChange={e => updatePrefs({ chunksPerMessage: parseInt(e.target.value) || 1 })}
                  className={styles.sliderInput} style={{ flex: 1 }}
                />
                <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent-bright)', fontWeight: 700, minWidth: 24, textAlign: 'right' }}>
                  {chunksPerMessage}
                </span>
              </div>
              <div className={styles.chunkInfo}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {t('chunks_per_message_desc') || 'Berapa banyak chunk file yang akan dikirim dalam satu pesan Discord (1-10).'}
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right column */}
        <div>
          <motion.div variants={itemVariants} className={styles.aboutCard}>
            <h3 className={styles.sectionTitle}>{t('about_disbox')}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{t('about_desc')}</p>
            <div style={{
              marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)'
            }}>
              <div>Disbox {latestVersion || 'v3.6.0'}</div>
              <div style={{ marginTop: 4 }}>Created by <b>naufal-backup</b></div>
            </div>
          </motion.div>
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
