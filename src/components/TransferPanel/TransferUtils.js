export function fmtSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return null;
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
}

export function fmtETA(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return null;
  if (seconds < 60) return `${Math.ceil(seconds)}d`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}d`;
  return `${Math.floor(seconds / 3600)}j ${Math.floor((seconds % 3600) / 60)}m`;
}

export function fmtSize(bytes) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
