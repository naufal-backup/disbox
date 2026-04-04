import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, 
  X, Repeat, Shuffle, ListMusic
} from 'lucide-react';
import { useApp } from '../context/useAppHook.js';
import { formatSize, getMimeType } from '../utils/disbox.js';
import FileThumbnail from './FileThumbnail.jsx';
import styles from './MusicBar.module.css';

export default function MusicBar({ track, playlist, onNext, onPrev, onClose }) {
  const { api, addTransfer, removeTransfer } = useApp();
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState({ title: '', artist: '' });
  const audioRef = useRef(null);
  const currentAudioUrlRef = useRef(null);

  useEffect(() => {
    if (!track) {
      setIsPlaying(false);
      setAudioUrl(null);
      setMetadata({ title: '', artist: '' });
      return;
    }

    let isMounted = true;
    const transferId = `music-${track.id}`;

    const loadTrack = async () => {
      // Revoke previous blob URL if exists to avoid leaks
      if (currentAudioUrlRef.current && currentAudioUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }

      setLoading(true);
      setMetadata({ title: track.path.split('/').pop(), artist: 'Disbox Audio' });

      try {
        const mime = getMimeType(track.path);
        const signal = addTransfer({
          id: transferId,
          name: `Load: ${track.path.split('/').pop()}`,
          progress: 0,
          type: 'download',
          status: 'active',
          hidden: true
        });

        const buffer = await api.downloadFile(track, undefined, signal);

        const blob = new Blob([buffer], { type: mime });
        const url = URL.createObjectURL(blob);
        currentAudioUrlRef.current = url;

        if (isMounted) {
          setAudioUrl(url);
          setIsPlaying(true);
          // Extract ID3 tags from buffer if available
          if (window.jsmediatags) {
            window.jsmediatags.read(new Blob([buffer]), {
              onSuccess: (tag) => {
                if (isMounted) {
                  setMetadata({
                    title: tag.tags.title || track.path.split('/').pop(),
                    artist: tag.tags.artist || 'Unknown Artist'
                  });
                }
              }
            });
          }
        }
      } catch (e) {
        console.error('Failed to load music:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadTrack();

    return () => {
      isMounted = false;
      if (currentAudioUrlRef.current && currentAudioUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioUrlRef.current);
        currentAudioUrlRef.current = null;
      }
      removeTransfer(transferId);
    };
  }, [track?.id, api, addTransfer, removeTransfer]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const handleVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
    setIsMuted(v === 0);
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (audioRef.current) audioRef.current.volume = volume || 1;
    } else {
      setIsMuted(true);
      if (audioRef.current) audioRef.current.volume = 0;
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleEnded = () => {
    if (isLooping) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else {
      onNext(isShuffle);
    }
  };

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const volPct = isMuted ? 0 : volume * 100;

  return (
    <div 
      className={styles.musicBar}
      style={{ 
        transform: track ? 'translateY(0)' : 'translateY(100%)',
        opacity: track ? 1 : 0,
        pointerEvents: track ? 'auto' : 'none'
      }}
    >
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          autoPlay
        />
      )}

      <div className={styles.container}>
        {/* Track Info */}
        <div className={styles.trackInfo}>
          <div className={styles.artwork}>
            {track && <FileThumbnail file={track} size={56} />}
          </div>
          <div className={styles.details}>
            <div className={styles.title}>{metadata.title || 'No Track Selected'}</div>
            <div className={styles.artist}>{metadata.artist || '—'}</div>
          </div>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <div className={styles.buttons}>
            <button
              className={`${styles.subBtn} ${isShuffle ? styles.active : ''}`}
              onClick={() => setIsShuffle(!isShuffle)}
              title="Shuffle"
            >
              <Shuffle size={16} />
            </button>
            <button onClick={onPrev} className={styles.mainBtn}>
              <SkipBack size={20} fill="currentColor" />
            </button>
            <button onClick={togglePlay} className={styles.playBtn}>
              {isPlaying ? (
                <Pause size={20} fill="currentColor" />
              ) : (
                <Play size={20} fill="currentColor" />
              )}
              {loading && (
                <div className={styles.loaderOverlay}>
                  <div className={styles.loader} />
                </div>
              )}
            </button>
            <button onClick={() => onNext(isShuffle)} className={styles.mainBtn}>
              <SkipForward size={20} fill="currentColor" />
            </button>
            <button
              className={`${styles.subBtn} ${isLooping ? styles.active : ''}`}
              onClick={() => setIsLooping(!isLooping)}
              title="Repeat"
            >
              <Repeat size={16} />
            </button>
          </div>

          {/* Progress Bar */}
          <div className={styles.progressBarWrapper}>
            <span className={styles.time}>{formatTime(currentTime)}</span>
            <div className={styles.sliderContainer}>
              {/* Visual layers (z 0–2) */}
              <div className={styles.trackBg} />
              <div
                className={styles.progressFill}
                style={{ width: `${progressPct}%` }}
              />
              <div
                className={styles.progressThumb}
                style={{ '--pct': progressPct }}
              />
              {/* Interactive input on top (z 3) */}
              <input
                type="range"
                min="0"
                max={duration || 0}
                value={currentTime}
                onChange={handleSeek}
                className={styles.slider}
              />
            </div>
            <span className={styles.time}>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume & Misc */}
        <div className={styles.extra}>
          <div className={styles.volumeGroup}>
            <button className={styles.volumeIconBtn} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted || (volume === 0 && !isMuted)
                ? <VolumeX size={16} />
                : <Volume2 size={16} />
              }
            </button>
            <div className={styles.volumeSliderWrapper}>
              <div className={styles.volumeTrackBg} />
              <div
                className={styles.volumeFill}
                style={{ width: `${volPct}%` }}
              />
              <div
                className={styles.volumeThumb}
                style={{ '--vol-pct': volPct }}
              />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={isMuted ? 0 : volume}
                onChange={handleVolume}
                className={styles.volumeSlider}
              />
            </div>
          </div>
          <button className={styles.iconBtn} onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

