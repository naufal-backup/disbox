/**
 * DiscordSetupPage.jsx
 */

import { useEffect, useState, useRef } from 'react';
import { Search, ChevronRight, X, PartyPopper, Hexagon, AlertTriangle, Crown, Shield } from 'lucide-react';
import { useApp } from '../context/useAppHook.js';
import styles from './DiscordSetupPage.module.css';
import GuildIcon from './DiscordSetupPage/GuildIcon.jsx';
import StepList from './DiscordSetupPage/StepList.jsx';

const DISCORD_API          = 'https://discord.com/api/v10';
const PERM_MANAGE_WEBHOOKS = 0x20n;
const PERM_ADMINISTRATOR   = 0x8n;

async function discordFetch(path, token, options = {}) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      console.error('[discord] 401 Unauthorized for path:', path);
      // Mungkin token expired atau invalid
      sessionStorage.removeItem('dbx_oauth_token');
    }
    throw new Error(data.message || `Discord API error ${res.status}`);
  }
  return data;
}

function canManageWebhooks(guild) {
  const perms = BigInt(guild.permissions || '0');
  return (perms & PERM_MANAGE_WEBHOOKS) !== 0n || (perms & PERM_ADMINISTRATOR) !== 0n;
}

export default function DiscordSetupPage({ onBack }) {
  const { connect } = useApp();

  const [phase,  setPhase]  = useState('loading');
  const [step,   setStep]   = useState('channel');
  const [error,  setError]  = useState('');
  const [guilds, setGuilds] = useState([]);
  const [token,  setToken]  = useState('');
  const [busy,   setBusy]   = useState(false);
  const [search, setSearch] = useState('');
  const ran = useRef(false);

  // Ambil code SEKALI saat komponen pertama kali mount — sebelum URL diubah apapun
  const initialCode = useRef(new URLSearchParams(window.location.search).get('code'));

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    
    // Simpan code ke sessionStorage jika ada, agar bisa di-recovery jika re-mount
    const code = initialCode.current;
    if (code) {
      sessionStorage.setItem('dbx_oauth_code_pending', code);
      // Bersihkan URL — ini aman karena code sudah diamankan di sessionStorage
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    bootstrap();
  }, []);

  async function bootstrap() {
    setPhase('loading');
    setError('');
    try {
      // 1. Cek jika sudah ada access_token (berhasil login sebelumnya)
      let accessToken = sessionStorage.getItem('dbx_oauth_token');

      // 2. Jika belum, coba ambil code dari sessionStorage (yang kita simpan di useEffect)
      if (!accessToken) {
        const code = sessionStorage.getItem('dbx_oauth_code_pending');
        
        if (window._dbx_exchanging_code) {
          console.log('[setup] Exchange already in progress, waiting...');
          return; 
        }

        if (!code) throw new Error('Sesi OAuth tidak ditemukan. Silakan klik "Buat Drive Baru" lagi.');

        window._dbx_exchanging_code = true;
        try {
          const cbRes  = await fetch(`/api/discord/callback?code=${encodeURIComponent(code)}`);
          const cbData = await cbRes.json();
          if (!cbData.ok) throw new Error(cbData.error || 'Autentikasi Discord gagal.');

          accessToken = cbData.access_token;
          sessionStorage.setItem('dbx_oauth_token', accessToken);
          if (cbData.user_id) sessionStorage.setItem('dbx_user_id', cbData.user_id);
          sessionStorage.removeItem('dbx_oauth_code_pending');

          // ─── CLOUD SYNC: Gunakan config dari KV jika ada ───
          if (cbData.cloud_config && cbData.cloud_config.webhook_url) {
            console.log('[setup] Found cloud config, connecting automatically...');
            const result = await connect(cbData.cloud_config.webhook_url, { 
              forceId: cbData.cloud_config.last_msg_id 
            });
            if (result.ok) {
              setPhase('done');
              return;
            }
          }

          // JIKA ADA WEBHOOK DARI OAUTH (Drive Baru atau Re-Auth)
          if (cbData.webhook && cbData.webhook.url) {
            console.log('[setup] Webhook received from OAuth, connecting directly...');
            
            let connectOptions = {};
            
            if (cbData.webhook.channel_id) {
              try {
                console.log('[setup] Attempting to discover existing metadata in channel:', cbData.webhook.channel_id);
                const discRes = await fetch(`/api/discord/discover?channel_id=${cbData.webhook.channel_id}&access_token=${accessToken}`);
                const discData = await discRes.json();
                
                if (discData.ok && discData.found) {
                  console.log('[setup] Discovery SUCCESS:', discData.filename, discData.metadata_url);
                  connectOptions.metadataUrl = discData.metadata_url;
                } else {
                  console.log('[setup] Discovery result: No metadata file found in channel.');
                }
              } catch (e) {
                console.warn('[setup] Discovery failed, proceeding with empty drive:', e.message);
              }
            }

            const result = await connect(cbData.webhook.url, connectOptions);
            if (result.ok) {
              // Simpan identitas user untuk Cloud Sync
              if (cbData.user_id) localStorage.setItem('dbx_user_id', cbData.user_id);
              if (cbData.username) localStorage.setItem('dbx_username', cbData.username);

              // ─── CLOUD SYNC: Simpan config awal ke KV ───
              if (cbData.user_id || cbData.username) {
                fetch('/api/cloud/sync', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    user_id: cbData.user_id,
                    username: cbData.username,
                    webhook_url: cbData.webhook.url,
                    last_msg_id: result.instance?.lastSyncedId || null
                  })
                }).catch(e => console.warn('[cloud] Initial sync failed:', e.message));
              }

              setPhase('done');
              return;
            }
          }
        } finally {
          window._dbx_exchanging_code = false;
        }
      }

      if (!accessToken) return; // Menunggu mount pertama selesai

      setToken(accessToken);
      const allGuilds = await discordFetch('/users/@me/guilds', accessToken);
      setGuilds(allGuilds.filter(canManageWebhooks));
      setPhase('pick');
    } catch (e) {
      setError(e.message);
      setPhase('error');
    }
  }

  async function handlePickGuild(guild) {
    setBusy(true);
    setPhase('setup');
    setStep('channel');
    setError('');

    try {
      // Channel
      const channels = await discordFetch(`/guilds/${guild.id}/channels`, token);
      let ch = channels.find(c => c.type === 0 && c.name === 'disbox-storage');
      if (!ch) {
        try {
          ch = await discordFetch(`/guilds/${guild.id}/channels`, token, {
            method: 'POST',
            body: JSON.stringify({ name: 'disbox-storage', type: 0, topic: 'Disbox file storage — jangan hapus!' }),
          });
        } catch {
          ch = channels.find(c => c.type === 0);
          if (!ch) throw new Error('Tidak ada channel teks. Buat channel teks dulu di server ini.');
        }
      }

      // Webhook
      setStep('webhook');
      const webhook = await discordFetch(`/channels/${ch.id}/webhooks`, token, {
        method: 'POST',
        body: JSON.stringify({ name: 'Disbox Storage' }),
      });
      const webhookUrl = `https://discord.com/api/webhooks/${webhook.id}/${webhook.token}`;

      // Connect
      setStep('connect');
      const result = await connect(webhookUrl);
      if (!result.ok) throw new Error('Gagal connect: ' + (result.message || result.reason));

      sessionStorage.removeItem('dbx_oauth_token');
      setPhase('done');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const filteredGuilds = guilds.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  // Done
  if (phase === 'done') {
    return (
      <div className={styles.card}>
        <div className={styles.doneWrap}>
          <div className={styles.doneEmoji}><PartyPopper size={48} /></div>
          <h2 className={styles.doneTitle}>Drive Siap!</h2>
          <p className={styles.doneSub}>
            Channel <strong>#disbox-storage</strong> dan webhook sudah dibuat otomatis.
            Kamu sekarang bisa upload dan download file.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerIcon}><Hexagon size={24} /></div>
        <div className={styles.headerText}>
          <h2 className={styles.headerTitle}>
            {phase === 'pick'    ? 'Pilih Server Discord'  :
             phase === 'setup'   ? 'Menyiapkan Drive'      :
             phase === 'loading' ? 'Mengautentikasi'       : 'Terjadi Kesalahan'}
          </h2>
          <p className={styles.headerSub}>
            {phase === 'pick'    ? 'Disbox akan membuat webhook di server pilihanmu'  :
             phase === 'setup'   ? 'Membuat channel dan webhook...'                   :
             phase === 'loading' ? 'Menghubungi Discord...'                           : ''}
          </p>
        </div>
      </div>

      {/* Loading */}
      {phase === 'loading' && (
        <div className={styles.loadingWrap}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Memuat daftar server...</p>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className={styles.errorBox}>
          <span className={styles.errorIcon}><AlertTriangle size={18} /></span>
          <p className={styles.errorMsg}>{error}</p>
          <div className={styles.errorActions}>
            <button className={styles.btnPrimary} onClick={() => { sessionStorage.removeItem('dbx_oauth_token'); ran.current = false; bootstrap(); }}>
              Coba Lagi
            </button>
            <button className={styles.btnSecondary} onClick={onBack}>
              Kembali
            </button>
          </div>
        </div>
      )}

      {/* Server picker */}
      {phase === 'pick' && (
        <div className={styles.pickWrap}>
          {guilds.length > 5 && (
            <div className={styles.searchBox}>
              <Search size={14} strokeWidth={2.5} />
              <input
                className={styles.searchInput}
                placeholder="Cari server..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
              {search && (
                <button className={styles.searchClear} onClick={() => setSearch('')}><X size={14} /></button>
              )}
            </div>
          )}

          <p className={styles.pickHint}>
            Hanya server yang kamu kelola webhooknya yang ditampilkan.
          </p>

          <div className={styles.guildList}>
            {filteredGuilds.length === 0 && (
              <div className={styles.guildEmpty}>
                <span>{search ? `Tidak ada server "${search}"` : 'Tidak ada server yang tersedia.'}</span>
                <span>Kamu perlu menjadi Owner atau Admin di server tersebut.</span>
              </div>
            )}
            {filteredGuilds.map(guild => (
              <button
                key={guild.id}
                className={styles.guildItem}
                onClick={() => handlePickGuild(guild)}
                disabled={busy}
              >
                <GuildIcon guild={guild} size={40} />
                <div className={styles.guildInfo}>
                  <span className={styles.guildName}>{guild.name}</span>
                  <span className={styles.guildRole}>
                    {guild.owner ? <><Crown size={12} style={{ marginRight: 4, color: '#f1c40f' }} /> Owner</> : <><Shield size={12} style={{ marginRight: 4, color: '#95a5a6' }} /> Admin</>}
                  </span>
                </div>                <ChevronRight className={styles.guildArrow} size={16} strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Setup steps */}
      {phase === 'setup' && (
        <div className={styles.setupWrap}>
          <StepList current={step} error={error} />
          {error && (
            <div className={styles.errorBox} style={{ marginTop: 16 }}>
              <span className={styles.errorIcon}><AlertTriangle size={18} /></span>
              <p className={styles.errorMsg}>{error}</p>
              <div className={styles.errorActions}>
                <button className={styles.btnPrimary} onClick={() => { setError(''); setPhase('pick'); }}>
                  Pilih Server Lain
                </button>
                <button className={styles.btnSecondary} onClick={onBack}>
                  Kembali
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
