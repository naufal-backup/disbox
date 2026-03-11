import Sidebar from '../components/Sidebar.jsx';
import FileGrid from '../components/FileGrid.jsx';
import TransferPanel from '../components/TransferPanel.jsx';
import { useApp } from '../AppContext.jsx';
import { CheckCircle, Cloud, Clock, AlertCircle, RefreshCw } from 'lucide-react';
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
  const { uiScale, setUiScale, chunkSize, setChunkSize } = useApp();

  const CHUNK_OPTIONS = [
    { label: 'Free (10MB)', value: 10 * 1024 * 1024, desc: 'Batas standar webhook Discord (Free)' },
    { label: 'Nitro (25MB)', value: 25 * 1024 * 1024, desc: 'Batas untuk akun Discord Nitro Basic' },
    { label: 'Nitro Premium (500MB)', value: 500 * 1024 * 1024, desc: 'Batas untuk akun Discord Nitro Premium' }
  ];

  const currentOptionIndex = CHUNK_OPTIONS.findIndex(opt => opt.value === chunkSize);
  const safeIndex = currentOptionIndex === -1 ? 1 : currentOptionIndex; // Default ke 25MB jika tidak cocok

  return (
    <div style={{ padding: 32, maxWidth: 520 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Settings</h2>
      
      {/* UI Scaling Section */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Interface Zoom</h3>
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
            Reset
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>Atur skala antarmuka aplikasi agar sesuai dengan ukuran monitor Anda.</p>
      </div>

      {/* Chunk Size Section */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Chunk Size</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            type="range"
            min="0"
            max="2"
            step="1"
            value={safeIndex}
            onChange={e => setChunkSize(CHUNK_OPTIONS[parseInt(e.target.value)].value)}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {CHUNK_OPTIONS.map((opt, i) => (
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
            ))}
          </div>
          <div style={{ marginTop: 8, padding: 12, background: 'var(--bg-elevated)', borderRadius: 8, borderLeft: '3px solid var(--accent)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{CHUNK_OPTIONS[safeIndex].label}</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{CHUNK_OPTIONS[safeIndex].desc}</p>
          </div>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 16 }}>
          <b>PENTING:</b> Pastikan ukuran chunk sesuai dengan limit akun Discord Anda agar upload tidak gagal.
        </p>
      </div>

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
