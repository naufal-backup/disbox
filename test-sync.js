const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Konfigurasi dari input Anda
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1249826003111383102/3Pj2jCxnudVvY7i-JW35OnB97CWHWVyysBROPfpzIz_0k9D9i6huIGGHj8swMJETdNl5';
const METADATA_FILE_PATH = path.join('../../../Downloads/disbox_metadata.json');

const MAGIC_HEADER = Buffer.from('DBX_ENC:');

function normalizeUrl(url) {
  if (!url) return '';
  return url.split('?')[0].trim().replace(/\/+$/, '');
}

function getEncryptionKey(url) {
  const baseUrl = normalizeUrl(url);
  return crypto.createHash('sha256').update(baseUrl).digest();
}

function decrypt(data, key) {
  if (data.length < MAGIC_HEADER.length + 12 + 16) {
    console.log('[test] File terlalu kecil untuk dienkripsi.');
    return data;
  }
  if (!data.slice(0, MAGIC_HEADER.length).equals(MAGIC_HEADER)) {
    console.log('[test] Magic header tidak ditemukan, data mungkin tidak dienkripsi.');
    return data;
  }

  try {
    const iv = data.slice(MAGIC_HEADER.length, MAGIC_HEADER.length + 12);
    const tag = data.slice(data.length - 16);
    const ciphertext = data.slice(MAGIC_HEADER.length + 12, data.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (e) {
    console.error('[test] Dekripsi GAGAL:', e.message);
    return null;
  }
}

async function runTest() {
  console.log('--- DISBOX SYNC TEST ---');
  console.log('File:', METADATA_FILE_PATH);
  
  if (!fs.existsSync(METADATA_FILE_PATH)) {
    console.error('File tidak ditemukan di path tersebut!');
    return;
  }

  const encryptedData = fs.readFileSync(METADATA_FILE_PATH);
  const key = getEncryptionKey(WEBHOOK_URL);
  
  console.log('Key derived from Webhook:', key.toString('hex').slice(0, 16) + '...');
  console.log('Encrypted size:', encryptedData.length, 'bytes');

  const decrypted = decrypt(encryptedData, key);
  
  if (!decrypted) {
    console.error('Gagal mendekripsi file. Pastikan Webhook URL benar.');
    return;
  }

  console.log('Decrypted size:', decrypted.length, 'bytes');

  // Cek format
  const isSqlite = decrypted.slice(0, 16).toString().startsWith('SQLite format 3');
  
  if (isSqlite) {
    console.log('Format Terdeteksi: NATIVE SQLITE (New Format)');
    // Simpan sementara untuk testing sqlite
    const tempDb = 'test_sync_db.sqlite';
    fs.writeFileSync(tempDb, decrypted);
    
    try {
      const Database = require('better-sqlite3');
      const db = new Database(tempDb);
      const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get().count;
      const folders = db.prepare('SELECT DISTINCT parent_path FROM files').all();
      
      console.log('--- HASIL SCAN SQLITE ---');
      console.log('Jumlah File:', fileCount);
      console.log('Struktur Folder:', folders.map(f => f.parent_path));
      
      db.close();
      fs.unlinkSync(tempDb);
    } catch (e) {
      console.error('Gagal membaca database SQLite:', e.message);
    }
  } else {
    console.log('Format Terdeteksi: LEGACY JSON (Old Format)');
    try {
      const jsonStr = decrypted.toString('utf8');
      const data = JSON.parse(jsonStr);
      const files = Array.isArray(data) ? data : (data.files || []);
      
      console.log('--- HASIL SCAN JSON ---');
      console.log('Jumlah File:', files.length);
      console.log('File pertama:', files[0]?.path || 'None');
      
      const folders = new Set();
      files.forEach(f => {
        const parts = f.path.split('/');
        parts.pop();
        folders.add(parts.join('/') || '/');
      });
      console.log('Struktur Folder:', Array.from(folders));
      
    } catch (e) {
      console.error('Gagal parsing JSON:', e.message);
      console.log('Raw data preview (100 chars):', decrypted.toString('utf8').slice(0, 100));
    }
  }
}

runTest();
