const fs = require('fs');
let code = fs.readFileSync('electron/main.js', 'utf8');

// Kita cari kemana arah handler upload-file-from-path terakhir
// Kita potong sebelum sampah penutup duplikasi yang tadi.
// Cara termudah: Rewrite blok handler terakhir secara utuh.

const startOfHandler = code.lastIndexOf("ipcMain.handle('upload-file-from-path'");
if (startOfHandler !== -1) {
    let newCode = code.substring(0, startOfHandler);
    newCode += `ipcMain.handle('upload-file-from-path', async (event, webhookUrl, nativePath, destName, transferId, chunkSize) => {
  const cancelFlag = { cancelled: false };
  uploadCancelFlags.set(transferId, cancelFlag);

  try {
    const stats = fs.statSync(nativePath);
    const totalSize = stats.size;
    const CHUNK = chunkSize || 7.5 * 1024 * 1024;
    const numChunks = Math.ceil(totalSize / CHUNK) || 1;
    const filename = destName || path.basename(nativePath);
    const messageIds = new Array(numChunks);
    const fd = fs.openSync(nativePath, 'r');

    let completedChunks = 0;
    let activeUploads = 0;
    let nextChunkStartIndex = 0;

    return new Promise((resolve, reject) => {
      const cancelChecker = setInterval(() => {
        if (cancelFlag.cancelled) {
          clearInterval(cancelChecker);
          try { fs.closeSync(fd); } catch (_) {}
          uploadCancelFlags.delete(transferId);
          reject(new Error('UPLOAD_CANCELLED'));
        }
      }, 100);

      function finish(result) {
        clearInterval(cancelChecker);
        uploadCancelFlags.delete(transferId);
        result instanceof Error ? reject(result) : resolve(result);
      }

      async function uploadNext() {
        if (cancelFlag.cancelled) return;

        if (completedChunks === numChunks) {
          try { fs.closeSync(fd); } catch (_) {}
          finish({ ok: true, messageIds, size: totalSize });
          return;
        }

        const chunksPerMsg = Math.min(Math.max(1, prefs.chunksPerMessage || 1), 10);
        while (activeUploads < 2 && nextChunkStartIndex < numChunks) {
          const startIndex = nextChunkStartIndex;
          const count = Math.min(chunksPerMsg, numChunks - startIndex);
          nextChunkStartIndex += count;
          activeUploads++;
          uploadGroup(startIndex, count);
        }
      }

      async function uploadGroup(startIndex, count, retryCount = 0) {
        if (cancelFlag.cancelled) {
          activeUploads--;
          return;
        }

        try {
          const boundary = '----DisboxMultiBoundary' + Date.now().toString(36) + startIndex;
          const bodyParts = [];
          const key = getEncryptionKey(webhookUrl);

          for (let i = 0; i < count; i++) {
            const index = startIndex + i;
            const start = index * CHUNK;
            const size = Math.min(CHUNK, totalSize - start);
            const buf = Buffer.allocUnsafe(size);
            fs.readSync(fd, buf, 0, size, start);

            const encryptedBuf = encrypt(buf, key);

            bodyParts.push(Buffer.from('--' + boundary + '\\r\\n'));
            bodyParts.push(Buffer.from(\`Content-Disposition: form-data; name="file\${i}"; filename="\${filename}.part\${index}"\\r\\n\`));
            bodyParts.push(Buffer.from('Content-Type: application/octet-stream\\r\\n\\r\\n'));
            bodyParts.push(encryptedBuf);
            bodyParts.push(Buffer.from('\\r\\n'));
          }
          bodyParts.push(Buffer.from('--' + boundary + '--\\r\\n'));

          const body = Buffer.concat(bodyParts);

          if (cancelFlag.cancelled) {
            activeUploads--;
            return;
          }

          const response = await net.fetch(webhookUrl + '?wait=true', {
            method: 'POST',
            headers: {
              'Content-Type': 'multipart/form-data; boundary=' + boundary,
              'User-Agent': 'Mozilla/5.0 Disbox/2.0',
            },
            body,
          });

          if (cancelFlag.cancelled) {
            activeUploads--;
            return;
          }

          const text = await response.text();

          if (response.status === 429) {
            const retryAfter = (JSON.parse(text).retry_after || 5) + 1;
            console.warn(\`[upload] Rate limited, retrying after \${retryAfter}s...\`);
            setTimeout(() => {
              if (!cancelFlag.cancelled) uploadGroup(startIndex, count, retryCount);
              else activeUploads--;
            }, (retryAfter * 1000));
            return;
          }

          if (!response.ok) {
            throw new Error(\`Status \${response.status}: \${text.slice(0, 100)}\`);
          }

          const data = JSON.parse(text);
          for (let i = 0; i < count; i++) {
            messageIds[startIndex + i] = { msgId: data.id, index: i };
          }

          activeUploads--;
          completedChunks += count;

          if (!cancelFlag.cancelled) {
            event.sender.send('upload-progress-' + transferId, completedChunks / numChunks);
          }

          uploadNext();
        } catch (e) {
          if (cancelFlag.cancelled) {
            activeUploads--;
            return;
          }

          if (retryCount < 10) {
            console.error(\`[upload] Error on group starting at \${startIndex}, retry \${retryCount + 1}/10:\`, e.message);
            const backoff = (retryCount + 1) * 2000;
            setTimeout(() => {
              if (!cancelFlag.cancelled) uploadGroup(startIndex, count, retryCount + 1);
              else activeUploads--;
            }, backoff);
          } else {
            activeUploads--;
            try { fs.closeSync(fd); } catch (_) {}
            finish(new Error(\`Gagal upload group \${startIndex} setelah 10 kali coba: \${e.message}\`));
          }
        }
      }

      uploadNext();
    });
  } catch (e) {
    uploadCancelFlags.delete(transferId);
    console.error('[upload-path] Fatal error:', e.message);
    return { ok: false, error: e.message };
  }
});`;
    fs.writeFileSync('electron/main.js', newCode);
    console.log('Main.js fixed and rewritten.');
}
