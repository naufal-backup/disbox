import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { AppProvider, useApp } from './AppContext.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DrivePage from './pages/DrivePage.jsx';
import styles from './App.module.css';

function AppInner() {
  const { isConnected, webhookUrl, connect, loading } = useApp();
  const [activePage, setActivePage] = useState('drive');
  const [autoConnecting, setAutoConnecting] = useState(false);

  // Auto-reconnect if saved webhook exists
  useEffect(() => {
    let isMounted = true;
    if (webhookUrl && !isConnected && !loading) {
      setAutoConnecting(true);
      connect(webhookUrl)
        .catch(err => {
          console.error('[App] Auto-connect failed:', err);
        })
        .finally(() => {
          if (isMounted) setAutoConnecting(false);
        });
    }
    return () => { isMounted = false; };
  }, []);

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
        {autoConnecting ? (
          <div className={styles.splash}>
            <div className={styles.splashIcon}>
              <span style={{ fontSize: 32 }}>⬡</span>
            </div>
            <p className={styles.splashText}>Reconnecting to drive…</p>
          </div>
        ) : isConnected ? (
          <DrivePage activePage={activePage} onNavigate={setActivePage} />
        ) : (
          <LoginPage />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
