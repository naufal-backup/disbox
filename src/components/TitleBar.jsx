import { useState, useEffect } from 'react';
import { Minus, Square, X, Cloud } from 'lucide-react';
import styles from './TitleBar.module.css';

export default function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    window.electron?.isMaximized().then(setIsMaximized);
  }, []);

  const handleMinimize = () => window.electron?.minimize();
  const handleMaximize = () => {
    window.electron?.maximize();
    window.electron?.isMaximized().then(setIsMaximized);
  };
  const handleClose = () => window.electron?.close();

  return (
    <div className={styles.titlebar}>
      <div className={styles.drag} />
      <div className={styles.logo}>
        <div className={styles.logoIcon}>
          <Cloud size={13} strokeWidth={2.5} />
        </div>
        <span className={styles.logoText}>Disbox</span>
      </div>
      <div className={styles.controls}>
        <button className={styles.btn} onClick={handleMinimize} title="Minimize">
          <Minus size={12} />
        </button>
        <button className={styles.btn} onClick={handleMaximize} title="Maximize">
          <Square size={11} />
        </button>
        <button className={`${styles.btn} ${styles.close}`} onClick={handleClose} title="Close">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
