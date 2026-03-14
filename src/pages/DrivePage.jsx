import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { 
  CheckCircle, Cloud, Clock, AlertCircle, RefreshCw, Lock, Shield, 
  Key, Unlock, Menu, X, Activity 
} from 'lucide-react';
import Sidebar from '../components/Sidebar.jsx';
import FileGrid from '../components/FileGrid.jsx';
import TransferPanel from '../components/TransferPanel.jsx';
import CloudSavePage from './CloudSavePage.jsx';
import SharedPage from './SharedPage.jsx';
import { ShareSettingsSection } from '../components/ShareSettingsSection.jsx';
import { useApp } from '../AppContext.jsx';
import styles from './DrivePage.module.css';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

export default function DrivePage({ activePage, onNavigate }) {
  const { isVerified, setIsVerified, hasPin, setCurrentPath, t, animationsEnabled, isSidebarOpen, setIsSidebarOpen } = useApp();
  const [checkingPin, setCheckingPin] = useState(false);

  const handleNavigate = (page) => {
    if (page !== activePage) {
      setCurrentPath('/');
    }
    if (activePage === 'locked' && page !== 'locked') {
      setIsVerified(false);
    }
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className={styles.sidebarOverlay}
          />
        )}
      </AnimatePresence>

      <Sidebar activePage={activePage} onNavigate={handleNavigate} />
      
      <main className={styles.main}>
        <header className={styles.mobileHeader}>
          <button className={styles.menuBtn} onClick={() => setIsSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <h1 className={styles.mobileTitle}>
            {activePage === 'drive' && t('drive')}
            {activePage === 'recent' && t('recent')}
            {activePage === 'starred' && t('starred')}
            {activePage === 'locked' && t('locked')}
            {activePage === 'cloud-save' && t('cloud_save')}
            {activePage === 'shared' && 'Shared'}
            {activePage === 'settings' && t('settings')}
          </h1>
        </header>

        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            initial="initial"
            animate="animate"
            exit="exit"
            variants={pageVariants}
            transition={transition}
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
          >
            {activePage === 'drive' && <FileGrid onNavigate={onNavigate} />}
            {activePage === 'locked' && (
              isVerified ? (
                <FileGrid isLockedView={true} onNavigate={onNavigate} />
              ) : (
                <LockedGateway onVerified={() => setIsVerified(true)} />
              )
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

function LockedGateway({ onVerified }) {
  const { verifyPin, hasPin, t } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pinExists, setPinExists] = useState(true);

  useEffect(() => {
    hasPin().then(setPinExists);
  }, [hasPin]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const ok = await verifyPin(pin);
    if (ok) {
      onVerified();
    } else {
      setError(t('pin_error_wrong'));
      setPin('');
    }
    setLoading(false);
  };

  if (!pinExists) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20 }}>
        <div style={{ background: 'var(--bg-elevated)', padding: 24, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', textAlign: 'center', maxWidth: 400 }}>
          <Lock size={48} style={{ color: 'var(--text-muted)', marginBottom: 16 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{t('pin_not_set')}</h3>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 20 }}>
            {t('pin_not_set_desc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 20 }}>
      <div style={{ background: 'var(--bg-elevated)', padding: 32, borderRadius: 16, border: '1px solid var(--border-bright)', textAlign: 'center', width: '100%', maxWidth: 360, boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}>
        <Shield size={48} style={{ color: 'var(--accent)', marginBottom: 16 }} />
        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{t('locked_area')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24 }}>{t('locked_area_desc')}</p>
        
        <form onSubmit={handleSubmit}>
          <input 
            type="password" 
            placeholder="••••" 
            value={pin}
            onChange={e => setPin(e.target.value)}
            autoFocus
            style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, color: 'white', textAlign: 'center', fontSize: 24, letterSpacing: '0.4em', marginBottom: 12, outline: 'none' }}
          />
          {error && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 16 }}>{error}</p>}
          <button 
            type="submit" 
            disabled={loading || !pin}
            style={{ width: '100%', padding: 14, background: 'var(--accent)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}
          >
            {loading ? t('verifying') : t('unlock_access')}
          </button>
        </form>
      </div>
    </div>
  );
}

function WorkerUsageCard({ t }) {
  const [workerUsage, setWorkerUsage] = useState({});
  const [loading, setLoading] = useState(true);

  const PUBLIC_WORKERS = [
    { label: 'Disbox Public #1 (Main)', url: 'https://disbox-shared-link.naufal-backup.workers.dev' },
    { label: 'Disbox Public #2 (New)', url: 'https://disbox-shared-link.alamsyahnaufal453.workers.dev' },
    { label: 'Disbox Public #3', url: 'https://disbox-worker-2.naufal-backup.workers.dev' },
    { label: 'Disbox Public #4', url: 'https://disbox-worker-3.naufal-backup.workers.dev' },
  ];

  useEffect(() => {
    let isMounted = true;
    const fetchUsage = async () => {
      setLoading(true);
      const results = {};
      
      // Fetch stats for all workers in parallel
      await Promise.all(PUBLIC_WORKERS.map(async (worker) => {
        try {
          const res = await window.electron.fetch(`${worker.url}/share/stats`);
          if (res.ok && isMounted) {
            const data = JSON.parse(res.body);
            results[worker.url] = data; // Store full object { links, requests }
          } else if (isMounted) {
            results[worker.url] = { status: 'Online' };
          }
        } catch (e) {
          if (isMounted) {
            try {
              const ping = await window.electron.fetch(worker.url);
              if (ping.status < 500) results[worker.url] = { status: 'Online' };
            } catch (_) {}
          }
        }
      }));

      if (isMounted) {
        setWorkerUsage(results);
        setLoading(false);
      }
    };

    fetchUsage();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className={styles.aboutCard} style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Activity size={16} style={{ color: 'var(--accent)' }} />
        <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Worker Usage</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PUBLIC_WORKERS.map(worker => (
          <div key={worker.url} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{worker.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{worker.url.replace('https://', '')}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              {workerUsage[worker.url] ? (
                <>
                  {workerUsage[worker.url].links !== undefined && (
                    <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>
                      {workerUsage[worker.url].links} links
                    </span>
                  )}
                  {workerUsage[worker.url].requests !== undefined && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {workerUsage[worker.url].requests} reqs
                    </span>
                  )}
                </>
              ) : loading ? (
                <div className="skeleton" style={{ width: 40, height: 16, borderRadius: 4 }} />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ onNavigate }) {
  const { 
    uiScale, setUiScale, chunkSize, setChunkSize, 
    showPreviews, setShowPreviews,
    showImagePreviews, setShowImagePreviews,
    showVideoPreviews, setShowVideoPreviews,
    showRecent,
    autoCloseTransfers,
    animationsEnabled, setAnimationsEnabled,
    closeToTray, startMinimized, updatePrefs,
    cloudSaveEnabled, setCloudSaveEnabled,
    shareEnabled, shareLinks,
    hasPin, pinExists, setPinExists, setPin, removePin, verifyPin,
    language, setLanguage, t, api
  } = useApp();

  const [showPinModal, setShowPinModal] = useState(null);
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
          const res = await window.electron.fetch('https://api.github.com/repos/naufal-backup/disbox-linux/releases/latest');
          if (res.ok) {
            const data = JSON.parse(res.body);
            const latest = data.tag_name;
            setLatestVersion(latest);
            if (latest !== ('v' + v)) setIsUpdateAvailable(true);
          }
        } catch (e) { console.error('Failed to fetch latest version:', e); }
      }
    };
    fetchVersions();
  }, []);

  const containerVariants = { initial: {}, animate: { transition: { staggerChildren: 0.04 } } };
  const itemVariants = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } }
  };

  useEffect(() => {
    if (!api) { setIsPinLoaded(false); return; }
    hasPin().then(() => { setIsPinLoaded(true); });
  }, [api, hasPin]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (activeHelp && !e.target.closest('.help-trigger')) setActiveHelp(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeHelp]);

  const CHUNK_OPTIONS = [
    { label: 'Free (10MB)', value: 10 * 1024 * 1024, desc: t('chunk_free_desc') },
    { label: 'Nitro (25MB)', value: 25 * 1024 * 1024, desc: t('chunk_nitro_desc') },
    { label: 'Nitro Premium (500MB)', value: 500 * 1024 * 1024, desc: t('chunk_premium_desc') }
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
          left: newLeft, right: newRight, transform: newTransform, width: width,
          top: newVertical === 'bottom' ? 'calc(100% + 12px)' : 'auto',
          bottom: newVertical === 'top' ? 'calc(100% + 12px)' : 'auto'
        });
        setArrowStyle({ left: newArrowLeft });
      }
    }, [isOpen]);

    return (
      <div className="help-trigger" style={{ position: 'relative', display: 'inline-flex' }}>
        <button 
          ref={triggerRef} onClick={() => setActiveHelp(isOpen ? null : helpKey)}
          style={{ background: 'transparent', border: 'none', padding: 4, cursor: 'pointer', color: isOpen ? 'var(--accent-bright)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', transition: 'all 0.2s', marginLeft: 6 }}
        >
          <AlertCircle size={14} />
        </button>
        {isOpen && (
          <div style={{ position: 'absolute', ...bubbleStyle, background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 14, padding: '12px 16px', boxShadow: '0 10px 40px rgba(0,0,0,0.6)', zIndex: 1000, fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6, textAlign: 'left', pointerEvents: 'auto' }}>
            {t(helpKey + '_help')}
            {verticalPos === 'top' ? (
              <div style={{ position: 'absolute', top: '100%', ...arrowStyle, marginLeft: -8, borderWidth: 8, borderStyle: 'solid', borderColor: 'var(--border-bright) transparent transparent transparent' }} />
            ) : (
              <div style={{ position: 'absolute', bottom: '100%', ...arrowStyle, marginLeft: -8, borderWidth: 8, borderStyle: 'solid', borderColor: 'transparent transparent var(--border-bright) transparent' }} />
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
    <motion.div initial="initial" animate="animate" variants={animationsEnabled ? containerVariants : {}} className={styles.settingsPanel}>
      <motion.h2 variants={itemVariants} className={styles.settingsTitle}>{t('settings')}</motion.h2>
      <div className={styles.settingsGrid}>
        <div className={styles.settingsLeft}>
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>{t('language')}</h3>
            <div className={styles.languageGrid}>
              {[{ code: 'id', label: 'Indonesia' }, { code: 'en', label: 'English' }, { code: 'zh', label: '中国 (China)' }].map(lang => (
                <button key={lang.code} onClick={() => setLanguage(lang.code)} className={`${styles.langBtn} ${language === lang.code ? styles.active : ''}`}>{lang.label}</button>
              ))}
            </div>
          </motion.div>
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>{t('app_behavior')}</h3>
            <Toggle label={t('close_to_tray')} value={closeToTray} onChange={v => updatePrefs({ closeToTray: v })} description={t('close_to_tray_desc')} helpKey="close_to_tray" />
            <Toggle label={t('start_minimized')} value={startMinimized} onChange={v => updatePrefs({ startMinimized: v })} description={t('start_minimized_desc')} helpKey="start_minimized" />
            <Toggle label={t('previews')} value={showPreviews} onChange={v => updatePrefs({ showPreviews: v })} description={t('previews_desc')} helpKey="previews" />
            {showPreviews && (
              <div style={{ marginLeft: 24, borderLeft: '2px solid var(--border)', paddingLeft: 16 }}>
                <Toggle label={t('image_previews')} value={showImagePreviews} onChange={v => updatePrefs({ showImagePreviews: v })} description={t('image_previews_desc')} helpKey="image_previews" />
                <Toggle label={t('video_previews')} value={showVideoPreviews} onChange={v => updatePrefs({ showVideoPreviews: v })} description={t('video_previews_desc')} helpKey="video_previews" />
              </div>
            )}
            <Toggle label={t('auto_close')} value={autoCloseTransfers} onChange={v => updatePrefs({ autoCloseTransfers: v })} description={t('auto_close_desc')} helpKey="auto_close" />
            <Toggle label={t('animations')} value={animationsEnabled} onChange={v => setAnimationsEnabled(v)} description={t('animations_desc')} helpKey="animations" />
            <Toggle label={t('show_recent')} value={showRecent} onChange={v => updatePrefs({ showRecent: v })} description={t('show_recent_desc')} helpKey="show_recent" />
          </motion.div>
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>{t('cloud_save')}</h3>
            <Toggle label={t('cloud_save')} value={cloudSaveEnabled} onChange={v => setCloudSaveEnabled(v)} description={t('cloud_save_desc')} helpKey="cloud_save" />
          </motion.div>
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <h3 className={styles.sectionTitle}>Share & Privacy</h3>
            <ShareSettingsSection />
          </motion.div>
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{t('security')}</h3>
              <InfoIcon helpKey="security" />
            </div>
            <div className={styles.pinManagementRow}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>Master PIN</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{!isPinLoaded ? t('loading') : (pinExists ? t('pin_active') : t('pin_not_set_security'))}</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {!isPinLoaded ? <div className="pulse" style={{ width: 80, height: 28, background: 'var(--bg-elevated)', borderRadius: 6, opacity: 0.5 }} /> : !pinExists ? (
                  <button onClick={() => setShowPinModal('set')} style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: 'white', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}>{t('set_pin')}</button>
                ) : (
                  <>
                    <button onClick={() => setShowPinModal('change')} className={styles.secondaryBtn}>{t('change_pin')}</button>
                    <button onClick={() => setShowPinModal('remove')} className={styles.dangerBtn}>{t('remove_pin')}</button>
                  </>
                )}
              </div>
            </div>
          </motion.div>
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}><h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{t('ui_scale')}</h3><InfoIcon helpKey="ui_scale" /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input type="range" min="0.8" max="1.3" step="0.05" value={uiScale} onChange={e => setUiScale(parseFloat(e.target.value))} className={styles.sliderInput} />
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', minWidth: 40, color: 'var(--accent-bright)' }}>{(uiScale * 100).toFixed(0)}%</span>
              <button onClick={() => setUiScale(1)} className={styles.resetBtn}>{t('reset')}</button>
            </div>
          </motion.div>
          <motion.div variants={itemVariants} className={styles.settingsSection}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}><h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{t('chunk_size')}</h3><InfoIcon helpKey="chunk_size" /></div>
            
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
                    <span 
                      key={i} 
                      style={{ 
                        fontSize: 11, 
                        color: isActive ? 'var(--accent-bright)' : 'var(--text-muted)', 
                        fontWeight: isActive ? 700 : 400,
                        position: 'absolute',
                        left: i === 0 ? '0%' : i === 1 ? '50%' : '100%',
                        transform: i === 0 ? 'none' : i === 1 ? 'translateX(-50%)' : 'translateX(-100%)',
                        transition: 'all 0.2s ease',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {opt.label.split(' ')[0]}
                    </span>
                  );
                })}
              </div>
            </div>

            {CHUNK_OPTIONS.find(opt => opt.value === chunkSize) && (
              <div className={styles.chunkInfo} style={{ marginTop: 24 }}>
                <p style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 4 }}>{CHUNK_OPTIONS.find(opt => opt.value === chunkSize).label}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{CHUNK_OPTIONS.find(opt => opt.value === chunkSize).desc}</p>
              </div>
            )}
          </motion.div>
        </div>
        <motion.div variants={itemVariants} className={styles.aboutCard}>
          <h3 className={styles.sectionTitle}>{t('about_disbox')}</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{t('about_desc')}</p>
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            <div>Disbox {latestVersion || 'v2.0'}</div>
            <div style={{ marginTop: 4 }}>Created by <b>naufal-backup</b></div>
          </div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <WorkerUsageCard t={t} />
        </motion.div>
      </div>
      <AnimatePresence>
        {showPinModal && <PinSettingsModal mode={showPinModal} onClose={() => { setShowPinModal(null); hasPin().then(setPinExists); }} />}
      </AnimatePresence>
    </motion.div>
  );
}

function PinSettingsModal({ mode, onClose }) {
  const { setPin, verifyPin, removePin, t, animationsEnabled } = useApp();
  const [step, setStep] = useState(mode === 'set' ? 'new' : 'verify');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const backdropVariants = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  const modalVariants = {
    initial: { opacity: 0, scale: 0.9, y: 20 },
    animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 300 } },
    exit: { opacity: 0, scale: 0.9, y: 20, transition: { duration: 0.2 } }
  };

  const handleVerify = async (e) => {
    e.preventDefault(); setLoading(true);
    if (await verifyPin(currentPin)) {
      if (mode === 'remove') { await removePin(currentPin); toast.success(t('pin_remove_success')); onClose(); }
      else { setStep('new'); setCurrentPin(''); setError(''); }
    } else { setError(t('pin_error_wrong')); }
    setLoading(false);
  };

  const handleSetNew = async (e) => {
    e.preventDefault();
    if (newPin.length < 4) { setError(t('pin_error_min_length')); return; }
    if (newPin !== confirmPin) { setError(t('pin_error_mismatch')); return; }
    setLoading(true);
    if (await setPin(newPin)) { toast.success(mode === 'set' ? t('pin_set_success') : t('pin_change_success')); onClose(); }
    else { setError(t('pin_error_save')); }
    setLoading(false);
  };

  const title = mode === 'set' ? t('set_pin') : mode === 'change' ? t('change_pin') : t('remove_pin');

  return (
    <motion.div className={styles.pinModalOverlay} onClick={onClose} initial="initial" animate="animate" exit="exit" variants={backdropVariants}>
      <motion.div className={styles.pinModalContent} onClick={e => e.stopPropagation()} variants={modalVariants}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Shield size={32} style={{ color: 'var(--accent)', marginBottom: 12 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{step === 'verify' ? t('pin_verify_desc') : t('pin_new_desc')}</p>
        </div>
        <form onSubmit={step === 'verify' ? handleVerify : handleSetNew}>
          {step === 'verify' ? (
            <input type="password" placeholder={t('pin_current_placeholder')} value={currentPin} onChange={e => setCurrentPin(e.target.value)} autoFocus style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'white', textAlign: 'center', fontSize: 18, letterSpacing: '0.2em', marginBottom: 12, outline: 'none' }} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
              <input type="password" placeholder={t('pin_new_placeholder')} value={newPin} onChange={e => setNewPin(e.target.value)} autoFocus style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'white', textAlign: 'center', fontSize: 18, letterSpacing: '0.2em', outline: 'none' }} />
              <input type="password" placeholder={t('pin_confirm_placeholder')} value={confirmPin} onChange={e => setConfirmPin(e.target.value)} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'white', textAlign: 'center', fontSize: 18, letterSpacing: '0.2em', outline: 'none' }} />
            </div>
          )}
          {error && <p style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center', marginBottom: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer' }}>{t('cancel')}</button>
            <button type="submit" disabled={loading} style={{ flex: 1, padding: 10, background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, cursor: 'pointer' }}>{loading ? t('verifying') : t('next')}</button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
