import { motion } from 'framer-motion';
import { useApp } from '@/AppContext.jsx';
import styles from '../DrivePage.module.css';

export function LanguageSection({ itemVariants }) {
  const { language, setLanguage, t } = useApp();
  return (
    <motion.div variants={itemVariants} className={styles.settingsSection}>
      <h3 className={styles.sectionTitle}>{t('language')}</h3>
      <div className={styles.languageGrid}>
        {[{ code: 'id', label: 'Indonesia' }, { code: 'en', label: 'English' }, { code: 'zh', label: '中国 (China)' }].map(lang => (
          <button
            key={lang.code}
            onClick={() => setLanguage(lang.code)}
            className={`${styles.langBtn} ${language === lang.code ? styles.active : ''}`}
          >
            {lang.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
