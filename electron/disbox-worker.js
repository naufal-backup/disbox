// Format Service Worker (Tanpa export default)
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

  // Note: SHARE_KV dan DISBOX_API_KEY tersedia secara global

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
    const list = await SHARE_KV.list({ prefix: 'share_' });
    for (const key of list.keys) {
      const d = await SHARE_KV.get(key.name, 'json');
      if (d && d.webhookHash === hash) await SHARE_KV.delete(key.name);
    }
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  if (path.startsWith('/share/revoke/') && request.method === 'DELETE') {
    if (request.headers.get('X-Disbox-Key') !== DISBOX_API_KEY)
      return new Response('Unauthorized', { status: 401, headers: cors });
    await SHARE_KV.delete('share_' + path.replace('/share/revoke/', ''));
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

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
    const entry = (data.messageIds || []).find(function(m) {
      return (typeof m === 'string' ? m : m.msgId) === msgId;
    });
    if (!entry) return new Response('Chunk not found', { status: 404, headers: cors });
    const attachmentUrl = typeof entry === 'object' ? entry.attachmentUrl : null;
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
    return new Response(JSON.stringify(data), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

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
    ? 'Hingga ' + new Date(d.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'Selamanya';
  const canDownload = d.permission === 'download';
  const msgIdsJson = JSON.stringify(d.messageIds || []);
  const tokenJson = JSON.stringify(d.token);
  const nameJson = JSON.stringify(name);
  const keyB64Json = JSON.stringify(d.encryptionKeyB64 || null);

  const isImage = ['jpg','jpeg','png','gif','webp'].includes(ext);
  const isVideo = ['mp4','webm','mov','mkv','avi'].includes(ext);
  const canPreview = isImage || isVideo;

  const mimeMap = {
    jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',
    mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mkv:'video/x-matroska',avi:'video/x-msvideo'
  };
  const mimeJson = JSON.stringify(mimeMap[ext] || 'application/octet-stream');

  const icons = {
    file: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>',
    image: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>',
    video: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11"/><rect width="14" height="12" x="2" y="6" rx="2"/></svg>',
    download: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>'
  };

  const getIcon = () => {
    if (isImage) return icons.image;
    if (isVideo) return icons.video;
    return icons.file;
  };

  const mediaScript = '<script>' +
    'var TOKEN=' + tokenJson + ';' +
    'var FILE_NAME=' + nameJson + ';' +
    'var MESSAGE_IDS=' + msgIdsJson + ';' +
    'var ENC_KEY_B64=' + keyB64Json + ';' +
    'var MIME=' + mimeJson + ';' +
    'var MAGIC=new Uint8Array([68,66,88,95,69,78,67,58]);' +
    'function hasHeader(b){var u=new Uint8Array(b);if(u.length<8)return false;for(var i=0;i<8;i++)if(u[i]!==MAGIC[i])return false;return true;}' +
    'function b64ToBytes(s){var bin=atob(s);var u=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u;}' +
    'function decryptChunk(buf,key){if(!hasHeader(buf))return Promise.resolve(buf);var u=new Uint8Array(buf);var iv=u.slice(8,20);var ct=u.slice(20);return crypto.subtle.decrypt({name:"AES-GCM",iv:iv},key,ct).catch(function(){return buf;});}' +
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
    '      return fetch("/share/"+TOKEN+"/chunk/"+msgId)' +
    '        .then(function(r){if(!r.ok)throw new Error("Gagal mengambil data");return r.arrayBuffer();})' +
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
    '    el.src=URL.createObjectURL(blob);' +
    '    loader.style.display="none";' +
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
    '  :root{--bg:#09090b;--card:#18181b;--border:#27272a;--text:#fafafa;--text-muted:#a1a1aa;--accent:#5865f2;--accent-hover:#4752c4}' +
    '  *{box-sizing:border-box;margin:0;padding:0}' +
    '  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;line-height:1.5}' +
    '  .card{background:var(--card);border:1px solid var(--border);border-radius:20px;width:100%;max-width:480px;overflow:hidden;box-shadow:0 20px 25px -5px rgba(0,0,0,0.3)}' +
    '  .preview-container{width:100%;background:#000;display:flex;align-items:center;justify-content:center;position:relative;min-height:200px;border-bottom:1px solid var(--border)}' +
    '  #mediaEl{max-width:100%;max-height:60vh;display:block}' +
    '  .no-preview{padding:60px 20px;text-align:center;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:12px}' +
    '  .no-preview svg{width:48px;height:48px;opacity:0.5}' +
    '  .content{padding:32px}' +
    '  .file-info{margin-bottom:24px;text-align:center}' +
    '  .file-name{font-size:18px;font-weight:700;margin-bottom:6px;word-break:break-all;color:var(--text)}' +
    '  .file-meta{font-size:13px;color:var(--text-muted);display:flex;align-items:center;justify-content:center;gap:6px}' +
    '  .btn{width:100%;padding:14px;background:var(--accent);color:#fff;border-radius:12px;border:none;font-weight:600;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:all 0.2s}' +
    '  .btn:hover:not(:disabled){background:var(--accent-hover);transform:translateY(-1px)}' +
    '  .btn:active:not(:disabled){transform:translateY(0)}' +
    '  .btn:disabled{opacity:0.5;cursor:not-allowed}' +
    '  .loader-overlay{position:absolute;inset:0;background:rgba(0,0,0,0.7);display:none;flex-direction:column;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px)}' +
    '  .progress-container{width:100%;max-width:200px;height:6px;background:rgba(255,255,255,0.1);border-radius:10px;overflow:hidden;margin-top:12px}' +
    '  .progress-bar{height:100%;background:var(--accent);width:0%;transition:width 0.1s}' +
    '  #statusText{font-size:12px;font-weight:500}' +
    '  .view-only-badge{font-size:12px;color:var(--text-muted);background:rgba(255,255,255,0.05);padding:8px 12px;border-radius:8px;text-align:center}' +
    '  .footer{margin-top:24px;font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:6px}' +
    '  .footer span{color:var(--accent);font-weight:600}' +
    '<\/style><\/head><body>' +
    '<div class="card">' +
    '  <div class="preview-container">' +
    (canPreview
      ? (isImage ? '<img id="mediaEl" />' : '<video id="mediaEl" controls></video>') +
        '<div id="loader" class="loader-overlay">' +
        '  <div id="statusText">Menyiapkan...</div>' +
        '  <div class="progress-container" id="progressContainer"><div id="progressBar" class="progress-bar"></div></div>' +
        '</div>'
      : '<div class="no-preview">' + getIcon() + '<span>Preview tidak tersedia untuk tipe file ini</span></div>') +
    '  </div>' +
    '  <div class="content">' +
    '    <div class="file-info">' +
    '      <div class="file-name">' + name + '</div>' +
    '      <div class="file-meta">' + getIcon() + ' • ' + expiry + '</div>' +
    '    </div>' +
    (canDownload
      ? '<button class="btn" id="dlBtn" onclick="startDownload()">' + icons.download + ' Unduh File</button>'
      : '<div class="view-only-badge">Hanya Lihat — Unduhan tidak tersedia</div>') +
    (!canPreview && canDownload ? '<div id="loader" style="display:none;flex-direction:column;align-items:center;margin-top:16px">' +
      '<div id="statusText" style="font-size:12px">Menyiapkan...</div>' +
      '<div class="progress-container"><div id="progressBar" class="progress-bar"></div></div></div>' : '') +
    '  </div>' +
    '</div>' +
    '<div class="footer">Dibagikan melalui <span>Disbox</span></div>' +
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
  '  :root{--bg:#09090b;--card:#18181b;--border:#27272a;--text:#fafafa;--text-muted:#a1a1aa;--accent:#5865f2}' +
  '  body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;text-align:center}' +
  '  .card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:40px 32px;max-width:400px;width:100%;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1)}' +
  '  .icon{font-size:48px;margin-bottom:20px;display:block}' +
  '  .msg{font-size:15px;color:var(--text-muted);line-height:1.6;margin-bottom:8px}' +
  '  .branding{margin-top:24px;font-size:12px;color:var(--text-muted)}' +
  '  .branding span{color:var(--accent);font-weight:600}' +
  '<\/style><\/head>' +
  '<body>' +
  '<div class="card">' +
  '  <span class="icon">\u26A0\uFE0F<\/span>' +
  '  <div class="msg">' + msg + '<\/div>' +
  '<\/div>' +
  '<div class="branding">Dibagikan melalui <span>Disbox<\/span><\/div>' +
  '<\/body><\/html>';
}
