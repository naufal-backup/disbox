import { motion } from 'framer-motion';
import { useApp } from '@/AppContext.jsx';
import { Toggle } from './Common.jsx';
import styles from '../DrivePage.module.css';

export function CloudSaveSection({ itemVariants, activeHelp, setActiveHelp }) {
  const { cloudSaveEnabled, setCloudSaveEnabled, t } = useApp();

  return (
    <motion.div variants={itemVariants} className={styles.settingsSection}>
      <h3 className={styles.sectionTitle}>{t('cloud_save')}</h3>
      <Toggle label={t('cloud_save')} value={cloudSaveEnabled} onChange={v => setCloudSaveEnabled(v)} description={t('cloud_save_desc')} helpKey="cloud_save" activeHelp={activeHelp} setActiveHelp={setActiveHelp} t={t} />
    </motion.div>
  );
}
