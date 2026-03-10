import { useState } from 'react';
import { FolderPlus, Move, Copy, X, ChevronRight, Home, Check } from 'lucide-react';
import { useApp } from '../AppContext.jsx';
import styles from './FolderModal.module.css';

// ─── Create Folder Modal ──────────────────────────────────────────────────────
export function CreateFolderModal({ onClose }) {
  const { createFolder } = useApp();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) { setError('Nama folder tidak boleh kosong'); return; }
    if (/[/\\:*?"<>|]/.test(name)) { setError('Nama folder mengandung karakter tidak valid'); return; }
    setLoading(true);
    const ok = await createFolder(name.trim());
    setLoading(false);
    if (ok) onClose();
    else setError('Gagal membuat folder');
  };

  return (
    <Backdrop onClose={onClose}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerIcon}><FolderPlus size={16} /></div>
          <span>Folder Baru</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={14} /></button>
        </div>

        <div className={styles.body}>
          <label className={styles.label}>Nama Folder</label>
          <input
            className={`${styles.input} ${error ? styles.inputError : ''}`}
            placeholder="Contoh: Dokumen"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Batal</button>
          <button className={styles.confirmBtn} onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? 'Membuat…' : 'Buat Folder'}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ─── Move / Copy Modal ────────────────────────────────────────────────────────
export function MoveModal({ file, mode, onClose }) {
  const { getAllDirs, movePath, copyPath } = useApp();
  const [selectedDir, setSelectedDir] = useState(null);
  const [loading, setLoading] = useState(false);

  // file can be a string path (for folders) or a file object (for files)
  const itemPath = typeof file === 'string' ? file : file.path;
  const itemName = itemPath.split('/').pop();

  const dirs = getAllDirs().filter(d => {
    // Jangan tampilkan direktori saat ini atau subdirektori dari item itu sendiri
    const itemDirPath = '/' + itemPath.split('/').slice(0, -1).join('/');
    return d !== itemDirPath && !d.startsWith(itemPath + '/');
  });

  const handleConfirm = async () => {
    if (selectedDir === null) return;
    setLoading(true);
    const destDir = selectedDir === '/' ? '' : selectedDir.slice(1);
    const ok = mode === 'move'
      ? await movePath(itemPath, destDir)
      : await copyPath(itemPath, destDir);
    setLoading(false);
    if (ok) onClose();
  };

  return (
    <Backdrop onClose={onClose}>
      <div className={styles.modal} style={{ width: 440 }}>
        <div className={styles.header}>
          <div className={styles.headerIcon} style={{ background: mode === 'move' ? 'rgba(240,165,0,0.15)' : 'rgba(0,212,170,0.12)', color: mode === 'move' ? 'var(--amber)' : 'var(--teal)' }}>
            {mode === 'move' ? <Move size={16} /> : <Copy size={16} />}
          </div>
          <span>{mode === 'move' ? 'Pindah' : 'Salin'} Item</span>
          <button className={styles.closeBtn} onClick={onClose}><X size={14} /></button>
        </div>

        <div className={styles.body}>
          <p className={styles.fileLabel}>
            <span style={{ color: 'var(--text-muted)' }}>Nama: </span>
            <strong>{itemName}</strong>
          </p>
          <label className={styles.label}>Pilih Tujuan</label>
          <div className={styles.dirList}>
            {dirs.map(dir => (
              <button
                key={dir}
                className={`${styles.dirItem} ${selectedDir === dir ? styles.dirSelected : ''}`}
                onClick={() => setSelectedDir(dir)}
              >
                <DirIcon />
                <span className={styles.dirPath}>{dir}</span>
                {selectedDir === dir && <Check size={13} style={{ color: 'var(--accent-bright)', marginLeft: 'auto' }} />}
              </button>
            ))}
            {dirs.length === 0 && (
              <p className={styles.emptyDirs}>Tidak ada folder lain. Buat folder dulu.</p>
            )}
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose}>Batal</button>
          <button
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={loading || selectedDir === null}
            style={mode === 'copy' ? { background: 'var(--teal)' } : {}}
          >
            {loading ? 'Memproses…' : mode === 'move' ? 'Pindahkan' : 'Salin ke sini'}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────
function Backdrop({ children, onClose }) {
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function DirIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}
