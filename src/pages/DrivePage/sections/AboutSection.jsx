import { motion } from 'framer-motion';
import { useApp } from '@/AppContext.jsx';
import styles from '../DrivePage.module.css';

export function AboutSection({ itemVariants, latestVersion }) {
  const { t } = useApp();

  return (
    <motion.div variants={itemVariants} className={styles.aboutCard}>
      <h3 className={styles.sectionTitle}>{t('about_disbox')}</h3>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{t('about_desc')}</p>
      <div style={{
        marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)',
        fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)'
      }}>
        <div>Disbox {latestVersion || 'v3.6.0'}</div>
        <div style={{ marginTop: 4 }}>Created by <b>naufal-backup</b></div>
      </div>
    </motion.div>
  );
}
