import styles from '../MusicPlayer.module.css';
import { formatTime } from './MusicPlayerUtils.js';

export default function ProgressBar({ currentTime, duration, handleSeek }) {
  return (
    <div className={styles.progressSection}>
      <span className={styles.timeLabel}>{formatTime(currentTime)}</span>
      <div className={styles.progressBar} onClick={handleSeek}>
        <div
          className={styles.progressFill}
          style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
        />
        <div
          className={styles.progressThumb}
          style={{ left: `${duration ? (currentTime / duration) * 100 : 0}%` }}
        />
      </div>
      <span className={styles.timeLabel}>{formatTime(duration)}</span>
    </div>
  );
}
