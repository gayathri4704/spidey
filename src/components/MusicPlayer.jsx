/**
 * MusicPlayer.jsx
 * ─────────────────────────────────────────────────────────────
 * Hybrid Mini/Full-Screen Music Player (Spotify style).
 *
 * • Mini Player: Compact bar fixed at the bottom (above bottom nav).
 * • Full Player: Overlays the entire screen with large album art,
 *   full controls, and a swipe/close button.
 *
 * All state comes from PlayerContext.
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { usePlayer } from '../context/PlayerContext';
import '../styles/player.css';

// ── Helpers ──────────────────────────────────────────────────

function fmtTime(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function WaveIcon() {
  return (
    <span className="wave-icon" aria-hidden="true">
      <span /><span /><span /><span />
    </span>
  );
}

// ── MusicPlayer ─────────────────────────────────────────────

export default function MusicPlayer({ isUserHome }) {
  const {
    currentSong,
    isPlaying,
    loading,
    currentTime,
    duration,
    volume,
    hasNext,
    hasPrev,
    togglePlay,
    nextSong,
    prevSong,
    seek,
    stop,
    setVolume,
    syncState,
  } = usePlayer();

  const [isFullScreen, setIsFullScreen] = useState(false);
  const seekRef = useRef(null);

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volPct = Math.round(volume * 100);

  const handleSeekInput = useCallback((e) => {
    const val = Number(e.target.value);
    if (seekRef.current) {
      seekRef.current.style.setProperty('--seek-pct', `${(val / (duration || 1)) * 100}%`);
    }
  }, [duration]);

  const handleSeekChange = useCallback((e) => {
    seek(Number(e.target.value));
  }, [seek]);

  const handleVolume = useCallback((e) => {
    setVolume(Number(e.target.value));
  }, [setVolume]);

  const handleMuteToggle = useCallback(() => {
    setVolume(volume > 0 ? 0 : 1);
  }, [volume, setVolume]);

  const toggleFullScreen = (e) => {
    // Don't trigger full screen if clicking a button inside the mini player
    if (e && (e.target.tagName.toLowerCase() === 'button' || e.target.closest('button'))) return;
    setIsFullScreen(!isFullScreen);
  };

  useEffect(() => {
    const handlePopState = (e) => {
      if (isFullScreen) {
        setIsFullScreen(false);
      }
    };

    if (isFullScreen) {
      window.history.pushState({ playerOpen: true }, '');
      window.addEventListener('popstate', handlePopState);
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isFullScreen]);

  const closeFullScreen = (e) => {
    if (e) e.stopPropagation();
    setIsFullScreen(false);
    if (window.history.state && window.history.state.playerOpen) {
      window.history.back();
    }
  };

  const isGuest = syncState?.roomId && !syncState?.isHost;

  const isAdminSong = currentSong?.song_type === 'admin' || currentSong?.songType === 'admin';
  const visible     = !!currentSong;

  // Render nothing if no song is loaded
  if (!visible) return null;

  return (
    <>
      {/* ── Mini Player ── */}
      <div
        id="music-player-mini"
        className={`music-player-mini ${isUserHome ? 'with-bottom-nav' : ''} ${isFullScreen ? 'hidden-by-fullscreen' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Open full screen player"
        onClick={toggleFullScreen}
        onKeyDown={(e) => e.key === 'Enter' && toggleFullScreen(e)}
      >
        <div className="mini-progress-top" style={{ width: `${pct}%` }} />
        
        <div className="mini-left">
          <div className={`mini-thumb ${isPlaying ? 'spinning' : ''}`}>🎵</div>
          <div className="mini-info">
            <p className="mini-title">{currentSong.title}</p>
            <p className="mini-artist">{currentSong.artist}</p>
          </div>
        </div>
        
        <div className="mini-right">
          <button
            className="mini-btn"
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            disabled={isGuest}
            style={isGuest ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            {loading ? <span className="player-spin mini-spin" /> : isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>
          <button
            className="mini-btn mini-btn-next"
            onClick={(e) => { e.stopPropagation(); nextSong(); }}
            disabled={!hasNext || isGuest}
            aria-label="Next song"
            style={isGuest ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
        </div>
      </div>

      {/* ── Full Screen Player ── */}
      <div
        id="music-player-full"
        className={`music-player-full ${isFullScreen ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Full screen music player"
      >
        {/* ── Top header row: close button + label ── */}
        <div className="full-player-header">
          <button
            id="full-player-close-btn"
            className="full-close-btn"
            onClick={closeFullScreen}
            aria-label="Close full screen player, return to mini player"
            title="Collapse player"
          >
            {/* Chevron-down SVG — always visible, large touch target */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          <span className="full-player-label">NOW PLAYING</span>

          {/* Spacer keeps the label centred */}
          <span className="full-player-header-spacer" aria-hidden="true" />
        </div>

        {/* ── Album art ── */}
        <div className="full-album-art">
          <div className={`full-album-placeholder ${isPlaying ? 'pulse' : ''}`}>
            🎵
          </div>
        </div>

        {/* ── Song info ── */}
        <div className="full-song-info">
          <div className="full-title-row">
            <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
              <h2 className="full-title">{currentSong.title}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <p className="full-artist" style={{ margin: 0 }}>{currentSong.artist}</p>
                {isAdminSong
                  ? <span className="badge badge-red full-badge" style={{ margin: 0 }}>🛡️ admin</span>
                  : <span className="badge badge-blue full-badge" style={{ margin: 0 }}>🕷️ user</span>}
              </div>
            </div>
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div className="full-progress-container">
          <input
            ref={seekRef}
            id="full-seek-bar"
            type="range"
            className="player-seek"
            min={0}
            max={duration || 0}
            step={0.5}
            value={currentTime}
            onInput={handleSeekInput}
            onChange={handleSeekChange}
            style={{ '--seek-pct': `${pct}%` }}
            aria-label="Song progress"
            disabled={isGuest}
          />
          <div className="full-time-row">
            <span className="player-time">{fmtTime(currentTime)}</span>
            <span className="player-time">{fmtTime(duration)}</span>
          </div>
        </div>

        {/* ── Playback controls ── */}
        <div className="full-controls">
          <button
            id="full-prev-btn"
            className="player-btn player-btn--skip"
            onClick={prevSong}
            disabled={!hasPrev || isGuest}
            aria-label="Previous song"
            title="Previous"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
          </button>

          <button
            id="full-play-pause-btn"
            className="player-btn player-btn--play full-play-btn"
            onClick={togglePlay}
            disabled={!currentSong || isGuest}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {loading
              ? <span className="player-spin" aria-hidden="true" />
              : isPlaying ? (
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg width="36" height="36" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
          </button>

          <button
            id="full-next-btn"
            className="player-btn player-btn--skip"
            onClick={nextSong}
            disabled={!hasNext || isGuest}
            aria-label="Next song"
            title="Next"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>

          <button
            id="full-stop-btn"
            className="player-btn player-btn--stop"
            onClick={stop}
            disabled={!currentSong || isGuest}
            aria-label="Stop playback"
            title="Stop"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h12v12H6z"/></svg>
          </button>
        </div>

        {/* ── Volume ── */}
        <div className="full-volume-container">
          <button
            id="full-mute-btn"
            className="player-vol-icon"
            onClick={handleMuteToggle}
            aria-label={volume === 0 ? 'Unmute' : 'Mute'}
          >
            {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
          </button>
          <input
            id="full-volume-bar"
            type="range"
            className="player-vol-slider"
            min={0}
            max={1}
            step={0.02}
            value={volume}
            onChange={handleVolume}
            style={{ '--vol-pct': `${volPct}%` }}
            aria-label="Volume"
          />
        </div>
      </div>
    </>
  );
}
