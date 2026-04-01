import { motion } from 'framer-motion';
import { useApp } from '../../context/useAppHook.js';
import styles from '../FolderModal.module.css';

export default function Backdrop({ children, onClose }) {
  const { animationsEnabled } = useApp();
  
  const backdropVariants = {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const modalVariants = {
    initial: { opacity: 0, scale: 0.95, y: 10 },
    animate: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { type: 'spring', damping: 25, stiffness: 300 }
    },
    exit: { 
      opacity: 0, 
      scale: 0.95, 
      y: 10,
      transition: { duration: 0.15 }
    }
  };

  const transition = animationsEnabled ? {} : { duration: 0 };

  return (
    <motion.div 
      className={styles.backdrop} 
      onClick={onClose}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={backdropVariants}
      transition={transition}
    >
      <motion.div 
        onClick={e => e.stopPropagation()}
        variants={modalVariants}
        transition={transition}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
