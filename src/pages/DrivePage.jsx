import Sidebar from '../components/Sidebar.jsx';
import FileGrid from '../components/FileGrid.jsx';
import TransferPanel from '../components/TransferPanel.jsx';
import styles from './DrivePage.module.css';

export default function DrivePage({ activePage, onNavigate }) {
  return (
    <div className={styles.layout}>
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <main className={styles.main}>
        {activePage === 'drive' && <FileGrid />}
        {activePage === 'recent' && <Placeholder label="Recent Files" icon="🕐" />}
        {activePage === 'starred' && <Placeholder label="Starred Files" icon="⭐" />}
        {activePage === 'trash' && <Placeholder label="Trash" icon="🗑️" />}
        {activePage === 'settings' && <SettingsPanel />}
      </main>
      <TransferPanel />
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

function SettingsPanel() {
  return (
    <div style={{ padding: 32, maxWidth: 520 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Settings</h2>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>About</h3>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <p>Disbox Linux v2.0</p>
          <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>Discord-based cloud storage with virtual file system. Files are split into 25MB chunks and uploaded via Discord webhooks.</p>
        </div>
      </div>
    </div>
  );
}
