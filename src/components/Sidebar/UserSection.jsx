import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Repeat, Plus } from 'lucide-react';
import styles from '../Sidebar.module.css';

export default function UserSection({ 
  activePage, onNavigate, animationsEnabled, 
  savedWebhooks, webhookUrl, connect 
}) {
  const [showSwitcher, setShowSwitcher] = useState(false);
  const switcherRef = useRef(null);
  const currentUsername = localStorage.getItem('dbx_username');
  const activeWebhook = savedWebhooks.find(w => w.url === webhookUrl);
  const userLabel = currentUsername ? `@${currentUsername}` : (activeWebhook ? activeWebhook.label : 'Guest User');

  const handleSwitchAccount = async (url) => {
    if (currentUsername) return; 
    if (url === webhookUrl) return;
    setShowSwitcher(false);
    await connect(url);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setShowSwitcher(false);
      }
    };
    if (showSwitcher) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSwitcher]);

  return (
    <div className={styles.userSection} ref={switcherRef}>
      <div className={styles.userBadgeWrapper}>
        <motion.button
          whileHover={animationsEnabled ? { scale: 1.02, x: 2 } : {}}
          whileTap={animationsEnabled ? { scale: 0.98 } : {}}
          className={`${styles.userBadge} ${activePage === 'profile' ? styles.activeUser : ''}`}
          onClick={() => onNavigate('profile')}
        >
          <div className={styles.avatar}>
            <User size={18} />
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{userLabel}</span>
            <span className={styles.userStatus}>{currentUsername ? 'Cloud Account' : 'Online'}</span>
          </div>
        </motion.button>
        
        {!currentUsername && (
          <button 
            className={styles.switchBtn} 
            onClick={(e) => { e.stopPropagation(); setShowSwitcher(!showSwitcher); }}
            title="Switch Account"
          >
            <Repeat size={14} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showSwitcher && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={styles.switcherPopup}
          >
            <div className={styles.switcherHeader}>
              <span>Switch Webhook</span>
              <button 
                className={styles.addMiniBtn} 
                onClick={() => { setShowSwitcher(false); onNavigate('profile'); }}
                title="Add New Webhook"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className={styles.switcherList}>
              {savedWebhooks.map((webhook) => (
                <button
                  key={webhook.url}
                  className={`${styles.switcherItem} ${webhook.url === webhookUrl ? styles.switcherItemActive : ''}`}
                  onClick={() => handleSwitchAccount(webhook.url)}
                >
                  <div className={styles.switcherItemInfo}>
                    <span className={styles.switcherItemLabel}>{webhook.label}</span>
                    <span className={styles.switcherItemUrl}>{webhook.url.split('/').pop().slice(0, 10)}...</span>
                  </div>
                  {webhook.url === webhookUrl && <div className={styles.activeDot} />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
