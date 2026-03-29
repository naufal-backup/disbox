import { useState, useEffect, useCallback } from 'react';
import { translations } from '@/utils/i18n.js';
import { ipc } from '@/utils/ipc';

export function usePreferences(api) {
  const [language, setLanguage] = useState(() => localStorage.getItem('disbox_lang') || 'id');
  const [theme, setTheme] = useState(() => localStorage.getItem('disbox_theme') || 'dark');
  const [uiScale, setUiScale] = useState(() => Number(localStorage.getItem('disbox_ui_scale')) || 1);
  const [chunkSize, setChunkSize] = useState(() => {
    const saved = localStorage.getItem('disbox_chunk_size');
    if (!saved) return 7.5 * 1024 * 1024;
    let val = Number(saved);
    if (val >= 8 * 1024 * 1024) return 7.5 * 1024 * 1024;
    return val;
  });
  const [showPreviews, setShowPreviews] = useState(() => localStorage.getItem('disbox_show_previews') !== 'false');
  const [showImagePreviews, setShowImagePreviews] = useState(() => localStorage.getItem('disbox_show_image_previews') !== 'false');
  const [showVideoPreviews, setShowVideoPreviews] = useState(() => localStorage.getItem('disbox_show_video_previews') !== 'false');
  const [showAudioPreviews, setShowAudioPreviews] = useState(() => localStorage.getItem('disbox_show_audio_previews') !== 'false');
  const [showRecent, setShowRecent] = useState(() => localStorage.getItem('disbox_show_recent') !== 'false');
  const [autoCloseTransfers, setAutoCloseTransfers] = useState(() => localStorage.getItem('disbox_auto_close_transfers') !== 'false');
  const [animationsEnabled, setAnimationsEnabled] = useState(() => localStorage.getItem('disbox_animations_enabled') !== 'false');
  const [closeToTray, setCloseToTray] = useState(true);
  const [startMinimized, setStartMinimized] = useState(false);
  const [chunksPerMessage, setChunksPerMessage] = useState(1);

  useEffect(() => { localStorage.setItem('disbox_animations_enabled', animationsEnabled.toString()); }, [animationsEnabled]);

  useEffect(() => {
    if (ipc?.getPrefs) {
      ipc.getPrefs().then(p => {
        if (p.closeToTray !== undefined) setCloseToTray(p.closeToTray);
        if (p.startMinimized !== undefined) setStartMinimized(p.startMinimized);
        if (p.chunksPerMessage !== undefined) setChunksPerMessage(p.chunksPerMessage);
        if (p.autoCloseTransfers !== undefined) setAutoCloseTransfers(p.autoCloseTransfers);
      });
    }
  }, []);

  const updatePrefs = useCallback((prefs) => {
    if (prefs.closeToTray !== undefined) setCloseToTray(prefs.closeToTray);
    if (prefs.startMinimized !== undefined) setStartMinimized(prefs.startMinimized);
    if (prefs.chunksPerMessage !== undefined) setChunksPerMessage(prefs.chunksPerMessage);
    if (prefs.showRecent !== undefined) { setShowRecent(prefs.showRecent); localStorage.setItem('disbox_show_recent', prefs.showRecent.toString()); }
    if (prefs.autoCloseTransfers !== undefined) { setAutoCloseTransfers(prefs.autoCloseTransfers); localStorage.setItem('disbox_auto_close_transfers', prefs.autoCloseTransfers.toString()); }
    if (prefs.showPreviews !== undefined) { setShowPreviews(prefs.showPreviews); localStorage.setItem('disbox_show_previews', prefs.showPreviews.toString()); }
    if (prefs.showImagePreviews !== undefined) { setShowImagePreviews(prefs.showImagePreviews); localStorage.setItem('disbox_show_image_previews', prefs.showImagePreviews.toString()); }
    if (prefs.showVideoPreviews !== undefined) { setShowVideoPreviews(prefs.showVideoPreviews); localStorage.setItem('disbox_show_video_previews', prefs.showVideoPreviews.toString()); }
    if (prefs.showAudioPreviews !== undefined) { setShowAudioPreviews(prefs.showAudioPreviews); localStorage.setItem('disbox_show_audio_previews', prefs.showAudioPreviews.toString()); }
    if (ipc?.setPrefs) ipc.setPrefs(prefs);
  }, []);

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('disbox_theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('disbox_lang', language); }, [language]);

  const t = useCallback((key, params = null) => {
    let text = translations[language]?.[key] || translations['en']?.[key] || key;
    if (params) { Object.keys(params).forEach(k => { text = text.replace(`{${k}}`, params[k]); }); }
    return text;
  }, [language]);

  useEffect(() => { document.body.style.zoom = uiScale; localStorage.setItem('disbox_ui_scale', uiScale.toString()); }, [uiScale]);
  useEffect(() => { localStorage.setItem('disbox_chunk_size', chunkSize.toString()); if (api) api.chunkSize = chunkSize; }, [chunkSize, api]);
  useEffect(() => { localStorage.setItem('disbox_show_previews', showPreviews.toString()); }, [showPreviews]);

  const toggleTheme = useCallback(() => { setTheme(prev => prev === 'dark' ? 'light' : 'dark'); }, []);

  return {
    language, setLanguage, theme, setTheme, toggleTheme, uiScale, setUiScale, chunkSize, setChunkSize,
    showPreviews, setShowPreviews, showImagePreviews, setShowImagePreviews, showVideoPreviews, setShowVideoPreviews,
    showAudioPreviews, setShowAudioPreviews, showRecent, setShowRecent, autoCloseTransfers, setAutoCloseTransfers,
    animationsEnabled, setAnimationsEnabled, closeToTray, startMinimized, chunksPerMessage, updatePrefs, t
  };
}