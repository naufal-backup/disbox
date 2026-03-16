addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Disbox-Key'
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const stats = await SHARE_KV.get('internal_stats', 'json') || { requests: 0 };
    stats.requests++;
    await SHARE_KV.put('internal_stats', JSON.stringify(stats));
  } catch (e) {}

  if (path === '/share/stats' && request.method === 'GET') {
    const list = await SHARE_KV.list({ prefix: 'share_' });
    const stats = await SHARE_KV.get('internal_stats', 'json') || { requests: 0 };
    return new Response(JSON.stringify({
      links: list.keys.length,
      requests: stats.requests
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (path === '/share/create' && request.method === 'POST') {
    if (request.headers.get('X-Disbox-Key') !== DISBOX_API_KEY)
      return new Response('Unauthorized', { status: 401, headers: cors });
    const body = await request.json();
    await SHARE_KV.put('share_' + body.token, JSON.stringify(body),
                       body.expiresAt ? { expiration: Math.floor(body.expiresAt / 1000) } : undefined);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (path.startsWith('/share/revoke-all/') && request.method === 'DELETE') {
    if (request.headers.get('X-Disbox-Key') !== DISBOX_API_KEY)
      return new Response('Unauthorized', { status: 401, headers: cors });
    const hash = path.replace('/share/revoke-all/', '');
    let cursor = undefined;
    do {
      const list = await SHARE_KV.list({ prefix: 'share_', cursor });
      for (const key of list.keys) {
        const d = await SHARE_KV.get(key.name, 'json');
        if (d && d.webhookHash === hash) await SHARE_KV.delete(key.name);
      }
      cursor = list.cursor;
    } while (cursor);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (path.startsWith('/share/revoke/') && request.method === 'DELETE') {
    if (request.headers.get('X-Disbox-Key') !== DISBOX_API_KEY)
      return new Response('Unauthorized', { status: 401, headers: cors });
    await SHARE_KV.delete('share_' + path.replace('/share/revoke/', ''));
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // ─── Chunk proxy: worker fetches from Discord directly ──────────────────
  if (path.match(/^\/share\/[^\/]+\/chunk\/[^\/]+$/) && request.method === 'GET') {
    const parts = path.split('/');
    const token = parts[2];
    const msgId = parts[4];
    const data = await SHARE_KV.get('share_' + token, 'json');
    if (!data) return new Response('Not found', { status: 404, headers: cors });
    if (data.expiresAt && Date.now() > data.expiresAt)
      return new Response('Expired', { status: 410, headers: cors });
    if (data.permission !== 'download' && data.permission !== 'view')
      return new Response('Forbidden', { status: 403, headers: cors });

    const webhookUrl = data.webhookUrl;
    if (!webhookUrl) return new Response('No webhook configured', { status: 500, headers: cors });

    const entry = (data.messageIds || []).find(function(m) {
      return (typeof m === 'string' ? m : m.msgId) === msgId;
    });
    if (!entry) return new Response('Chunk not found', { status: 404, headers: cors });

    let attachmentUrl = typeof entry === 'object' ? entry.attachmentUrl : null;

    const isExpired = function(u) {
      if (!u) return true;
      const m = u.match(/[?&]ex=([0-9a-fA-F]+)/);
      if (!m) return false;
      return (parseInt(m[1], 16) * 1000) < (Date.now() + 300000);
    };

    if (isExpired(attachmentUrl)) {
      try {
        const msgRes = await fetch(webhookUrl.split('?')[0] + '/messages/' + msgId, {
          headers: { 'User-Agent': 'Disbox-Worker/1.0' }
        });
        if (msgRes.ok) {
          const msg = await msgRes.json();
          attachmentUrl = msg.attachments?.[0]?.url || null;
          if (attachmentUrl) {
            const entryIdx = data.messageIds.findIndex(m => (typeof m === 'string' ? m : m.msgId) === msgId);
            if (entryIdx >= 0) {
              if (typeof data.messageIds[entryIdx] === 'string') {
                data.messageIds[entryIdx] = { msgId, attachmentUrl };
              } else {
                data.messageIds[entryIdx].attachmentUrl = attachmentUrl;
              }
              await SHARE_KV.put('share_' + token, JSON.stringify(data),
                                 data.expiresAt ? { expiration: Math.floor(data.expiresAt / 1000) } : undefined);
            }
          }
        }
      } catch (e) {}
    }

    if (!attachmentUrl) return new Response('Attachment URL not available', { status: 404, headers: cors });

    const cdnRes = await fetch(attachmentUrl);
    if (!cdnRes.ok) return new Response('CDN error', { status: 502, headers: cors });
    return new Response(cdnRes.body, { headers: { ...cors, 'Content-Type': 'application/octet-stream' } });
  }

  if (path.match(/^\/share\/[^\/]+\/info$/) && request.method === 'GET') {
    const parts = path.split('/');
    const token = parts[2];
    const data = await SHARE_KV.get('share_' + token, 'json');
    if (!data) return new Response('Not found', { status: 404, headers: cors });
    if (data.expiresAt && Date.now() > data.expiresAt)
      return new Response('Expired', { status: 410, headers: cors });

    const { webhookUrl, ...safeData } = data;
    return new Response(JSON.stringify(safeData), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (path.match(/^\/share\/[^\/]+$/) && request.method === 'GET') {
    const parts = path.split('/');
    const token = parts[2];
    const data = await SHARE_KV.get('share_' + token, 'json');
    if (!data) return new Response(errPage('Tautan tidak ditemukan atau sudah kedaluwarsa.'),
    { status: 404, headers: { ...cors, 'Content-Type': 'text/html' } });
    if (data.expiresAt && Date.now() > data.expiresAt) {
      await SHARE_KV.delete('share_' + token);
      return new Response(errPage('Tautan ini sudah kedaluwarsa.'),
                          { status: 410, headers: { ...cors, 'Content-Type': 'text/html' } });
    }
    return new Response(previewPage(data), { headers: { ...cors, 'Content-Type': 'text/html' } });
  }

  return new Response('Not found', { status: 404, headers: cors });
}

// ─── Icon definitions ────────────────────────────────────────────────────────
const ICONS = {
  file: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
  <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
  </svg>`,

  image: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
  <circle cx="9" cy="9" r="2"/>
  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
  </svg>`,

  video: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11"/>
  <rect width="14" height="12" x="2" y="6" rx="2"/>
  </svg>`,

  doc: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="16" x2="8" y1="13" y2="13"/>
  <line x1="16" x2="8" y1="17" y2="17"/>
  <line x1="10" x2="8" y1="9" y2="9"/>
  </svg>`,

  download: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/>
  <line x1="12" x2="12" y1="15" y2="3"/>
  </svg>`,

  link: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>`,

  pause: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <rect width="4" height="16" x="6" y="4" rx="1"/>
  <rect width="4" height="16" x="14" y="4" rx="1"/>
  </svg>`,

  play: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="6 3 20 12 6 21 6 3"/>
  </svg>`,

  warning: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
  <path d="M12 9v4"/>
  <path d="M12 17h.01"/>
  </svg>`
};

// ─── Preview page ────────────────────────────────────────────────────────────
function previewPage(d) {
  const name     = d.filePath.split('/').pop();
  const ext      = name.split('.').pop().toLowerCase();
  const expiry   = d.expiresAt
  ? 'Berlaku hingga ' + new Date(d.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  : 'Berlaku selamanya';
  const canDownload = d.permission === 'download';

  const isImage = ['jpg','jpeg','png','gif','webp','svg'].includes(ext);
  const isVideo = ['mp4','webm','mov','mkv','avi'].includes(ext);
  const isPdf   = ext === 'pdf';
  const isText  = ['txt','csv','json','md','log','xml'].includes(ext);
  const canPreview = isImage || isVideo || isPdf || isText;

  const mimeMap = {
    jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml',
    mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', mkv:'video/x-matroska', avi:'video/x-msvideo',
    pdf:'application/pdf', txt:'text/plain', csv:'text/csv', json:'application/json',
    md:'text/markdown', log:'text/plain', xml:'application/xml'
  };

  const fileIcon = isImage ? ICONS.image : isVideo ? ICONS.video : (isPdf || isText) ? ICONS.doc : ICONS.file;

  // ── Inline script ──────────────────────────────────────────────────────────
  const script = `
  <script>
  var TOKEN       = ${JSON.stringify(d.token)};
  var FILE_NAME   = ${JSON.stringify(name)};
  var MESSAGE_IDS = ${JSON.stringify(d.messageIds || [])};
  var ENC_KEY_B64 = ${JSON.stringify(d.encryptionKeyB64 || null)};
  var MIME        = ${JSON.stringify(mimeMap[ext] || 'application/octet-stream')};
  var IS_TEXT     = ${isText};
  var MAGIC       = new Uint8Array([68,66,88,95,69,78,67,58]);

  var ICONS = ${JSON.stringify(ICONS)};

  window.isPaused        = false;
  window.isDownloading   = false;
  window.totalPausedTime = 0;
  window.pauseStartTime  = 0;
  window.previewController = null;

  /* ── Pause / Resume ────────────────────────────────────────────────────── */
  function togglePause() {
    window.isPaused = !window.isPaused;
    var btn  = document.getElementById('pauseBtn');
    var span = btn ? btn.querySelector('span') : null;
    if (window.isPaused) {
      if (btn)  { btn.innerHTML  = ICONS.play + '<span>Lanjutkan</span>'; btn.style.backgroundColor = 'var(--accent)'; }
      window.pauseStartTime = Date.now();
    } else {
      if (btn)  { btn.innerHTML  = ICONS.pause + '<span>Jeda</span>'; btn.style.backgroundColor = 'rgba(255,255,255,0.1)'; }
      if (window.pauseStartTime) window.totalPausedTime += (Date.now() - window.pauseStartTime);
    }
  }

  function checkPause() {
    return new Promise(function(resolve) {
      (function check() { if (!window.isPaused) resolve(); else setTimeout(check, 500); })();
    });
  }

  /* ── Crypto helpers ────────────────────────────────────────────────────── */
  function hasHeader(buf) {
    var u = new Uint8Array(buf);
    if (u.length < 8) return false;
    for (var i = 0; i < 8; i++) if (u[i] !== MAGIC[i]) return false;
    return true;
  }

  function b64ToBytes(s) {
    var bin = atob(s);
    var u   = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function decryptChunk(buf, key) {
    if (!hasHeader(buf)) return Promise.resolve(buf);
    var u          = new Uint8Array(buf);
    var iv         = u.slice(8, 20);
    var dataWithTag = u.slice(20);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, dataWithTag)
    .catch(function(e) { console.error('Dekripsi gagal:', e); return buf; });
  }

  /* ── Time formatter ────────────────────────────────────────────────────── */
  function formatTime(ms) {
    if (!ms || ms < 0) return 'Menghitung...';
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' dtk';
    return Math.floor(s / 60) + ' mnt ' + (s % 60) + ' dtk';
  }

  /* ── Fetch all chunks ──────────────────────────────────────────────────── */
  function fetchAll(onProgress, abortSignal) {
    var keyP = ENC_KEY_B64
    ? crypto.subtle.importKey('raw', b64ToBytes(ENC_KEY_B64), { name: 'AES-GCM' }, false, ['decrypt'])
    : Promise.resolve(null);

    return keyP.then(function(key) {
      var chunks = [], i = 0;

      function next() {
        if (abortSignal && abortSignal.aborted) return Promise.reject(new Error('ABORTED'));
        if (i >= MESSAGE_IDS.length) {
          if (onProgress) onProgress(i, MESSAGE_IDS.length);
          var total  = chunks.reduce(function(s, c) { return s + c.byteLength; }, 0);
          var merged = new Uint8Array(total);
          var off    = 0;
          for (var j = 0; j < chunks.length; j++) { merged.set(new Uint8Array(chunks[j]), off); off += chunks[j].byteLength; }
          return Promise.resolve(merged.buffer);
        }
        if (onProgress) onProgress(i, MESSAGE_IDS.length);
        var entry = MESSAGE_IDS[i];
        var msgId = typeof entry === 'string' ? entry : entry.msgId;

        return checkPause().then(function() {
          if (abortSignal && abortSignal.aborted) return Promise.reject(new Error('ABORTED'));
          var opts = abortSignal ? { signal: abortSignal } : {};
          return fetch('/share/' + TOKEN + '/chunk/' + msgId, opts)
          .then(function(r) { if (!r.ok) throw new Error('Gagal mengambil data (' + r.status + ')'); return r.arrayBuffer(); })
          .then(function(buf) { return key ? decryptChunk(buf, key) : buf; })
          .then(function(buf) { chunks.push(buf); i++; return next(); });
        });
      }

      return next();
    });
  }

  /* ── Preview ───────────────────────────────────────────────────────────── */
  function loadPreview() {
    var el     = document.getElementById('mediaEl');
    var status = document.getElementById('previewStatusText');
    var prog   = document.getElementById('previewProgressBar');
    var loader = document.getElementById('previewLoader');
    if (!el || !loader) return;

    loader.style.display = 'flex';
    window.totalPausedTime = 0;
    window.previewController = new AbortController();
    var startTime = Date.now();

    fetchAll(function(i, total) {
      var p   = Math.round((i / total) * 100);
      var est = (i > 0 && i < total)
      ? formatTime(((Date.now() - startTime - window.totalPausedTime) / i) * (total - i))
      : (i === total ? 'Memproses...' : 'Menghitung...');
      status.textContent = 'Memuat pratinjau — Bagian ' + (i === total ? total : i + 1) + '/' + total + ' (' + p + '%) · Sisa: ' + est;
      prog.style.width   = p + '%';
    }, window.previewController.signal)
    .then(function(buf) {
      var blob = new Blob([buf], { type: MIME });
      if (IS_TEXT) {
        blob.text().then(function(txt) { el.textContent = txt; loader.style.display = 'none'; });
      } else {
        el.src = URL.createObjectURL(blob);
        loader.style.display = 'none';
      }
    })
    .catch(function(e) {
      if (e.name === 'AbortError' || e.message === 'ABORTED') return;
      status.textContent   = 'Gagal memuat pratinjau: ' + e.message;
      status.style.color   = '#ff4d4d';
    });
  }

  /* ── Download ──────────────────────────────────────────────────────────── */
  function startDownload() {
    if (window.previewController) window.previewController.abort();
    var loader = document.getElementById('previewLoader');
    if (loader) loader.style.display = 'none';

    window.isDownloading   = true;
    window.totalPausedTime = 0;

    var btn     = document.getElementById('dlBtn');
    var pBtn    = document.getElementById('pauseBtn');
    var status  = document.getElementById('dlStatusText');
    var prog    = document.getElementById('dlProgressBar');
    var wrapper = document.getElementById('dlProgressWrapper');

    if (btn)    { btn.disabled = true; btn.style.opacity = '0.5'; }
    if (pBtn)   { pBtn.style.display = 'flex'; pBtn.innerHTML = ICONS.pause + '<span>Jeda</span>'; }
    wrapper.style.display   = 'block';
    status.style.color      = 'var(--text-muted)';

    var startTime = Date.now();

    fetchAll(function(i, total) {
      var p   = Math.round((i / total) * 100);
      var est = (i > 0 && i < total)
      ? formatTime(((Date.now() - startTime - window.totalPausedTime) / i) * (total - i))
      : (i === total ? 'Memproses...' : 'Menghitung...');
      status.textContent = 'Mengunduh — Bagian ' + (i === total ? total : i + 1) + '/' + total + ' (' + p + '%) · Sisa: ' + est;
      prog.style.width   = p + '%';
    })
    .then(function(buf) {
      window.isDownloading = false;
      var blob = new Blob([buf], { type: MIME });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href   = url; a.download = FILE_NAME; a.click();
      URL.revokeObjectURL(url);
      status.textContent = 'Unduhan selesai!';
      if (btn)  { btn.disabled = false; btn.style.opacity = '1'; }
      if (pBtn)   pBtn.style.display = 'none';
    })
    .catch(function(e) {
      window.isDownloading = false;
      status.textContent   = 'Error: ' + e.message;
      status.style.color   = '#ff4d4d';
      if (btn)  { btn.disabled = false; btn.style.opacity = '1'; }
      if (pBtn)   pBtn.style.display = 'none';
    });
  }

  /* ── Copy direct link ──────────────────────────────────────────────────── */
  function copyDirectLink() {
    var url = new URL(window.location.href);
    url.searchParams.set('dl', '1');
    navigator.clipboard.writeText(url.toString()).then(function() {
      var btn  = document.getElementById('linkBtn');
      var span = btn ? btn.querySelector('span') : null;
      if (!span) return;
      var old  = span.innerText;
      span.innerText = 'Tersalin!';
      setTimeout(function() { span.innerText = old; }, 2000);
    });
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */
  window.addEventListener('load', function() {
    var isDl = new URLSearchParams(window.location.search).get('dl') === '1';
    if (isDl && ${canDownload}) startDownload();
    else if (${canPreview}) loadPreview();
  });

  window.addEventListener('beforeunload', function(e) {
    if (window.isDownloading) {
      e.preventDefault();
      e.returnValue = 'Unduhan sedang berlangsung. Yakin ingin menutup halaman ini?';
    }
  });
  <\/script>`;

  // ── Media element ──────────────────────────────────────────────────────────
  const mediaEl = canPreview
  ? (isImage ? '<img id="mediaEl" alt="' + name + '" />'
  : isVideo ? '<video id="mediaEl" controls></video>'
  : isPdf   ? '<iframe id="mediaEl" title="' + name + '"></iframe>'
  : '<div class="text-view"><pre id="mediaEl"></pre></div>')
  : `<div class="no-preview">
  ${fileIcon}
  <p>Pratinjau tidak tersedia untuk format <strong>.${ext}</strong></p>
  </div>`;

  // ── HTML ───────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
  <html lang="id">
  <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${name} · Disbox</title>
  <style>
  :root {
    --bg:           #09090b;
    --topbar:       #18181b;
    --border:       #27272a;
    --text:         #fafafa;
    --text-muted:   #a1a1aa;
    --accent:       #5865f2;
    --accent-hover: #4752c4;
    --radius:       8px;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Top bar ─────────────────────────────────────────────────────────── */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    background: var(--topbar);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 10;
  }
  .file-info {
    display: flex;
    align-items: center;
    gap: 14px;
    overflow: hidden;
    min-width: 0;
  }
  .file-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    flex-shrink: 0;
  }
  .file-name-col {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .file-name {
    font-size: 16px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .file-meta {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  /* ── Buttons ─────────────────────────────────────────────────────────── */
  .actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 18px;
    border: none;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s, opacity 0.15s;
    background: var(--accent);
    color: #fff;
    white-space: nowrap;
  }
  .btn-secondary { background: rgba(255,255,255,0.1); color: var(--text); }
  .btn:hover:not(:disabled)           { background: var(--accent-hover); }
  .btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
  .btn:active:not(:disabled)          { transform: scale(0.97); }
  .btn:disabled                       { opacity: 0.5; cursor: not-allowed; }

  /* ── Preview area ────────────────────────────────────────────────────── */
  .preview-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    padding: 24px;
    overflow: hidden;
    min-height: 0;
  }
  #mediaEl {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius);
  box-shadow: 0 4px 32px rgba(0,0,0,0.5);
  }
  iframe#mediaEl {
    width: 100%; height: 100%;
    background: #fff; border: none;
  }
  .text-view {
    width: 100%; height: 100%;
    overflow: auto;
    background: var(--topbar);
    border-radius: var(--radius);
    padding: 20px;
    border: 1px solid var(--border);
    box-shadow: 0 4px 32px rgba(0,0,0,0.5);
  }
  pre#mediaEl {
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: ui-monospace, "Cascadia Code", monospace;
    font-size: 13px;
    color: var(--text);
    border: none; outline: none; box-shadow: none;
  }
  .no-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    color: var(--text-muted);
    text-align: center;
  }
  .no-preview svg { opacity: 0.4; }
  .no-preview p   { font-size: 14px; line-height: 1.5; }

  /* ── Loader overlay ──────────────────────────────────────────────────── */
  .loader-overlay {
    position: absolute;
    inset: 0;
    background: var(--bg);
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    z-index: 20;
    padding: 24px;
  }
  .loader-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.3px;
  }
  .status-text { font-size: 13px; color: var(--text-muted); font-weight: 500; }
  .progress-track {
    width: 100%;
    max-width: 480px;
    height: 6px;
    background: rgba(255,255,255,0.1);
    border-radius: 99px;
    overflow: hidden;
  }
  .progress-bar {
    height: 100%;
    width: 0%;
    background: var(--accent);
    border-radius: 99px;
    transition: width 0.15s ease;
  }

  /* ── Bottom bar ──────────────────────────────────────────────────────── */
  .bottom-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    background: var(--topbar);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 10;
  }
  .dl-info-area {
    flex: 1;
    min-width: 0;
    padding-right: 20px;
  }
  .dl-status-text  { font-size: 12px; color: var(--text-muted); margin-bottom: 8px; }
  .view-only-badge {
    font-size: 13px;
    color: var(--text-muted);
    background: rgba(255,255,255,0.06);
    padding: 9px 14px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  /* ── Responsive ──────────────────────────────────────────────────────── */
  @media (max-width: 600px) {
    .file-meta              { display: none; }
    .btn span               { display: none; }
    .btn                    { padding: 9px 10px; }
    .preview-container      { padding: 12px; }
    .bottom-bar             { flex-direction: column; align-items: stretch; gap: 14px; }
    .dl-info-area           { padding-right: 0; }
  }
  </style>
  </head>
  <body>

  <!-- ── Top bar ──────────────────────────────────────────────────────────────── -->
  <div class="top-bar">
  <div class="file-info">
  <div class="file-icon">${fileIcon}</div>
  <div class="file-name-col">
  <div class="file-name" title="${name}">${name}</div>
  <div class="file-meta">${expiry}</div>
  </div>
  </div>
  <div class="actions">
  ${canDownload ? `<button class="btn btn-secondary" id="linkBtn" onclick="copyDirectLink()">${ICONS.link} <span>Salin Tautan</span></button>` : ''}
  </div>
  </div>

  <!-- ── Preview ───────────────────────────────────────────────────────────────── -->
  <div class="preview-container">
  ${mediaEl}
  <div id="previewLoader" class="loader-overlay">
  <div class="loader-title">Memuat Pratinjau</div>
  <div id="previewStatusText" class="status-text">Menyiapkan...</div>
  <div class="progress-track"><div id="previewProgressBar" class="progress-bar"></div></div>
  </div>
  </div>

  <!-- ── Bottom bar ────────────────────────────────────────────────────────────── -->
  ${canDownload ? `
    <div class="bottom-bar">
    <div class="dl-info-area">
    <div id="dlProgressWrapper" style="display:none;">
    <div id="dlStatusText" class="dl-status-text">Menyiapkan...</div>
    <div class="progress-track"><div id="dlProgressBar" class="progress-bar"></div></div>
    </div>
    </div>
    <div class="actions">
    <button id="pauseBtn" class="btn btn-secondary" style="display:none;" onclick="togglePause()">${ICONS.pause} <span>Jeda</span></button>
    <button class="btn" id="dlBtn" onclick="startDownload()">${ICONS.download} <span>Unduh</span></button>
    </div>
    </div>
    ` : `
    <div class="bottom-bar" style="justify-content:flex-end;">
    <div class="view-only-badge">Hanya Lihat</div>
    </div>
    `}

    ${script}
    </body>
    </html>`;
}

// ─── Error page ───────────────────────────────────────────────────────────────
function errPage(msg) {
  return `<!DOCTYPE html>
  <html lang="id">
  <head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Disbox · Error</title>
  <style>
  :root { --bg:#09090b; --text:#fafafa; --text-muted:#a1a1aa; --accent:#5865f2; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg);
    color: var(--text);
    height: 100vh;
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    gap: 20px;
  }
  .icon     { color: var(--text-muted); opacity: 0.7; }
  .msg      { font-size: 17px; color: var(--text); line-height: 1.6; max-width: 480px; font-weight: 500; }
  .branding { font-size: 13px; color: var(--text-muted); }
  .branding span { color: var(--accent); font-weight: 600; }
  </style>
  </head>
  <body>
  <div class="icon">${ICONS.warning}</div>
  <div class="msg">${msg}</div>
  <div class="branding">Dibagikan melalui <span>Disbox</span></div>
  </body>
  </html>`;
}
