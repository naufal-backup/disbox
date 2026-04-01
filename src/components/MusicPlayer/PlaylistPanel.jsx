import { X } from 'lucide-react';
import { formatSize } from './MusicPlayerUtils.js';
import styles from '../MusicPlayer.module.css';

export default function PlaylistPanel({ 
  playlist, file, onFileChange, setShowPlaylist 
}) {
  return (
    <div className={styles.playlistPanel}>
      <div className={styles.playlistHeader}>
        <span>{playlist.length} tracks</span>
        <button onClick={() => setShowPlaylist(false)}><X size={16} /></button>
      </div>
      <div className={styles.playlistScroll}>
        {playlist.map((f, i) => {
          const fname = f.path.split('/').pop();
          const isCurrent = f.id === file.id || f.path === file.path;
          return (
            <button
              key={f.id || f.path}
              className={`${styles.playlistItem} ${isCurrent ? styles.playlistItemActive : ''}`}
              onClick={() => {
                onFileChange?.(f);
                setShowPlaylist(false);
              }}
            >
              <span className={styles.playlistItemName}>{fname}</span>
              <span className={styles.playlistItemMeta}>{formatSize(f.size)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
