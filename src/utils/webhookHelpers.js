export const SAVED_WEBHOOKS_KEY = 'disbox_saved_webhooks';

export function getSavedWebhooks() {
  try { return JSON.parse(localStorage.getItem(SAVED_WEBHOOKS_KEY) || '[]'); }
  catch (e) { return []; }
}

export function extractWebhookLabel(url) {
  const parts = url.split('/');
  return parts[parts.length - 2] ? `Webhook #${parts[parts.length - 2].slice(-6)}` : 'Unnamed';
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
