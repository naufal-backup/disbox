import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './MusicPlayer.module.css';

import { formatSize, getMimeType } from './MusicPlayer/MusicPlayerUtils.js';
import MusicControls from './MusicPlayer/MusicControls.jsx';
import ProgressBar from './MusicPlayer/ProgressBar.jsx';
import VolumeControl from './MusicPlayer/VolumeControl.jsx';
import PlaylistPanel from './MusicPlayer/PlaylistPanel.jsx';

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

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(console.error);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isMuted) { audio.volume = volume || 1; setIsMuted(false); }
    else { audio.volume = 0; setIsMuted(true); }
  };

  const handleVolumeChange = (e) => {
    const audio = audioRef.current;
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (audio) audio.volume = newVolume;
    setIsMuted(newVolume === 0);
  };

  const handleSeek = (e) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * duration;
  };

  const goToPrevious = () => { if (currentIndex > 0) onFileChange?.(playlist[currentIndex - 1]); };
  const goToNext = () => { if (currentIndex < playlist.length - 1) onFileChange?.(playlist[currentIndex + 1]); };
  const toggleShuffle = () => setIsShuffle(!isShuffle);
  const toggleRepeat = () => setRepeatMode((prev) => (prev + 1) % 3);

  const name = file?.path?.split('/')?.pop() || 'Unknown';
  const fileName = name.replace(/\.[^/.]+$/, '');

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const audio = audioRef.current;
      if (!audio) return;
      let handled = true;
      switch (e.key.toLowerCase()) {
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'arrowleft': e.preventDefault(); audio.currentTime = Math.max(0, audio.currentTime - 5); break;
        case 'arrowright': e.preventDefault(); audio.currentTime = Math.min(duration, audio.currentTime + 5); break;
        case 'arrowup': e.preventDefault(); setVolume(v => { const nv = Math.min(1, v + 0.1); audio.volume = nv; return nv; }); setIsMuted(false); break;
        case 'arrowdown': e.preventDefault(); setVolume(v => { const nv = Math.max(0, v - 0.1); audio.volume = nv; return nv; }); setIsMuted(false); break;
        case 'm': e.preventDefault(); toggleMute(); break;
        case 's': e.preventDefault(); toggleShuffle(); break;
        case 'r': e.preventDefault(); toggleRepeat(); break;
        case 'p': e.preventDefault(); setShowPlaylist(p => !p); break;
        case 'escape': e.preventDefault(); onClose?.(); break;
        default: handled = false;
      }
      if (handled) e.stopPropagation();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [duration, onClose]);

  return (
    <div className={styles.container}>
      <audio ref={audioRef} preload="metadata" />
      <div className={styles.player}>
        <div className={styles.trackInfo}>
          <div className={styles.trackName}>{fileName}</div>
          <div className={styles.trackMeta}>{formatSize(file?.size)} · {getMimeType(name)}</div>
        </div>

        <MusicControls 
          isShuffle={isShuffle} toggleShuffle={toggleShuffle}
          goToPrevious={goToPrevious} togglePlay={togglePlay}
          isLoading={isLoading} isPlaying={isPlaying}
          goToNext={goToNext} repeatMode={repeatMode} toggleRepeat={toggleRepeat}
        />

        <ProgressBar currentTime={currentTime} duration={duration} handleSeek={handleSeek} />

        <VolumeControl 
          showPlaylist={showPlaylist} setShowPlaylist={setShowPlaylist}
          playlist={playlist} toggleMute={toggleMute}
          isMuted={isMuted} volume={volume} handleVolumeChange={handleVolumeChange}
        />
      </div>

      {showPlaylist && (
        <PlaylistPanel 
          playlist={playlist} file={file}
          onFileChange={onFileChange} setShowPlaylist={setShowPlaylist}
        />
      )}
    </div>
  );
}
