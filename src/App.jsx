import { useState, useEffect } from 'react';
import { AppProvider, useApp } from './AppContext.jsx';
import TitleBar from './components/TitleBar.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DrivePage from './pages/DrivePage.jsx';
import styles from './App.module.css';

function AppInner() {
  const { isConnected, webhookUrl, connect, loading } = useApp();
  const [activePage, setActivePage] = useState('drive');
  const [autoConnecting, setAutoConnecting] = useState(false);

  // Auto-reconnect if saved webhook exists
  useEffect(() => {
    if (webhookUrl && !isConnected && !loading) {
      setAutoConnecting(true);
      connect(webhookUrl).finally(() => setAutoConnecting(false));
    }
  }, []);

  const isElectron = !!window.electron;

  return (
    <div className={styles.app}>
      {isElectron && <TitleBar />}
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
