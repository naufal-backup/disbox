import { Play, Pause, SkipBack, SkipForward, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import styles from '../MusicPlayer.module.css';

export default function MusicControls({ 
  isShuffle, toggleShuffle, goToPrevious, togglePlay, 
  isLoading, isPlaying, goToNext, repeatMode, toggleRepeat 
}) {
  return (
    <div className={styles.controls}>
      <button
        className={`${styles.controlBtn} ${isShuffle ? styles.active : ''}`}
        onClick={toggleShuffle}
        title="Shuffle"
      >
        <Shuffle size={16} />
      </button>

      <button className={styles.controlBtn} onClick={goToPrevious} title="Previous">
        <SkipBack size={20} />
      </button>

      <button className={styles.playBtn} onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
        {isLoading ? (
          <div className="spin" style={{ width: 24, height: 24 }} />
        ) : isPlaying ? (
          <Pause size={24} />
        ) : (
          <Play size={24} />
        )}
      </button>

      <button className={styles.controlBtn} onClick={goToNext} title="Next">
        <SkipForward size={20} />
      </button>

      <button
        className={`${styles.controlBtn} ${repeatMode > 0 ? styles.active : ''}`}
        onClick={toggleRepeat}
        title={repeatMode === 2 ? 'Repeat One' : repeatMode === 1 ? 'Repeat All' : 'Repeat Off'}
      >
        {repeatMode === 2 ? <Repeat1 size={16} /> : <Repeat size={16} />}
      </button>
    </div>
  );
}
