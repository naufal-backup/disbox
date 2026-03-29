import { motion } from 'framer-motion';
import { useApp } from '@/AppContext.jsx';
import { InfoIcon } from './Common.jsx';
import styles from '../DrivePage.module.css';

export function StorageSection({ itemVariants, activeHelp, setActiveHelp }) {
  const { chunkSize, setChunkSize, chunksPerMessage, updatePrefs, t } = useApp();

  const CHUNK_OPTIONS = [
    { label: 'Free (8MB)', value: 7.5 * 1024 * 1024, desc: t('chunk_free_desc') },
    { label: 'Nitro (25MB)', value: 24.5 * 1024 * 1024, desc: t('chunk_nitro_desc') },
    { label: 'Nitro Premium (500MB)', value: 499 * 1024 * 1024, desc: t('chunk_premium_desc') }
  ];

  return (
    <motion.div variants={itemVariants} className={styles.settingsSection}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{t('chunk_size')}</h3>
        <InfoIcon helpKey="chunk_size" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
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
        <InfoIcon helpKey="chunks_per_message" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
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
  );
}
