import { motion } from 'framer-motion';
import { useApp } from '@/AppContext.jsx';
import styles from '../DrivePage.module.css';

export function ThemeSection({ itemVariants }) {
  const { theme, setTheme, t } = useApp();
  const themes = [
    { id: 'dark', label: 'Dark', colors: ['#0a0a15', '#5865f2'] },
    { id: 'light', label: 'Light', colors: ['#f0f2f5', '#5865f2'] },
    { id: 'grayscale', label: 'Grayscale', colors: ['#212529', '#9ea4b0'] },
    { id: 'colorful', label: 'Colorful', colors: ['#1a3a52', '#f9f871'] }
  ];

  return (
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
  );
}
