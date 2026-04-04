import { motion } from 'framer-motion';
import { Link2, ExternalLink, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/useAppHook.js';

export default function WorkerSetupModal({ 
  onClose, backdropVariants, modalVariants, transition, 
  apiToken, setApiToken, handleDeploy, deploying, deployError 
}) {
  const { t } = useApp();
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
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 16, padding: 28, width: 420, maxWidth: '90vw' }} 
        onClick={e => e.stopPropagation()}
        variants={modalVariants}
        transition={transition}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <Link2 size={20} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>Setup Cloudflare Worker</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
          {/* Step 1 */}
          <div style={{ padding: 14, background: 'var(--bg-surface)', borderRadius: 10, borderLeft: '3px solid var(--accent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>1</div>
              <p style={{ fontSize: 12, fontWeight: 600 }}>Daftar / Login Cloudflare</p>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
              Gratis. Klik tombol di bawah untuk membuka halaman pendaftaran Cloudflare.
              Jika sudah punya akun, langsung login saja.
            </p>
            <button
              onClick={() => window.electron?.shareOpenCFTokenPage?.()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 6, color: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              <ExternalLink size={12} /> Buka Cloudflare
            </button>
          </div>

          {/* Step 2 */}
          <div style={{ padding: 14, background: 'var(--bg-surface)', borderRadius: 10, borderLeft: '3px solid var(--accent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>2</div>
              <p style={{ fontSize: 12, fontWeight: 600 }}>Buat API Token</p>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 8 }}>
              Setelah login, kamu akan diarahkan ke halaman buat token. Ikuti langkah berikut:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 0 }}>
              {[
                'Di Account Resources → pilih akun kamu di dropdown kanan',
                'Zone Resources → biarkan "All zones" (tidak perlu diubah)',
                'Klik Continue to Summary',
                'Klik Create Token',
                'Copy token yang muncul',
              ].map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(88,101,242,0.2)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>{i+1}</div>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Step 3 */}
          <div style={{ padding: 14, background: 'var(--bg-surface)', borderRadius: 10, borderLeft: '3px solid var(--accent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>3</div>
              <p style={{ fontSize: 12, fontWeight: 600 }}>Paste Token & Deploy</p>
            </div>
            <PasswordInput
              placeholder={t('api_token_placeholder')}
              value={apiToken}
              onChange={e => setApiToken(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none' }}
            />
            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
              Disbox akan otomatis deploy Worker ke akun Cloudflare kamu. Tidak perlu konfigurasi apapun lagi.
            </p>
            {deployError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, color: 'var(--red, #ed4245)', fontSize: 11 }}>
                <AlertCircle size={12} /> {deployError}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>
            {t('cancel')}
          </button>
          <button
            onClick={handleDeploy}
            disabled={deploying || !apiToken.trim()}
            style={{ flex: 1, padding: 10, background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: (deploying || !apiToken.trim()) ? 0.6 : 1 }}
          >
            {deploying ? 'Deploying...' : 'Deploy'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
  </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
