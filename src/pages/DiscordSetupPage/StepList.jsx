import { Check, X } from 'lucide-react';
import styles from '../DiscordSetupPage.module.css';

const SETUP_STEPS = [
  { id: 'channel', label: 'Membuat channel penyimpanan' },
  { id: 'webhook', label: 'Membuat webhook'              },
  { id: 'connect', label: 'Menghubungkan ke Disbox'      },
];

export default function StepList({ current, error }) {
  const order = SETUP_STEPS.map(s => s.id);
  const cur   = order.indexOf(current);

  return (
    <div className={styles.stepList}>
      {SETUP_STEPS.map((s, i) => {
        const state = (error && i === cur) ? 'error'
                    : i < cur              ? 'done'
                    : i === cur            ? 'active'
                    : 'pending';
        return (
          <div key={s.id} className={styles.stepRow}>
            <div className={`${styles.stepBadge} ${styles['stepBadge_' + state]}`}>
              {state === 'done' ? <Check size={14} /> : state === 'error' ? <X size={14} /> : i + 1}
              {state === 'active' && <span className={styles.stepPing} />}
            </div>
            <span className={`${styles.stepLabel} ${styles['stepLabel_' + state]}`}>
              {s.label}
            </span>
            {state === 'active' && !error && (
              <div className={styles.stepDots}>
                <span /><span /><span />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
