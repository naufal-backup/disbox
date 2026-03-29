import { motion } from 'framer-motion';
import { useApp } from '@/AppContext.jsx';
import { InfoIcon } from './Common.jsx';
import styles from '../DrivePage.module.css';

export function SecuritySection({ itemVariants, isPinLoaded, pinExists, setShowPinModal, activeHelp, setActiveHelp }) {
  const { t } = useApp();

  return (
    <motion.div variants={itemVariants} className={styles.settingsSection}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{t('security')}</h3>
        <InfoIcon helpKey="security" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
      </div>
      <div className={styles.pinManagementRow}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Master PIN</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {!isPinLoaded ? t('loading') : (pinExists ? t('pin_active') : t('pin_not_set_security'))}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isPinLoaded ? (
            <div className="pulse" style={{ width: 80, height: 28, background: 'var(--bg-elevated)', borderRadius: 6, opacity: 0.5 }} />
          ) : !pinExists ? (
            <button
              onClick={() => setShowPinModal('set')}
              style={{
                background: 'var(--accent)', border: 'none', borderRadius: 6,
                color: 'var(--text-on-accent)', fontSize: 12, fontWeight: 600,
                padding: '6px 12px', cursor: 'pointer'
              }}
            >
              {t('set_pin')}
            </button>
          ) : (
            <>
              <button onClick={() => setShowPinModal('change')} className={styles.secondaryBtn}>{t('change_pin')}</button>
              <button onClick={() => setShowPinModal('remove')} className={styles.dangerBtn}>{t('remove_pin')}</button>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}
