export function buildTree(files) {
  const root = { name: '/', children: {}, files: [] };
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    const fileName = parts.pop();
    let node = root;
    for (const part of parts) {
      if (!node.children[part]) {
        node.children[part] = { name: part, children: {}, files: [] };
      }
      node = node.children[part];
    }
    node.files.push({ ...file, name: fileName });
  }
  return root;
}

export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function getFileIcon(name) {
  const ext = name?.split('.').pop()?.toLowerCase();
  const map = {
    pdf: '📄', mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
    mp3: '🎵', wav: '🎵', flac: '🎵', ogg: '🎵',
    jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', webp: '🖼', svg: '🖼',
    zip: '📦', rar: '📦', tar: '📦', gz: '📦', '7z': '📦',
    js: '⚙️', ts: '⚙️', jsx: '⚙️', tsx: '⚙️', py: '⚙️', rs: '⚙️',
    html: '🌐', css: '🎨', json: '📋',
    doc: '📝', docx: '📝', txt: '📝', md: '📝',
    xls: '📊', xlsx: '📊', csv: '📊',
  };
  return map[ext] || '📄';
}

export function getMimeType(name) {
  const ext = name?.split('.').pop()?.toLowerCase();
  const map = {
    pdf: 'application/pdf',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo',
    mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
    txt: 'text/plain', html: 'text/html', css: 'text/css',
    json: 'application/json', js: 'text/javascript', ts: 'text/typescript',
    py: 'text/x-python', rs: 'text/rust', md: 'text/markdown',
    yml: 'text/yaml', yaml: 'text/yaml', xml: 'text/xml',
    zip: 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}
