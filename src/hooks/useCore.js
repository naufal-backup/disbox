import { useState } from 'react';

const SAVED_WEBHOOKS_KEY = 'disbox_saved_webhooks';

export function getSavedWebhooks() {
  try { return JSON.parse(localStorage.getItem(SAVED_WEBHOOKS_KEY) || '[]'); }
  catch (e) { return []; }
}

export function saveWebhookToList(url, label) {
  const list = getSavedWebhooks();
  const index = list.findIndex(i => i.url === url);
  const entry = { url, label: label || (index >= 0 ? list[index].label : extractWebhookLabel(url)), lastUsed: Date.now() };
  if (index >= 0) list.splice(index, 1);
  list.unshift(entry);
  localStorage.setItem(SAVED_WEBHOOKS_KEY, JSON.stringify(list.slice(0, 50)));
}

export function updateWebhookLabel(url, label) {
  const list = getSavedWebhooks();
  const index = list.findIndex(i => i.url === url);
  if (index >= 0) {
    list[index].label = label;
    localStorage.setItem(SAVED_WEBHOOKS_KEY, JSON.stringify(list));
    return true;
  }
  return false;
}

export function removeWebhook(url) {
  const list = getSavedWebhooks().filter(i => i.url !== url);
  localStorage.setItem(SAVED_WEBHOOKS_KEY, JSON.stringify(list));
}

export function extractWebhookLabel(url) {
  const parts = url.split('/');
  return parts[parts.length - 2] ? `Webhook #${parts[parts.length - 2].slice(-6)}` : 'Unnamed';
}

export function useCore() {
  const [api, setApi] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem('disbox_webhook') || '');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [metadataStatus, setMetadataStatus] = useState({ status: 'synced', items: 0 });
  const [savedWebhooks, setSavedWebhooks] = useState(getSavedWebhooks);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playlist, setPlaylist] = useState([]);

  const handleUpdateLabel = (url, label) => { if (updateWebhookLabel(url, label)) setSavedWebhooks(getSavedWebhooks()); };
  const handleRemoveWebhook = (url) => { removeWebhook(url); setSavedWebhooks(getSavedWebhooks()); };

  return {
    api, setApi, webhookUrl, setWebhookUrl, isConnected, setIsConnected,
    isConnecting, setIsConnecting, loading, setLoading, metadataStatus, setMetadataStatus,
    savedWebhooks, setSavedWebhooks, isSidebarOpen, setIsSidebarOpen,
    currentTrack, setCurrentTrack, playlist, setPlaylist,
    updateWebhookLabel: handleUpdateLabel, removeWebhook: handleRemoveWebhook
  };
}