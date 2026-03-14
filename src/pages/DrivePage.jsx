import Sidebar from '../components/Sidebar.jsx';
import FileGrid from '../components/FileGrid.jsx';
import TransferPanel from '../components/TransferPanel.jsx';
import CloudSavePage from './CloudSavePage.jsx';
import { useApp } from '../AppContext.jsx';
import { CheckCircle, Cloud, Clock, AlertCircle, RefreshCw, Lock, Shield, Key, Unlock } from 'lucide-react';
import styles from './DrivePage.module.css';
import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

export default function DrivePage({ activePage, onNavigate }) {
  const { isVerified, setIsVerified, hasPin, setCurrentPath, t, animationsEnabled } = useApp();
  const [checkingPin, setCheckingPin] = useState(false);

  // Reset verification and path when switching tabs
  const handleNavigate = (page) => {
    if (page !== activePage) {
      setCurrentPath('/'); // Reset path to root on tab change
    }
    
    if (activePage === 'locked' && page !== 'locked') {
      setIsVerified(false);
    }
    onNavigate(page);
  };

  const pageVariants = {
    initial: { opacity: 0, y: 5 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -5 }
  };

  const transition = animationsEnabled ? { duration: 0.2 } : { duration: 0 };

  return (
    <div className={styles.layout}>
      <Sidebar activePage={activePage} onNavigate={handleNavigate} />
      <main className={styles.main}>
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
            {activePage === 'settings' && (
              <div className={styles.settingsContainer}>
                <SettingsPanel />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      <TransferPanel activePage={activePage} />
    </div>
  );
}

function Placeholder({ label, icon }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-muted)' }}>
      <span style={{ fontSize: 48 }}>{icon}</span>
      <p style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</p>
      <p style={{ fontSize: 12 }}>Coming soon</p>
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

function SettingsPanel() {
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
    hasPin, pinExists, setPinExists, setPin, removePin, verifyPin,
    language, setLanguage, t, api
  } = useApp();

  const [showPinModal, setShowPinModal] = useState(null); // 'set', 'change', 'remove'
  const [latestVersion, setLatestVersion] = useState('v3.0');
  const [activeHelp, setActiveHelp] = useState(null);
  const [isPinLoaded, setIsPinLoaded] = useState(!!api);

  useEffect(() => {
    if (!api) {
      setIsPinLoaded(false);
      return;
    }
    hasPin().then(() => {
      setIsPinLoaded(true);
    });
  }, [api, hasPin]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (activeHelp && !e.target.closest('.help-trigger')) {
        setActiveHelp(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeHelp]);

  const CHUNK_OPTIONS = [
    { label: 'Free (10MB)', value: 10 * 1024 * 1024, desc: t('chunk_free_desc') },
    { label: 'Nitro (25MB)', value: 25 * 1024 * 1024, desc: t('chunk_nitro_desc') },
    { label: 'Nitro Premium (500MB)', value: 500 * 1024 * 1024, desc: t('chunk_premium_desc') }
  ];

  const currentOptionIndex = CHUNK_OPTIONS.findIndex(opt => opt.value === chunkSize);
  const safeIndex = currentOptionIndex === -1 ? 1 : currentOptionIndex; // Default ke 25MB jika tidak cocok

  const InfoIcon = ({ helpKey }) => {
    const isOpen = activeHelp === helpKey;
    const triggerRef = useRef(null);
    const [verticalPos, setVerticalPos] = useState('top'); // 'top' or 'bottom'
    const [bubbleStyle, setBubbleStyle] = useState({
      left: '50%',
      transform: 'translateX(-50%)',
      width: 260
    });
    const [arrowStyle, setArrowStyle] = useState({ left: '50%' });

    useLayoutEffect(() => {
      if (isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const width = 260;
        const padding = 20;
        const bubbleHeightThreshold = 120; // Estimated max height
        const halfWidth = width / 2;
        
        let newLeft = '50%';
        let newTransform = 'translateX(-50%)';
        let newArrowLeft = '50%';
        let newRight = 'auto';
        let newVertical = 'top';

        // Check vertical boundary
        if (rect.top < bubbleHeightThreshold) {
          newVertical = 'bottom';
        }

        // Check left boundary
        if (rect.left < halfWidth + padding) {
          newLeft = `-${rect.left - padding}px`;
          newTransform = 'none';
          newArrowLeft = `${rect.left - padding + 10}px`;
        } 
        // Check right boundary
        else if (window.innerWidth - rect.right < halfWidth + padding) {
          newLeft = 'auto';
          newRight = `-${window.innerWidth - rect.right - padding}px`;
          newTransform = 'none';
          newArrowLeft = `calc(100% - ${window.innerWidth - rect.right - padding + 10}px)`;
        }

        setVerticalPos(newVertical);
        setBubbleStyle({
          left: newLeft,
          right: newRight,
          transform: newTransform,
          width: width,
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
            background: 'transparent',
            border: 'none',
            padding: 4,
            cursor: 'pointer',
            color: isOpen ? 'var(--accent-bright)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'all 0.2s',
            marginLeft: 6
          }}
        >
          <AlertCircle size={14} />
        </button>
        {isOpen && (
          <div style={{
            position: 'absolute',
            ...bubbleStyle,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-bright)',
            borderRadius: 14,
            padding: '12px 16px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
            zIndex: 1000,
            fontSize: 12,
            color: 'var(--text-primary)',
            lineHeight: 1.6,
            textAlign: 'left',
            pointerEvents: 'auto',
            animation: verticalPos === 'top' ? 'fadeInScale 0.2s ease-out' : 'fadeInScaleDown 0.2s ease-out'
          }}>
            {t(helpKey + '_help')}
            
            {/* Bubble Arrow */}
            {verticalPos === 'top' ? (
              <>
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  ...arrowStyle,
                  marginLeft: -8,
                  borderWidth: 8,
                  borderStyle: 'solid',
                  borderColor: 'var(--border-bright) transparent transparent transparent'
                }} />
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  ...arrowStyle,
                  marginLeft: -7,
                  borderWidth: 7,
                  borderStyle: 'solid',
                  borderColor: 'var(--bg-elevated) transparent transparent transparent',
                  marginTop: -1
                }} />
              </>
            ) : (
              <>
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  ...arrowStyle,
                  marginLeft: -8,
                  borderWidth: 8,
                  borderStyle: 'solid',
                  borderColor: 'transparent transparent var(--border-bright) transparent'
                }} />
                <div style={{
                  position: 'absolute',
                  bottom: '100%',
                  ...arrowStyle,
                  marginLeft: -7,
                  borderWidth: 7,
                  borderStyle: 'solid',
                  borderColor: 'transparent transparent var(--bg-elevated) transparent',
                  marginBottom: -1
                }} />
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  const Toggle = ({ label, value, onChange, description, helpKey }) => (
    <div style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
            {helpKey && <InfoIcon helpKey={helpKey} />}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</p>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 36, height: 20, flexShrink: 0 }}>
          <input 
            type="checkbox" 
            checked={value} 
            onChange={e => onChange(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span style={{
            position: 'absolute', cursor: 'pointer', inset: 0,
            backgroundColor: value ? 'var(--accent)' : '#333',
            transition: '.3s', borderRadius: 20
          }}>
            <span style={{
              position: 'absolute', height: 14, width: 14, left: value ? 19 : 3, bottom: 3,
              backgroundColor: 'white', transition: '.3s', borderRadius: '50%'
            }} />
          </span>
        </label>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>{t('settings')}</h2>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '1fr 320px', 
        gap: 24,
        alignItems: 'start'
      }}>
        {/* Left Column: Configuration */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Language Selection */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('language')}</h3>
            <div style={{ display: 'flex', gap: 10 }}>
              {[
                { code: 'id', label: 'Indonesia' },
                { code: 'en', label: 'English' },
                { code: 'zh', label: '中国 (China)' }
              ].map(lang => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: language === lang.code ? 'var(--accent)' : 'var(--bg-elevated)',
                    border: '1px solid ' + (language === lang.code ? 'var(--accent)' : 'var(--border)'),
                    borderRadius: 8,
                    color: language === lang.code ? 'white' : 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {/* App Behavior Section */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('app_behavior')}</h3>
            <Toggle 
              label={t('close_to_tray')} 
              value={closeToTray} 
              onChange={v => updatePrefs({ closeToTray: v })}
              description={t('close_to_tray_desc')}
              helpKey="close_to_tray"
            />
            <Toggle 
              label={t('start_minimized')} 
              value={startMinimized} 
              onChange={v => updatePrefs({ startMinimized: v })}
              description={t('start_minimized_desc')}
              helpKey="start_minimized"
            />
            <Toggle 
              label={t('previews')} 
              value={showPreviews} 
              onChange={v => updatePrefs({ showPreviews: v })}
              description={t('previews_desc')}
              helpKey="previews"
            />
            {showPreviews && (
              <div style={{ marginLeft: 24, borderLeft: '2px solid var(--border)', paddingLeft: 16 }}>
                <Toggle 
                  label={t('image_previews')} 
                  value={showImagePreviews} 
                  onChange={v => updatePrefs({ showImagePreviews: v })}
                  description={t('image_previews_desc')}
                  helpKey="image_previews"
                />
                <Toggle 
                  label={t('video_previews')} 
                  value={showVideoPreviews} 
                  onChange={v => updatePrefs({ showVideoPreviews: v })}
                  description={t('video_previews_desc')}
                  helpKey="video_previews"
                />
              </div>
            )}
            <Toggle 
              label={t('auto_close')} 
              value={autoCloseTransfers} 
              onChange={v => updatePrefs({ autoCloseTransfers: v })}
              description={t('auto_close_desc')}
              helpKey="auto_close"
            />
            <Toggle 
              label={t('animations')} 
              value={animationsEnabled} 
              onChange={v => setAnimationsEnabled(v)}
              description={t('animations_desc')}
              helpKey="animations"
            />
            <Toggle 
              label={t('show_recent')} 
              value={showRecent} 
              onChange={v => updatePrefs({ showRecent: v })}
              description={t('show_recent_desc')}
              helpKey="show_recent"
            />
          </div>

          {/* Cloud Save Section */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('cloud_save')}</h3>
            <Toggle 
              label={t('cloud_save')} 
              value={cloudSaveEnabled} 
              onChange={v => setCloudSaveEnabled(v)}
              description={t('cloud_save_desc')}
              helpKey="cloud_save"
            />
          </div>

          {/* PIN Management Section */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{t('security')}</h3>
              <InfoIcon helpKey="security" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Master PIN</p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {!isPinLoaded ? t('loading') : (pinExists ? t('pin_active') : t('pin_not_set_security'))}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {!isPinLoaded ? (
                    <div style={{ width: 80, height: 28, background: 'var(--bg-elevated)', borderRadius: 6, opacity: 0.5, animation: 'pulse 1.5s infinite' }} />
                  ) : !pinExists ? (
                    <button 
                      onClick={() => setShowPinModal('set')}
                      style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: 'white', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}
                    >
                      {t('set_pin')}
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        onClick={() => setShowPinModal('change')}
                        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}
                      >
                        {t('change_pin')}
                      </button>
                      <button 
                        onClick={() => setShowPinModal('remove')}
                        style={{ background: 'rgba(237,66,69,0.1)', border: '1px solid rgba(237,66,69,0.2)', borderRadius: 6, color: 'var(--red)', fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer' }}
                      >
                        {t('remove_pin')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* UI Scaling Section */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{t('ui_scale')}</h3>
              <InfoIcon helpKey="ui_scale" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input
                type="range"
                min="0.8"
                max="1.3"
                step="0.05"
                value={uiScale}
                onChange={e => setUiScale(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--accent)' }}
              />
              <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', minWidth: 40, color: 'var(--accent-bright)' }}>
                {(uiScale * 100).toFixed(0)}%
              </span>
              <button 
                onClick={() => setUiScale(1)}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-secondary)', fontSize: 11, padding: '4px 8px', cursor: 'pointer' }}
              >
                {t('reset')}
              </button>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>{t('ui_scale_desc')}</p>
          </div>

          {/* Chunk Size Section */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>{t('chunk_size')}</h3>
              <InfoIcon helpKey="chunk_size" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <input
                type="range"
                min="0"
                max="2"
                step="1"
                value={CHUNK_OPTIONS.findIndex(opt => opt.value === chunkSize) === -1 ? 1 : CHUNK_OPTIONS.findIndex(opt => opt.value === chunkSize)}
                onChange={e => setChunkSize(CHUNK_OPTIONS[parseInt(e.target.value)].value)}
                style={{ width: '100%', accentColor: 'var(--accent)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {CHUNK_OPTIONS.map((opt, i) => {
                  const safeIndex = CHUNK_OPTIONS.findIndex(o => o.value === chunkSize) === -1 ? 1 : CHUNK_OPTIONS.findIndex(o => o.value === chunkSize);
                  return (
                    <span 
                      key={i} 
                      style={{ 
                        fontSize: 11, 
                        color: i === safeIndex ? 'var(--accent-bright)' : 'var(--text-muted)',
                        fontWeight: i === safeIndex ? 700 : 400,
                        textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center',
                        flex: 1
                      }}
                    >
                      {opt.label.split(' ')[0]}
                    </span>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-elevated)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
                {(() => {
                  const safeIndex = CHUNK_OPTIONS.findIndex(opt => opt.value === chunkSize) === -1 ? 1 : CHUNK_OPTIONS.findIndex(opt => opt.value === chunkSize);
                  return (
                    <>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{CHUNK_OPTIONS[safeIndex].label}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{CHUNK_OPTIONS[safeIndex].desc}</p>
                    </>
                  );
                })()}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16 }}>
              <b>{t('important')}:</b> {t('chunk_important_desc')}
            </p>
          </div>
        </div>

        {/* Right Column: About Card */}
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20, position: 'sticky', top: 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('about_disbox')}</h3>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <p style={{ fontWeight: 700, color: 'var(--accent-bright)', fontSize: 15 }}>Disbox Linux {latestVersion}</p>
            <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>{t('about_desc')}</p>
            
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Naufal Alamsyah</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>GitHub: naufal-backup</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Email: naufalalamsyah453@gmail.com</p>
              
              <div style={{ marginTop: 16 }}>
                <a 
                  href="https://github.com/naufal-backup/disbox" 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={e => { e.preventDefault(); window.open?.(e.currentTarget.href, '_blank'); }}
                >
                  {t('view_source')}
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showPinModal && (
        <PinSettingsModal 
          mode={showPinModal} 
          onClose={() => { setShowPinModal(null); hasPin().then(setPinExists); }} 
        />
      )}
    </div>
  );
}

function PinSettingsModal({ mode, onClose }) {
  const { setPin, verifyPin, removePin, t } = useApp();
  const [step, setStep] = useState(mode === 'set' ? 'new' : 'verify');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await verifyPin(currentPin);
    if (ok) {
      if (mode === 'remove') {
        await removePin(currentPin);
        toast.success(t('pin_remove_success'));
        onClose();
      } else {
        setStep('new');
        setCurrentPin('');
        setError('');
      }
    } else {
      setError(t('pin_error_wrong'));
    }
    setLoading(false);
  };

  const handleSetNew = async (e) => {
    e.preventDefault();
    if (newPin.length < 4) {
      setError(t('pin_error_min_length'));
      return;
    }
    if (newPin !== confirmPin) {
      setError(t('pin_error_mismatch'));
      return;
    }
    setLoading(true);
    const ok = await setPin(newPin);
    if (ok) {
      toast.success(mode === 'set' ? t('pin_set_success') : t('pin_change_success'));
      onClose();
    } else {
      setError(t('pin_error_save'));
    }
    setLoading(false);
  };

  const title = mode === 'set' ? t('set_pin') : mode === 'change' ? t('change_pin') : t('remove_pin');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 320, boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <Shield size={32} style={{ color: 'var(--accent)', marginBottom: 12 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>{title}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {step === 'verify' ? t('pin_verify_desc') : t('pin_new_desc')}
          </p>
        </div>

        {step === 'verify' ? (
          <form onSubmit={handleVerify}>
            <input 
              type="password" 
              placeholder={t('pin_current_placeholder')} 
              value={currentPin}
              onChange={e => setCurrentPin(e.target.value)}
              autoFocus
              style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'white', textAlign: 'center', fontSize: 18, letterSpacing: '0.2em', marginBottom: 12, outline: 'none' }}
            />
            {error && <p style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center', marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer' }}>{t('cancel')}</button>
              <button type="submit" disabled={loading || !currentPin} style={{ flex: 1, padding: 10, background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                {loading ? t('verifying') : t('next')}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSetNew}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <input 
                type="password" 
                placeholder={t('pin_new_placeholder')} 
                value={newPin}
                onChange={e => setNewPin(e.target.value)}
                autoFocus
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'white', textAlign: 'center', fontSize: 18, letterSpacing: '0.2em', outline: 'none' }}
              />
              <input 
                type="password" 
                placeholder={t('pin_confirm_placeholder')} 
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value)}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, color: 'white', textAlign: 'center', fontSize: 18, letterSpacing: '0.2em', outline: 'none' }}
              />
            </div>
            {error && <p style={{ color: 'var(--red)', fontSize: 12, textAlign: 'center', marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer' }}>{t('cancel')}</button>
              <button type="submit" disabled={loading || !newPin || !confirmPin} style={{ flex: 1, padding: 10, background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, cursor: 'pointer' }}>
                {loading ? t('saving') : t('save')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
