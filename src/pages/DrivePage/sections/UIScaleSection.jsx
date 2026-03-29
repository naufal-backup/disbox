import { motion } from 'framer-motion';
import { useApp } from '@/AppContext.jsx';
import { InfoIcon } from './Common.jsx';
import styles from '../DrivePage.module.css';

export function UIScaleSection({ itemVariants, activeHelp, setActiveHelp }) {
  const { uiScale, setUiScale, t } = useApp();

  return (
    <motion.div variants={itemVariants} className={styles.settingsSection}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>{t('ui_scale')}</h3>
        <InfoIcon helpKey="ui_scale" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <input
          type="range" min="0.8" max="1.3" step="0.05" value={uiScale}
          onChange={e => setUiScale(parseFloat(e.target.value))}
          className={styles.sliderInput}
        />
        <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', minWidth: 40, color: 'var(--accent-bright)' }}>
          {(uiScale * 100).toFixed(0)}%
        </span>
        <button onClick={() => setUiScale(1)} className={styles.resetBtn}>{t('reset')}</button>
      </div>
    </motion.div>
  );
}
