import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Shuffle, Repeat, Repeat1, ListMusic, Maximize2, X
} from 'lucide-react';
import styles from './MusicPlayer.module.css';

export default function MusicPlayer({ audioUrl, file, allFiles = [], onFileChange, onClose }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState(0); // 0: off, 1: repeat all, 2: repeat one
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Filter audio files from allFiles
  const audioFiles = useCallback(() => {
    const audioExts = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'];
    return allFiles.filter(f => {
      const name = f.path.split('/').pop();
      const ext = name.split('.').pop()?.toLowerCase();
      return audioExts.includes(ext);
    });
  }, [allFiles]);

  const playlist = audioFiles();
  const currentIndex = playlist.findIndex(f => f.id === file.id || f.path === file.path);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      setIsLoading(false);
    };
    const handleEnded = () => {
      if (repeatMode === 2) {
        audio.currentTime = 0;
        audio.play();
      } else if (repeatMode === 1) {
        if (currentIndex < playlist.length - 1) {
          onFileChange?.(playlist[currentIndex + 1]);
        } else {
          audio.currentTime = 0;
          audio.play();
        }
      } else {
        if (currentIndex < playlist.length - 1) {
          onFileChange?.(playlist[currentIndex + 1]);
        } else {
          setIsPlaying(false);
        }
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, [repeatMode, currentIndex, playlist, onFileChange]);

  // Update audio src when file changes
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && audioUrl) {
      audio.src = audioUrl;
      audio.load();
      setIsLoading(true);
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [audioUrl, file.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const audio = audioRef.current;
      if (!audio) return;

      let handled = true;

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
          e.preventDefault();
          audio.currentTime = Math.max(0, audio.currentTime - 5);
          break;
        case 'arrowright':
          e.preventDefault();
          audio.currentTime = Math.min(duration, audio.currentTime + 5);
          break;
        case 'arrowup':
          e.preventDefault();
          setVolume(v => {
            const newVol = Math.min(1, v + 0.1);
            audio.volume = newVol;
            return newVol;
          });
          setIsMuted(false);
          break;
        case 'arrowdown':
          e.preventDefault();
          setVolume(v => {
            const newVol = Math.max(0, v - 0.1);
            audio.volume = newVol;
            return newVol;
          });
          setIsMuted(false);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 's':
          e.preventDefault();
          toggleShuffle();
          break;
        case 'r':
          e.preventDefault();
          toggleRepeat();
          break;
        case 'p':
          e.preventDefault();
          setShowPlaylist(p => !p);
          break;
        case 'escape':
          // Also handle Escape to close
          e.preventDefault();
          onClose?.();
          break;
        default:
          handled = false;
      }

      // Stop propagation to prevent FilePreview's navigation when we handle the key
      if (handled) {
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration, onClose]);

  // Control handlers
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * duration;
  };

  const handleVolumeChange = (e) => {
    const audio = audioRef.current;
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audio) audio.volume = newVolume;
    setIsMuted(newVolume === 0);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume || 1;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      onFileChange?.(playlist[currentIndex - 1]);
    }
  };

  const goToNext = () => {
    if (currentIndex < playlist.length - 1) {
      onFileChange?.(playlist[currentIndex + 1]);
    }
  };

  const toggleShuffle = () => setIsShuffle(!isShuffle);

  const toggleRepeat = () => {
    setRepeatMode((prev) => (prev + 1) % 3);
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const name = file?.path?.split('/')?.pop() || 'Unknown';
  const fileName = name.replace(/\.[^/.]+$/, '');

  return (
    <div className={styles.container}>
      <audio ref={audioRef} preload="metadata" />

      <div className={styles.player}>
        {/* Track Info */}
        <div className={styles.trackInfo}>
          <div className={styles.trackName}>{fileName}</div>
          <div className={styles.trackMeta}>
            {formatSize(file?.size)} · {getMimeType(name)}
          </div>
        </div>

        {/* Main Controls */}
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

        {/* Progress Bar */}
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

        {/* Volume & Extra Controls */}
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
      </div>

      {/* Playlist Panel */}
      {showPlaylist && (
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
      )}
    </div>
  );
}

// Helper functions
function formatSize(bytes) {
  if (bytes == null) return 'Unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function getMimeType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap = {
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac'
  };
  return mimeMap[ext] || 'audio/*';
}
