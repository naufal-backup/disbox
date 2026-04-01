import { Volume2, VolumeX, ListMusic } from 'lucide-react';
import styles from '../MusicPlayer.module.css';

export default function VolumeControl({ 
  showPlaylist, setShowPlaylist, playlist, toggleMute, isMuted, volume, handleVolumeChange 
}) {
  return (
    <div className={styles.extraControls}>
      <button
        className={styles.controlBtn}
        onClick={() => setShowPlaylist(!showPlaylist)}
        title="Playlist"
      >
        <ListMusic size={16} />
      </button>

      <div className={styles.volumeControl}>
        <button className={styles.controlBtn} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
          {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className={styles.volumeSlider}
        />
      </div>
    </div>
  );
}
