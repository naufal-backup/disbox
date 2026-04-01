import { motion } from 'framer-motion';
import { AlertCircle } from 'lucide-react';

export default function RevokeWarningModal({ 
  onClose, backdropVariants, modalVariants, transition, 
  shareLinks, onConfirmRevoke, onConfirmKeep 
}) {
  return (
    <motion.div 
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} 
      onClick={onClose}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={backdropVariants}
      transition={transition}
    >
      <motion.div 
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 14, padding: 24, width: 360, maxWidth: '90vw', textAlign: 'center' }} 
        onClick={e => e.stopPropagation()}
        variants={modalVariants}
        transition={transition}
      >
        <AlertCircle size={32} style={{ color: 'var(--amber, #f0a500)', marginBottom: 12 }} />
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Matikan Fitur Share?</h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
          Kamu masih punya {shareLinks.length} link aktif. Link yang sudah dibagikan tetap aktif sampai expired.
          <br /><br />
          Ingin revoke semua link sekarang?
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onConfirmRevoke}
            style={{ flex: 1, padding: 10, background: 'var(--red, #ed4245)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}
          >
            Revoke Semua
          </button>
          <button
            onClick={onConfirmKeep}
            style={{ flex: 1, padding: 10, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}
          >
            Biarkan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
