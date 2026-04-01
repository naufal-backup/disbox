import { useState, useEffect } from 'react';
import { useApp } from '../context/useAppHook.js';
import { User, Mail, Shield, Key, Edit2, Check, X, LogOut, Trash2, AlertCircle, Cloud, RefreshCw, Smartphone, Monitor, Globe } from 'lucide-react';
import { BASE_API } from '../utils/disbox.js';
import styles from './ProfilePage.module.css';

export default function ProfilePage() {
  const { webhookUrl, disconnect, api, files, t } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const currentAccount = localStorage.getItem('dbx_username');

  const handleRegister = async (e) => {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      const currentId = api?.lastSyncedId || localStorage.getItem("dbx_last_sync_" + api?.hashedWebhook);
      
      const res = await window.electron.fetch(`${BASE_API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          webhook_url: webhookUrl,
          last_msg_id: currentId
        })
      });
      
      const data = JSON.parse(res.body);
      
      if (res.ok && data.ok) {
        setStatus({ type: 'success', msg: 'Akun terdaftar!' });
        localStorage.setItem('dbx_username', username.trim().toLowerCase());
        
        // ─── PENTING: Sync metadata ke Cloud segera setelah register ───
        if (api && files.length > 0) {
          console.log('[Profile] Initial cloud sync after registration...');
          await api.uploadMetadataToDiscord(files);
        }
      } else {
        setStatus({ type: 'error', msg: data.error || 'Gagal mendaftar.' });
      }
    } catch (e) {
      console.error('[Profile] Register error:', e);
      setStatus({ type: 'error', msg: 'Gagal menghubungi server.' });
    } finally { setBusy(false); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setBusy(true); setStatus(null);
    try {
      const res = await window.electron.fetch(`${BASE_API}/api/auth/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_username: currentAccount,
          new_username: username.trim() || currentAccount,
          new_password: password || null
        })
      });
      
      const data = JSON.parse(res.body);
      
      if (res.ok && data.ok) {
        setStatus({ type: 'success', msg: 'Akun berhasil diperbarui!' });
        localStorage.setItem('dbx_username', data.username);
        setTimeout(() => { setIsEditing(false); setStatus(null); }, 2000);
      } else {
        setStatus({ type: 'error', msg: data.error || 'Gagal memperbarui profil.' });
      }
    } catch (e) {
      console.error('[Profile] Update error:', e);
      setStatus({ type: 'error', msg: 'Gagal menghubungi server.' });
    } finally { setBusy(false); }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t('profile')}</h1>
        <p className={styles.subtitle}>Kelola akun cloud dan preferensi akses Anda.</p>
      </div>

      <div className={styles.grid}>
        <div className={styles.mainCard}>
          <div className={styles.userBadge}>
            <div className={styles.avatar}>
              <User size={32} />
            </div>
            <div>
              <h2 className={styles.userName}>{currentAccount ? `@${currentAccount}` : 'Guest User'}</h2>
              <p className={styles.userStatus}>{currentAccount ? 'Cloud Member' : 'Local Session'}</p>
            </div>
          </div>

          <div className={styles.divider} />

          {!currentAccount ? (
            <div className={styles.registerSection}>
              <div className={styles.infoBox}>
                <Cloud className={styles.infoIcon} size={20} />
                <div className={styles.infoContent}>
                  <h3 className={styles.infoTitle}>Daftarkan Akun Cloud</h3>
                  <p className={styles.infoText}>Simpan konfigurasi webhook dan metadata Anda di cloud untuk akses lintas perangkat yang lebih mudah.</p>
                </div>
              </div>

              <form className={styles.form} onSubmit={handleRegister}>
                <div className={styles.inputGroup}>
                  <label>Username</label>
                  <input type="text" placeholder="Pilih username" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
                <div className={styles.inputGroup}>
                  <label>Password</label>
                  <input type="password" placeholder="Buat password" value={password} onChange={e => setPassword(e.target.value)} required />
                </div>
                {status && <div className={`${styles.alert} ${styles[status.type]}`}><AlertCircle size={14} /> {status.msg}</div>}
                <button className={styles.btnPrimary} type="submit" disabled={busy}>
                  {busy ? <RefreshCw className="spin" size={16} /> : <Key size={16} />}
                  Daftar Akun Cloud
                </button>
              </form>
            </div>
          ) : (
            <div className={styles.accountDetails}>
              {isEditing ? (
                <form className={styles.form} onSubmit={handleUpdate}>
                  <div className={styles.inputGroup}>
                    <label>Username Baru</label>
                    <input type="text" placeholder={currentAccount} value={username} onChange={e => setUsername(e.target.value)} />
                  </div>
                  <div className={styles.inputGroup}>
                    <label>Password Baru (Opsional)</label>
                    <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
                  </div>
                  {status && <div className={`${styles.alert} ${styles[status.type]}`}><AlertCircle size={14} /> {status.msg}</div>}
                  <div className={styles.btnGroup}>
                    <button className={styles.btnPrimary} type="submit" disabled={busy}>
                      {busy ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}
                      Simpan Perubahan
                    </button>
                    <button className={styles.btnGhost} type="button" onClick={() => setIsEditing(false)}>Batal</button>
                  </div>
                </form>
              ) : (
                <div className={styles.actionList}>
                  <button className={styles.actionItem} onClick={() => setIsEditing(true)}>
                    <div className={styles.actionIcon}><Edit2 size={18} /></div>
                    <div className={styles.actionText}>
                      <h4>Ubah Profil</h4>
                      <p>Ganti username atau password akun Anda.</p>
                    </div>
                  </button>
                  <button className={styles.actionItem} onClick={disconnect}>
                    <div className={`${styles.actionIcon} ${styles.dangerIcon}`}><LogOut size={18} /></div>
                    <div className={styles.actionText}>
                      <h4>Putuskan Sesi</h4>
                      <p>Keluar dari drive ini dan kembali ke halaman login.</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.sideInfo}>
          <div className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Platform Info</h3>
            <div className={styles.platformList}>
              <div className={styles.platformItem}>
                <Monitor size={16} />
                <span>Windows / Linux Desktop</span>
              </div>
              <div className={styles.platformItem}>
                <Smartphone size={16} />
                <span>Android (Coming Soon)</span>
              </div>
              <div className={styles.platformItem}>
                <Globe size={16} />
                <span>Web Browser</span>
              </div>
            </div>
          </div>

          <div className={styles.infoCard}>
            <h3 className={styles.cardTitle}>Webhook Info</h3>
            <div className={styles.webhookBadge}>
              <Shield size={14} />
              <span>{webhookUrl ? `ID: ${webhookUrl.split('/').slice(-2, -1)}` : 'No Webhook Connected'}</span>
            </div>
            <p className={styles.webhookDesc}>Metadata Anda dienkripsi dengan <b>AES-GCM</b> sebelum diunggah ke Discord.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
