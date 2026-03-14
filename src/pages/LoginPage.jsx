import { useState, useEffect } from 'react';
import { Cloud, ExternalLink, AlertCircle, Loader2, Clock, ChevronDown, X } from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import styles from './LoginPage.module.css';

const DISCORD_WEBHOOK_REGEX = /^https:\/\/discord(app)?\.com\/api\/webhooks\/\d+\/.+$/;

export default function LoginPage() {
  const { connect, loading, savedWebhooks, t } = useApp();
  const [url, setUrl] = useState('');
  const [metadataId, setMetadataId] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Auto-load config: saat URL berubah dan valid, tampilkan info
  const isValid = DISCORD_WEBHOOK_REGEX.test(url.trim());

  // Auto-fill dari saved webhook pertama kali (tapi jangan auto-connect)
  useEffect(() => {
    if (!url && savedWebhooks.length > 0) {
      // Jangan auto-fill — biarkan user pilih sendiri
    }
  }, []);

  const handleConnect = async (webhookUrl) => {
    const target = webhookUrl || url.trim();
    setError('');
    if (!target) { setError('Masukkan webhook URL'); return; }
    if (!DISCORD_WEBHOOK_REGEX.test(target)) {
      setError('Format webhook URL tidak valid');
      return;
    }
    if (webhookUrl) setUrl(webhookUrl);
    const result = await connect(target, metadataId.trim() || null);
    if (!result.ok) {
      setError('Gagal connect. Pastikan webhook URL benar dan coba lagi.');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.bg}>
        <div className={styles.glow1} />
        <div className={styles.glow2} />
        <div className={styles.grid} />
      </div>

      <div className={styles.card}>
        <div className={styles.logo}>
          <div className={styles.logoRing}>
            <Cloud size={28} strokeWidth={1.5} />
          </div>
        </div>

        <h1 className={styles.title}>Disbox</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>

        <div className={styles.features}>
          {[t('feature_unlimited'), t('feature_chunk'), t('feature_local'), t('feature_virtual')].map(f => (
            <div key={f} className={styles.feature}>
              <div className={styles.featureDot} />
              <span>{f}</span>
            </div>
          ))}
        </div>

        <div className={styles.divider} />

        {/* Saved webhooks */}
        {savedWebhooks.length > 0 && (
          <div className={styles.savedSection}>
            <button
              className={styles.savedToggle}
              onClick={() => setShowHistory(h => !h)}
            >
              <Clock size={12} />
              <span>{t('saved_webhooks_count', { count: savedWebhooks.length })}</span>
              <ChevronDown size={12} style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>

            {showHistory && (
              <div className={styles.savedList}>
                {savedWebhooks.map((w, i) => (
                  <button
                    key={i}
                    className={styles.savedItem}
                    onClick={() => handleConnect(w.url)}
                    disabled={loading}
                  >
                    <div className={styles.savedIcon}>
                      <Cloud size={11} />
                    </div>
                    <div className={styles.savedInfo}>
                      <span className={styles.savedLabel}>{w.label}</span>
                      <span className={styles.savedUrl}>{w.url.slice(0, 48)}…</span>
                    </div>
                    {loading ? <Loader2 size={12} className="spin" /> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* URL Input */}
        <div className={styles.inputGroup}>
          <label className={styles.label}>{t('webhook_url')}</label>
          <div className={styles.inputRow}>
            <input
              type="text"
              className={`${styles.input} ${error ? styles.inputError : ''} ${isValid ? styles.inputValid : ''}`}
              placeholder={t('webhook_placeholder')}
              value={url}
              onChange={e => { setUrl(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
              spellCheck={false}
              autoFocus
            />
            {url && (
              <button className={styles.clearBtn} onClick={() => { setUrl(''); setError(''); }}>
                <X size={12} />
              </button>
            )}
          </div>
          {error && (
            <div className={styles.errorMsg}>
              <AlertCircle size={12} /> {error}
            </div>
          )}
          {isValid && !error && (
            <div className={styles.validMsg}>✓ {t('url_valid')}</div>
          )}
        </div>

        {/* Advanced Options */}
        <div className={styles.advancedSection}>
          <button 
            className={styles.advancedToggle}
            onClick={() => setShowAdvanced(!showAdvanced)}
            type="button"
          >
            {showAdvanced ? t('hide_advanced') : t('advanced_options')}
          </button>
          
          {showAdvanced && (
            <div className={styles.advancedFields}>
              <label className={styles.label}>{t('metadata_msg_id')}</label>
              <input
                type="text"
                className={styles.input}
                placeholder={t('metadata_id_placeholder')}
                value={metadataId}
                onChange={e => setMetadataId(e.target.value)}
              />
              <p className={styles.helpText}>{t('metadata_help')}</p>
            </div>
          )}
        </div>

        <button className={styles.connectBtn} onClick={() => handleConnect()} disabled={loading || !url.trim()}>
          {loading ? (
            <><Loader2 size={16} className="spin" /> {t('connecting')}</>
          ) : (
            <><Cloud size={16} /> {t('connect_drive')}</>
          )}
        </button>

        <div className={styles.help}>
          <a
            className={styles.helpLink}
            href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
            target="_blank"
            rel="noreferrer"
            onClick={e => { e.preventDefault(); window.open?.(e.currentTarget.href, '_blank'); }}
          >
            <ExternalLink size={11} /> {t('how_to_webhook')}
          </a>
        </div>
      </div>

      <div className={styles.version}>
        <div>Disbox v3.6.0 · Serverless Edition</div>
        <div style={{ marginTop: 4, opacity: 0.6, fontSize: '0.9em' }}>
          Created by <b>naufal-backup</b> · naufalalamsyah453@gmail.com
        </div>
      </div>
    </div>
  );
}
