import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/AppContext.jsx';
import { ConfirmModal } from '@/components/FolderModal/FolderModal.jsx';
import styles from './Sidebar.module.css';
import { motion, AnimatePresence } from 'framer-motion';

import StorageIndicator from './StorageIndicator.jsx';
import NavSection from './NavSection.jsx';
import UserSection from './UserSection.jsx';
import ActionsSection from './ActionsSection.jsx';

export default function Sidebar({ activePage, onNavigate }) {
  const {
    disconnect, refresh, loading, files, theme, toggleTheme,
    showRecent, t, animationsEnabled, cloudSaveEnabled, isSidebarOpen,
    shareEnabled, savedWebhooks, connect, webhookUrl, setIsSidebarOpen
  } = useApp();
  
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showSharePopup, setShowSharePopup] = useState(false);

  const handleSharedClick = () => {
    if (!shareEnabled) {
      setShowSharePopup(true);
    } else {
      onNavigate('shared');
      setIsSidebarOpen(false);
    }
  };

  const handleNavigateClose = (page) => {
    onNavigate(page);
    setIsSidebarOpen(false);
  };

  return (
    <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.open : ''}`}>
      <StorageIndicator files={files} t={t} />

      <NavSection 
        activePage={activePage} 
        onNavigate={handleNavigateClose}
        shareEnabled={shareEnabled}
        showRecent={showRecent}
        cloudSaveEnabled={cloudSaveEnabled}
        animationsEnabled={animationsEnabled}
        t={t}
        handleSharedClick={handleSharedClick}
      />

      <div className={styles.divider} />

      <UserSection 
        activePage={activePage}
        onNavigate={handleNavigateClose}
        animationsEnabled={animationsEnabled}
        savedWebhooks={savedWebhooks}
        webhookUrl={webhookUrl}
        connect={connect}
      />

      <div className={styles.divider} />

      <ActionsSection 
        theme={theme}
        toggleTheme={toggleTheme}
        refresh={refresh}
        loading={loading}
        activePage={activePage}
        onNavigate={handleNavigateClose}
        setShowDisconnectConfirm={setShowDisconnectConfirm}
        animationsEnabled={animationsEnabled}
        t={t}
      />

      <AnimatePresence>
        {showSharePopup && (
          <div className={styles.sharePopupOverlay} onClick={() => setShowSharePopup(false)}>
            <div className={styles.sharePopup} onClick={e => e.stopPropagation()}>
              <Link2 size={28} style={{ color: 'var(--accent)', marginBottom: 12 }} />
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Aktifkan Fitur Shared?</h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
                Bagikan file ke siapapun via link. Penerima cukup buka link di browser, tanpa perlu install Disbox.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  style={{ flex: 1, padding: '8px 0', background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}
                  onClick={() => setShowSharePopup(false)}
                >
                  Batal
                </button>
                <button
                  style={{ flex: 1, padding: '8px 0', background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  onClick={() => { setShowSharePopup(false); handleNavigateClose('settings'); }}
                >
                  Ke Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {showDisconnectConfirm && (
        <ConfirmModal
          title="Disconnect Session"
          message="Apakah Anda yakin ingin memutus sesi? Semua perubahan metadata yang belum terunggah akan hilang."
          danger={true}
          onConfirm={disconnect}
          onClose={() => setShowDisconnectConfirm(false)}
        />
      )}
    </aside>
  );
}
