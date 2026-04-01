/**
 * ShareViewPage.jsx
 *
 * Redirect ke CF Worker share URL.
 * CF Worker yang handle preview & download — bukan Vercel.
 *
 * Route: /share/* → App.jsx → render ini
 * Token di URL: /share/TOKEN
 *
 * CF Worker URL diambil dari share settings cookie.
 * Jika tidak ada, fallback ke worker publik default.
 */

import { useEffect } from 'react';

const DEFAULT_WORKER = 'https://disbox-shared-link.naufal-backup.workers.dev';

export default function ShareViewPage() {
  useEffect(() => {
    // Token = seluruh path setelah /share/
    const token = window.location.pathname.replace(/^\/share\//, '');
    if (!token) return;

    // Ambil CF Worker URL dari cookie share settings jika ada
    let workerUrl = DEFAULT_WORKER;
    try {
      const allCookies = document.cookie.split(';');
      for (const c of allCookies) {
        const [k, v] = c.trim().split('=');
        if (k?.startsWith('dbx_share_') && v) {
          const settings = JSON.parse(atob(v));
          if (settings?.cf_worker_url) {
            workerUrl = settings.cf_worker_url;
            break;
          }
        }
      }
    } catch {}

    // Redirect ke CF Worker
    window.location.replace(`${workerUrl}/share/${token}`);
  }, []);

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#09090b', color: '#a1a1aa', fontFamily: 'sans-serif', gap: 12,
      flexDirection: 'column',
    }}>
      <div style={{ width: 32, height: 32, border: '3px solid #5865f2', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ fontSize: 14 }}>Mengarahkan ke halaman berbagi...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
