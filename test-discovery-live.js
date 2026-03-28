const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve({ error: 'JSON Parse Error', body }); }
      });
    }).on('error', reject);
  });
}

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1249826003111383102/3Pj2jCxnudVvY7i-JW35OnB97CWHWVyysBROPfpzIz_0k9D9i6huIGGHj8swMJETdNl5';

async function run() {
  console.log('--- DISBOX LIVE DISCOVERY TEST ---');
  const info = await fetchJson(WEBHOOK_URL);
  console.log('Webhook Name:', info.name);
  
  const messages = await fetchJson(`${WEBHOOK_URL}/messages?limit=50`);
  if (!Array.isArray(messages)) {
    console.error('Messages fetch failed:', messages);
    return;
  }

  const metaMsg = messages.find(m => 
    m.attachments?.some(a => a.filename.includes('metadata.json'))
  );

  if (metaMsg) {
    console.log('Latest ID Found via Scanning:', metaMsg.id);
    console.log('Attachment File:', metaMsg.attachments[0].filename);
    console.log('Message Date:', metaMsg.timestamp);
    
    const nameMatch = info.name?.match(/(?:dbx|disbox|db)[:\s]+(\d+)/i);
    const nameId = nameMatch?.[1];
    
    if (nameId === metaMsg.id) {
      console.log('>>> SUCCESS: Webhook Name and Latest Metadata Match.');
    } else {
      console.log('>>> INFO: Webhook Name differs from Latest Metadata. Scanning will recover.');
    }
  } else {
    console.log('No metadata found in the last 50 messages.');
  }
}

run();
