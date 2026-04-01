import { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';
import styles from '../DrivePage.module.css';

export default function WorkerUsageCard({ t }) {
  const [workerUsage, setWorkerUsage] = useState({});
  const [loading, setLoading] = useState(true);

  const PUBLIC_WORKERS = [
    { label: 'Disbox Public #1 (Main)', url: 'https://disbox-shared-link.naufal-backup.workers.dev' },
    { label: 'Disbox Public #2 (New)', url: 'https://disbox-shared-link.alamsyahnaufal453.workers.dev' },
    { label: 'Disbox Public #3', url: 'https://disbox-worker-2.naufal-backup.workers.dev' },
    { label: 'Disbox Public #4', url: 'https://disbox-worker-3.naufal-backup.workers.dev' },
  ];

  useEffect(() => {
    let isMounted = true;
    const fetchUsage = async () => {
      setLoading(true);
      const results = {};
      await Promise.all(PUBLIC_WORKERS.map(async (worker) => {
        try {
          const res = await fetch(`${worker.url}/share/stats`);
          if (res.ok && isMounted) {
            const data = await res.json();
            results[worker.url] = data;
          }
        } catch (e) {
          if (isMounted) {
            try {
              const ping = await fetch(worker.url);
              if (ping.status < 500) results[worker.url] = { status: 'Online' };
            } catch (_) {}
          }
        }
      }));
      if (isMounted) { setWorkerUsage(results); setLoading(false); }
    };
    fetchUsage();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className={styles.aboutCard} style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Activity size={16} style={{ color: 'var(--accent)' }} />
        <h3 className={styles.sectionTitle} style={{ marginBottom: 0 }}>Worker Usage</h3>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PUBLIC_WORKERS.map(worker => (
          <div key={worker.url} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 0', borderBottom: '1px solid var(--border)'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{worker.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {worker.url.replace('https://', '')}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              {workerUsage[worker.url] ? (
                <>
                  {workerUsage[worker.url].links !== undefined && (
                    <span style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>
                      {workerUsage[worker.url].links} links
                    </span>
                  )}
                  {workerUsage[worker.url].requests !== undefined && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {workerUsage[worker.url].requests} reqs
                    </span>
                  )}
                </>
              ) : loading ? (
                <div className="skeleton" style={{ width: 40, height: 16, borderRadius: 4 }} />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
