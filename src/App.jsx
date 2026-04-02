import { useState, useEffect } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { Hexagon } from 'lucide-react';
import { AppProvider } from './AppContext.jsx';
import { useApp } from './context/useAppHook.js';
import LoginPage from './pages/LoginPage.jsx';
import DrivePage from './pages/DrivePage.jsx';
import ShareViewPage from './pages/ShareViewPage.jsx';
import DiscordSetupPage from './pages/DiscordSetupPage.jsx';
import MusicBar from './components/MusicBar.jsx';
import { Shield, Loader2 } from 'lucide-react';
import styles from './App.module.css';

import { motion, AnimatePresence } from 'framer-motion';

function AppLockGateway({ onUnlocked }) {
  const { appLockPin, t, animationsEnabled } = useApp();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    await new Promise(resolve => setTimeout(resolve, 500));
    if (pin === appLockPin) {
      onUnlocked();
    } else {
      setError(t('pin_error_wrong'));
      setPin('');
    }
    setLoading(false);
  };

  return (
    <div style={{
      height: '100vh', width: '100vw', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', position: 'fixed', inset: 0, zIndex: 9999
    }}>
      <motion.div
        initial={animationsEnabled ? { opacity: 0, scale: 0.9, y: 20 } : {}}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        style={{
          background: 'var(--bg-elevated)', padding: 40, borderRadius: 24,
          border: '1px solid var(--border-bright)', textAlign: 'center',
          width: '100%', maxWidth: 360, boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ position: 'relative', marginBottom: 20, display: 'inline-block' }}>
          <Shield size={56} style={{ color: 'var(--accent)' }} />
          <motion.div
            animate={animationsEnabled ? { opacity: [0.5, 1, 0.5] } : {}}
            transition={{ repeat: Infinity, duration: 2 }}
            style={{ position: 'absolute', inset: -10, border: '2px solid var(--accent)', borderRadius: '50%', opacity: 0.2 }}
          />
        </div>

        <h3 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10, color: 'var(--text-primary)' }}>
          {t('app_locked')}
        </h3>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28 }}>
          {t('app_locked_desc')}
        </p>

        <form onSubmit={handleSubmit}>
          <motion.div
            animate={error && animationsEnabled ? { x: [-10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            <input
              type="password"
              placeholder={t('app_lock_placeholder') || '••••'}
              value={pin}
              onChange={e => setPin(e.target.value)}
              autoFocus
              style={{
                width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 14, padding: 18, color: 'white', textAlign: 'center',
                fontSize: 28, letterSpacing: '0.4em', marginBottom: 12, outline: 'none'
              }}
            />
          </motion.div>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ color: '#ef4444', fontSize: 13, marginBottom: 16, fontWeight: 600 }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading || !pin}
            style={{
              width: '100%', padding: 16, background: 'var(--accent)', border: 'none',
              borderRadius: 14, color: 'white', fontWeight: 800, fontSize: 15,
              cursor: 'pointer', transition: 'all 0.2s', display: 'flex',
              alignItems: 'center', justifyContent: 'center', gap: 10
            }}
          >
            {loading ? <Loader2 size={18} className="spin" /> : null}
            {loading ? t('verifying') : t('unlock_app')}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function AppInner() {
  const { 
    isConnected, isConnecting, webhookUrl, connect, disconnect, loading, 
    appLockEnabled, isAppUnlocked, setIsAppUnlocked,
    currentTrack, setCurrentTrack, playlist, t
  } = useApp();
  const [activePage, setActivePage] = useState('drive');
  const [autoConnecting, setAutoConnecting] = useState(false);

  const handleNext = (shuffle = false) => {
    if (!playlist.length || !currentTrack) return;
    const idx = playlist.findIndex(t => t.id === currentTrack.id);
    
    let nextIdx;
    if (shuffle && playlist.length > 1) {
      nextIdx = idx;
      while (nextIdx === idx) {
        nextIdx = Math.floor(Math.random() * playlist.length);
      }
    } else {
      nextIdx = (idx + 1) % playlist.length;
    }
    setCurrentTrack(playlist[nextIdx]);
  };

  const handlePrev = () => {
    if (!playlist.length || !currentTrack) return;
    const idx = playlist.findIndex(t => t.id === currentTrack.id);
    const prevIdx = (idx - 1 + playlist.length) % playlist.length;
    setCurrentTrack(playlist[prevIdx]);
  };

    useEffect(() => {
    let isMounted = true;
    if (webhookUrl && !isConnected && !loading && !isConnecting) {
      setAutoConnecting(true);
      connect(webhookUrl)
        .catch(err => {
          console.error('[App] Auto-connect failed:', err);
          // Show user-friendly error
          toast.error(err.message || 'Gagal menghubungkan ke drive. Silakan coba login kembali.');
        })
        .finally(() => { if (isMounted) setAutoConnecting(false); });
    }
    return () => { isMounted = false; };
  }, []);

  // Tangani route /share/* — tampilkan ShareViewPage tanpa perlu login
  if (window.location.pathname.startsWith('/share/')) {
    return <ShareViewPage />;
  }

  // Auto-reconnect jika ada webhook tersimpan
  const isDiscordCallback = window.location.pathname === '/discord/callback'
    && new URLSearchParams(window.location.search).has('code');
  if (isDiscordCallback) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05050a' }}>
        <DiscordSetupPage onBack={() => window.history.replaceState({}, '', '/')} />
      </div>
    );
  }

  if (appLockEnabled && !isAppUnlocked) {
    return <AppLockGateway onUnlocked={() => setIsAppUnlocked(true)} />;
  }

  return (
    <div className={styles.app}>
      <Toaster
        position="bottom-center"
        toastOptions={{
          style: {
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-bright)',
            fontSize: '13px',
            borderRadius: '10px',
          }
        }}
      />
      <div className={styles.body}>
        {(autoConnecting || isConnecting) ? (
          <div className={styles.splash}>
            <div className={styles.splashIcon}>
              <Hexagon size={48} className="spin-slow" style={{ color: 'var(--accent)' }} />
            </div>
            <p className={styles.splashText}>
              {isConnecting ? 'Switching drive...' : 'Reconnecting to drive...'}
            </p>
            <button 
              className={styles.cancelAutoBtn}
              onClick={() => {
                disconnect();
                setAutoConnecting(false);
              }}
            >
              {t('cancel')}
            </button>
          </div>
        ) : isConnected ? (
          <DrivePage activePage={activePage} onNavigate={setActivePage} />
        ) : (
          <LoginPage />
        )}
      </div>
      
      {isConnected && (
        <MusicBar 
          track={currentTrack} 
          playlist={playlist}
          onNext={handleNext}
          onPrev={handlePrev}
          onClose={() => setCurrentTrack(null)}
        />
      )}
    </div>
  );
}

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider>
        <AppInner />
      </AppProvider>
    </QueryClientProvider>
  );
}
