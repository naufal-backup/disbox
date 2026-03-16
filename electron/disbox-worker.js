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

  // ─── Chunk proxy: worker fetches from Discord directly ───────────────────
  // /share/:token/chunk/:msgId — worker uses stored webhookUrl to fetch from Discord
  // webhookUrl is NEVER sent to the client, it stays server-side in KV
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

    // webhookUrl stored server-side, never exposed to client
    const webhookUrl = data.webhookUrl;
    if (!webhookUrl) return new Response('No webhook configured', { status: 500, headers: cors });

    const entry = (data.messageIds || []).find(function(m) {
      return (typeof m === 'string' ? m : m.msgId) === msgId;
    });
    if (!entry) return new Response('Chunk not found', { status: 404, headers: cors });

    // Try cached attachmentUrl first, refresh if expired
    let attachmentUrl = typeof entry === 'object' ? entry.attachmentUrl : null;

    const isExpired = function(u) {
      if (!u) return true;
      const m = u.match(/[?&]ex=([0-9a-fA-F]+)/);
      if (!m) return false;
      return (parseInt(m[1], 16) * 1000) < (Date.now() + 300000);
    };

    if (isExpired(attachmentUrl)) {
      try {
        // Worker fetches from Discord using stored webhookUrl — client never sees it
        const msgRes = await fetch(webhookUrl.split('?')[0] + '/messages/' + msgId, {
          headers: { 'User-Agent': 'Disbox-Worker/1.0' }
        });
        if (msgRes.ok) {
          const msg = await msgRes.json();
          attachmentUrl = msg.attachments?.[0]?.url || null;
          if (attachmentUrl) {
            // Update cache in KV
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
    // Stream the raw (possibly encrypted) chunk directly to client
    return new Response(cdnRes.body, { headers: { ...cors, 'Content-Type': 'application/octet-stream' } });
  }

  // /share/:token/info — returns file info WITHOUT webhookUrl
  if (path.match(/^\/share\/[^\/]+\/info$/) && request.method === 'GET') {
    const parts = path.split('/');
    const token = parts[2];
    const data = await SHARE_KV.get('share_' + token, 'json');
    if (!data) return new Response('Not found', { status: 404, headers: cors });
    if (data.expiresAt && Date.now() > data.expiresAt)
      return new Response('Expired', { status: 410, headers: cors });

    // Strip webhookUrl — never expose to client
    const { webhookUrl, ...safeData } = data;
    return new Response(JSON.stringify(safeData), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // /share/:token — HTML preview page
  if (path.match(/^\/share\/[^\/]+$/) && request.method === 'GET') {
    const parts = path.split('/');
    const token = parts[2];
    const data = await SHARE_KV.get('share_' + token, 'json');
    if (!data) return new Response(errPage('Link tidak ditemukan atau sudah expired.'),
    { status: 404, headers: { ...cors, 'Content-Type': 'text/html' } });
    if (data.expiresAt && Date.now() > data.expiresAt) {
      await SHARE_KV.delete('share_' + token);
      return new Response(errPage('Link ini sudah expired.'),
                          { status: 410, headers: { ...cors, 'Content-Type': 'text/html' } });
    }
    return new Response(previewPage(data), { headers: { ...cors, 'Content-Type': 'text/html' } });
  }

  return new Response('Not found', { status: 404, headers: cors });
}

function previewPage(d) {
  const name = d.filePath.split('/').pop();
  const ext = name.split('.').pop().toLowerCase();
  const expiry = d.expiresAt
  ? 'Berlaku hingga ' + new Date(d.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
  : 'Berlaku selamanya';
  const canDownload = d.permission === 'download';
  const msgIdsJson = JSON.stringify(d.messageIds || []);
  const tokenJson = JSON.stringify(d.token);
  const nameJson = JSON.stringify(name);
  // encryptionKeyB64 is sent to allow browser-side decryption
  // The actual webhookUrl is NEVER sent — only the derived key
  const keyB64Json = JSON.stringify(d.encryptionKeyB64 || null);

  const isImage = ['jpg','jpeg','png','gif','webp','svg'].includes(ext);
  const isVideo = ['mp4','webm','mov','mkv','avi'].includes(ext);
  const isPdf = ['pdf'].includes(ext);
  const isText = ['txt','csv','json','md','log','xml'].includes(ext);
  const canPreview = isImage || isVideo || isPdf || isText;

  const mimeMap = {
    jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',
    mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mkv:'video/x-matroska',avi:'video/x-msvideo',
    pdf:'application/pdf',txt:'text/plain',csv:'text/csv',json:'application/json',md:'text/markdown',log:'text/plain',xml:'application/xml'
  };
  const mimeJson = JSON.stringify(mimeMap[ext] || 'application/octet-stream');

  const icons = {
    file: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
    image: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
    video: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>',
    doc: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>',
    download: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>'
  };

  const getIcon = () => {
    if (isImage) return icons.image;
    if (isVideo) return icons.video;
    if (isPdf || isText) return icons.doc;
    return icons.file;
  };

  // All chunk fetches go through /share/:token/chunk/:msgId on the worker
  // The worker then fetches from Discord using stored webhookUrl — client never sees it
  const mediaScript = '<script>' +
  'var TOKEN=' + tokenJson + ';' +
  'var FILE_NAME=' + nameJson + ';' +
  'var MESSAGE_IDS=' + msgIdsJson + ';' +
  'var ENC_KEY_B64=' + keyB64Json + ';' +
  'var MIME=' + mimeJson + ';' +
  'var IS_TEXT=' + isText + ';' +
  'var MAGIC=new Uint8Array([68,66,88,95,69,78,67,58]);' +
  'function hasHeader(b){var u=new Uint8Array(b);if(u.length<8)return false;for(var i=0;i<8;i++)if(u[i]!==MAGIC[i])return false;return true;}' +
  'function b64ToBytes(s){var bin=atob(s);var u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;}' +
  'function decryptChunk(buf,key){' +
  '  if(!hasHeader(buf))return Promise.resolve(buf);' +
  '  var u=new Uint8Array(buf);' +
  '  var iv=u.slice(8,20);' +
  '  var dataWithTag=u.slice(20);' +
  '  return crypto.subtle.decrypt({name:"AES-GCM",iv:iv},key,dataWithTag).catch(function(e){' +
  '    console.error("Decryption failed:",e);' +
  '    return buf;' +
  '  });' +
  '}' +
  // Fetch ALL chunks through worker proxy — Discord webhook URL stays server-side
  'function fetchAll(onProgress){' +
  '  var keyP=ENC_KEY_B64?crypto.subtle.importKey("raw",b64ToBytes(ENC_KEY_B64),{name:"AES-GCM"},false,["decrypt"]):Promise.resolve(null);' +
  '  return keyP.then(function(key){' +
  '    var chunks=[];var i=0;' +
  '    function next(){' +
  '      if(i>=MESSAGE_IDS.length){' +
  '        var total=chunks.reduce(function(s,c){return s+c.byteLength;},0);' +
  '        var merged=new Uint8Array(total);var off=0;' +
  '        for(var j=0;j<chunks.length;j++){merged.set(new Uint8Array(chunks[j]),off);off+=chunks[j].byteLength;}' +
  '        return Promise.resolve(merged.buffer);' +
  '      }' +
  '      var entry=MESSAGE_IDS[i];' +
  '      var msgId=typeof entry==="string"?entry:entry.msgId;' +
  '      if(onProgress)onProgress(i,MESSAGE_IDS.length);' +
  // Worker endpoint proxies chunk from Discord — no webhook URL in client
  '      return fetch("/share/"+TOKEN+"/chunk/"+msgId)' +
  '        .then(function(r){if(!r.ok)throw new Error("Gagal mengambil data ("+r.status+")");return r.arrayBuffer();})' +
  '        .then(function(buf){return key?decryptChunk(buf,key):buf;})' +
  '        .then(function(buf){chunks.push(buf);i++;return next();});' +
  '    }' +
  '    return next();' +
  '  });' +
  '}' +
  'function loadPreview(){' +
  '  var el=document.getElementById("mediaEl");' +
  '  var status=document.getElementById("statusText");' +
  '  var prog=document.getElementById("progressBar");' +
  '  var loader=document.getElementById("loader");' +
  '  if(!el) return;' +
  '  loader.style.display="flex";' +
  '  fetchAll(function(i,total){' +
  '    var p=Math.round(((i+1)/total)*100);' +
  '    status.textContent="Memuat preview... "+p+"%";' +
  '    prog.style.width=p+"%";' +
  '  })' +
  '  .then(function(buf){' +
  '    var blob=new Blob([buf],{type:MIME});' +
  '    if(IS_TEXT){' +
  '      blob.text().then(function(txt){' +
  '        el.textContent = txt;' +
  '        loader.style.display="none";' +
  '      });' +
  '    } else {' +
  '      el.src = URL.createObjectURL(blob);' +
  '      loader.style.display="none";' +
  '    }' +
  '  })' +
  '  .catch(function(e){' +
  '    status.textContent="Gagal memuat preview: "+e.message;' +
  '    status.style.color="#ff4d4d";' +
  '    document.getElementById("progressContainer").style.display="none";' +
  '  });' +
  '}' +
  'function startDownload(){' +
  '  var btn=document.getElementById("dlBtn");' +
  '  var status=document.getElementById("statusText");' +
  '  var prog=document.getElementById("progressBar");' +
  '  var loader=document.getElementById("loader");' +
  '  btn.disabled=true; btn.style.opacity="0.5";' +
  '  loader.style.display="flex";' +
  '  fetchAll(function(i,total){' +
  '    var p=Math.round(((i+1)/total)*100);' +
  '    status.textContent="Mengunduh... "+p+"%";' +
  '    prog.style.width=p+"%";' +
  '  })' +
  '  .then(function(buf){' +
  '    var blob=new Blob([buf],{type:MIME});' +
  '    var url=URL.createObjectURL(blob);' +
  '    var a=document.createElement("a");a.href=url;a.download=FILE_NAME;a.click();' +
  '    URL.revokeObjectURL(url);' +
  '    status.textContent="Selesai!"; btn.disabled=false; btn.style.opacity="1";' +
  '    setTimeout(function(){ loader.style.display="none"; }, 1000);' +
  '  }).catch(function(e){' +
  '    status.textContent="Error: "+e.message;' +
  '    status.style.color="#ff4d4d";' +
  '    btn.disabled=false; btn.style.opacity="1";' +
  '  });' +
  '}' +
  'window.addEventListener("load",function(){ if(' + canPreview + ') loadPreview(); });' +
  '<\/script>';

  return '<!DOCTYPE html>' +
  '<html lang="id"><head>' +
  '<meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' + name + ' | Disbox<\/title>' +
  '<style>' +
  '  :root{--bg:#09090b;--topbar:#18181b;--border:#27272a;--text:#fafafa;--text-muted:#a1a1aa;--accent:#5865f2;--accent-hover:#4752c4}' +
  '  *{box-sizing:border-box;margin:0;padding:0}' +
  '  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column;overflow:hidden}' +
  '  .top-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 24px;background:var(--topbar);border-bottom:1px solid var(--border);z-index:10;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)}' +
  '  .file-info{display:flex;align-items:center;gap:12px;overflow:hidden}' +
  '  .file-icon{display:flex;align-items:center;justify-content:center;color:var(--text-muted)}' +
  '  .file-name-container{display:flex;flex-direction:column;overflow:hidden}' +
  '  .file-name{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}' +
  '  .file-meta{font-size:12px;color:var(--text-muted)}' +
  '  .actions{display:flex;align-items:center;gap:16px}' +
  '  .btn{padding:8px 16px;background:var(--accent);color:#fff;border-radius:8px;border:none;font-weight:600;font-size:14px;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.2s}' +
  '  .btn:hover:not(:disabled){background:var(--accent-hover)}' +
  '  .btn:active:not(:disabled){transform:scale(0.98)}' +
  '  .btn:disabled{opacity:0.5;cursor:not-allowed}' +
  '  .view-only{font-size:13px;color:var(--text-muted);background:rgba(255,255,255,0.05);padding:8px 12px;border-radius:8px}' +
  '  .preview-container{flex:1;display:flex;align-items:center;justify-content:center;position:relative;padding:24px;overflow:hidden;min-height:0}' +
  '  #mediaEl{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,0.4)}' +
  '  iframe#mediaEl{width:100%;height:100%;background:#fff;border:none}' +
  '  .text-view{width:100%;height:100%;overflow:auto;background:var(--topbar);border-radius:8px;padding:20px;border:1px solid var(--border);box-shadow:0 4px 24px rgba(0,0,0,0.4);}' +
  '  pre#mediaEl{white-space:pre-wrap;word-wrap:break-word;font-family:monospace;font-size:14px;color:var(--text);outline:none;border:none;box-shadow:none}' +
  '  .no-preview{text-align:center;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:16px}' +
  '  .no-preview svg{width:64px;height:64px;opacity:0.5}' +
  '  .loader-overlay{position:absolute;inset:0;background:rgba(9,9,11,0.8);display:none;flex-direction:column;align-items:center;justify-content:center;z-index:20;backdrop-filter:blur(4px)}' +
  '  .progress-container{width:100%;max-width:250px;height:6px;background:rgba(255,255,255,0.1);border-radius:10px;overflow:hidden;margin-top:16px}' +
  '  .progress-bar{height:100%;background:var(--accent);width:0%;transition:width 0.1s}' +
  '  #statusText{font-size:14px;font-weight:500;color:var(--text)}' +
  '  @media (max-width:600px){.file-meta{display:none} .btn span{display:none} .btn{padding:8px} .preview-container{padding:12px}}' +
  '<\/style><\/head><body>' +
  '<div class="top-bar">' +
  '  <div class="file-info">' +
  '    <div class="file-icon">' + getIcon() + '</div>' +
  '    <div class="file-name-container">' +
  '      <div class="file-name" title="' + name + '">' + name + '</div>' +
  '      <div class="file-meta">' + expiry + '</div>' +
  '    </div>' +
  '  </div>' +
  '  <div class="actions">' +
  (canDownload
  ? '<button class="btn" id="dlBtn" onclick="startDownload()">' + icons.download + ' <span>Unduh</span></button>'
  : '<div class="view-only">Hanya Lihat</div>') +
  '  </div>' +
  '</div>' +
  '<div class="preview-container">' +
  (canPreview
  ? (isImage ? '<img id="mediaEl" />' : isVideo ? '<video id="mediaEl" controls></video>' : isPdf ? '<iframe id="mediaEl"></iframe>' : '<div class="text-view"><pre id="mediaEl"></pre></div>')
  : '<div class="no-preview">' + getIcon() + '<div>Preview tidak tersedia untuk ekstensi file ini</div></div>') +
  '  <div id="loader" class="loader-overlay">' +
  '    <div id="statusText">Menyiapkan...</div>' +
  '    <div class="progress-container" id="progressContainer"><div id="progressBar" class="progress-bar"></div></div>' +
  '  </div>' +
  '</div>' +
  mediaScript +
  '<\/body><\/html>';
}

function errPage(msg) {
  return '<!DOCTYPE html>' +
  '<html lang="id"><head>' +
  '<meta charset="UTF-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Disbox | Error<\/title>' +
  '<style>' +
  '  :root{--bg:#09090b;--text:#fafafa;--text-muted:#a1a1aa;--accent:#5865f2}' +
  '  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);height:100vh;margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px}' +
  '  .icon{font-size:64px;margin-bottom:24px;opacity:0.8}' +
  '  .msg{font-size:18px;color:var(--text);line-height:1.6;max-width:500px;font-weight:500}' +
  '  .branding{margin-top:32px;font-size:14px;color:var(--text-muted)}' +
  '  .branding span{color:var(--accent);font-weight:600}' +
  '<\/style><\/head>' +
  '<body>' +
  '  <div class="icon">\u26A0\uFE0F<\/div>' +
  '  <div class="msg">' + msg + '<\/div>' +
  '  <div class="branding">Dibagikan melalui <span>Disbox<\/span><\/div>' +
  '<\/body><\/html>';
}
