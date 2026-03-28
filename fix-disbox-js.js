const fs = require('fs');
let code = fs.readFileSync('src/utils/disbox.js', 'utf8');

// Use a simple, robust syncMetadata that handles 0 items correctly
const newSyncMetadata = \`  async syncMetadata(forceId = null) {
    if (this._syncPromise) return this._syncPromise;

    this._syncPromise = (async () => {
      try {
        console.log('[sync] Starting synchronization...');
        const discovery = forceId ? { best: forceId, snapshotHistory: [] } : await this._getMsgIdFromDiscovery();
        
        if (discovery === 'already_running') {
           console.log('[sync] Discovery already running, skipping.');
           return false;
        }

        if (!discovery || discovery === 'pending') {
          console.log('[sync] No discovery result or pending.');
          return false;
        }

        const { best: msgId, snapshotHistory } = discovery;
        
        const local = await window.electron.loadMetadata(this.hashedWebhook);
        const hasLocal = Array.isArray(local) && local.length > 0;

        if (!forceId && msgId === this.lastSyncedId && hasLocal) {
          console.log(\\\`[sync] Already synced (ID: \\\${msgId}, Items: \\\${local.length})\\\`);
          return true;
        }

        if (!msgId) {
          console.log('[sync] Cloud is empty.');
          return true;
        }

        console.log(\\\`[sync-lifecycle] download disbox metadata json: \\\${msgId}\\\`);
        const data = await this._downloadMetadataFromMsg(msgId).catch(async (e) => {
          console.warn('Primary download failed, trying fallbacks...');
          for (const fid of snapshotHistory) {
            try { return await this._downloadMetadataFromMsg(fid); } catch (_) {}
          }
          throw e;
        });

        console.log(\\\`[sync-lifecycle] load file disbox metadata: \\\${msgId}\\\`);
        const ok = await window.electron.saveMetadata(this.hashedWebhook, data, msgId);
        if (ok) {
          this.lastSyncedId = msgId;
          localStorage.setItem(\\\`dbx_last_sync_\\\${this.hashedWebhook}\\\`, msgId);
          console.log('[sync] ✓ Sync completed.');
          return true;
        }
        return false;
      } catch (e) {
        console.error('[sync] Fatal error:', e.message);
        return false;
      } finally {
        this._syncPromise = null;
      }
    })();

    return this._syncPromise;
  }\`;

// Replace the old syncMetadata
const startTag = '  async syncMetadata(forceId = null) {';
const endTag = '  async uploadMetadataToDiscord(_files) {';
const startIndex = code.indexOf(startTag);
const endIndex = code.indexOf(endTag);

if (startIndex !== -1 && endIndex !== -1) {
    code = code.substring(0, startIndex) + newSyncMetadata + "\\n\\n" + code.substring(endIndex);
    fs.writeFileSync('src/utils/disbox.js', code);
    console.log('disbox.js updated.');
} else {
    console.error('Could not find syncMetadata tags.');
}
