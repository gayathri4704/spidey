/**
 * AdminDashboard.jsx
 * ──────────────────────────────────────────────────────
 * Full admin control panel with:
 *   • Live stat cards (song count, registered user count)
 *   • Upload form  – title, artist, audio file → Supabase Storage + songs table
 *   • Song library – all admin songs with playback and delete
 *   • Sticky topbar with logout
 *
 * Data sources:
 *   Songs      → Supabase songs table (song_type = 'admin')
 *   Storage    → Supabase Storage bucket: spidey
 *   User count → Supabase profiles table (role = 'user')
 *   Playback   → PlayerContext (3-tier: in-memory → IDB → Supabase signed URL)
 * ──────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth }   from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { supabase }  from '../lib/supabaseClient';
import { formatDate } from '../utils/helpers';
import '../styles/dashboard.css';

const BUCKET = 'spidey';

// ─────────────────────────────────────────────
//  Pure helpers
// ─────────────────────────────────────────────

function fmtSize(bytes) {
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)   return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function WaveIcon() {
  return (
    <span className="wave-icon" aria-hidden="true">
      <span /><span /><span /><span />
    </span>
  );
}

// ─────────────────────────────────────────────
//  Topbar
// ─────────────────────────────────────────────

function DashTopbar() {
  const { user, logout } = useAuth();
  return (
    <header className="dashboard-topbar" role="banner">
      <div className="topbar-logo">🕷️ SPIDEY</div>
      <div className="topbar-right">
        <span className="topbar-greeting">
          Welcome, <strong>{user?.username || user?.email}</strong>
        </span>
        <span className="badge badge-red" style={{ fontSize: '0.7rem' }}>ADMIN</span>
        <button id="admin-logout-btn" className="logout-btn" onClick={logout}>
          🚪 Logout
        </button>
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────
//  Stat Card
// ─────────────────────────────────────────────

function StatCard({ icon, value, label, delay = 1 }) {
  return (
    <div className={`dash-stat-card delay-${delay}`}>
      <span className="dash-stat-icon" aria-hidden="true">{icon}</span>
      <div className="dash-stat-value">{value}</div>
      <div className="dash-stat-label">{label}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Upload Form
// ─────────────────────────────────────────────

function UploadForm({ onUploaded }) {
  const { user } = useAuth();

  const [title,    setTitle]   = useState('');
  const [artist,   setArtist]  = useState('');
  const [file,     setFile]    = useState(null);
  const [status,   setStatus]  = useState('idle'); // idle | uploading | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (status !== 'success') return;
    const t = setTimeout(() => setStatus('idle'), 3500);
    return () => clearTimeout(t);
  }, [status]);

  const handleFile = (chosen) => {
    if (!chosen) return;
    if (!chosen.type.startsWith('audio/')) {
      setErrorMsg('Only audio files are allowed (mp3, wav, ogg, flac…).');
      setFile(null);
      return;
    }
    if (chosen.size > 50 * 1024 * 1024) {
      setErrorMsg('File exceeds the 50 MB limit.');
      setFile(null);
      return;
    }
    setErrorMsg('');
    setFile(chosen);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim())  { setErrorMsg('Song title is required.');     return; }
    if (!artist.trim()) { setErrorMsg('Artist name is required.');    return; }
    if (!file)          { setErrorMsg('Please select an audio file.'); return; }

    setStatus('uploading');
    try {
      // 1. Upload file to Supabase Storage
      const ext      = file.name.split('.').pop();
      const filePath = `audio/${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

      // 2. Insert metadata into songs table
      const { data: newSong, error: insertError } = await supabase
        .from('songs')
        .insert({
          title:        title.trim(),
          artist:       artist.trim(),
          uploaded_by:  user.id,
          song_type:    'admin',
          file_path:    filePath,
          storage_path: filePath,
          mime_type:    file.type,
          file_size:    file.size,
          is_public:    false,
          // file_url intentionally omitted – bucket is private, signed URLs used at play-time
        })
        .select()
        .single();

      if (insertError) {
        // Rollback: remove the uploaded file
        await supabase.storage.from(BUCKET).remove([filePath]);
        throw new Error(`DB insert failed: ${insertError.message}`);
      }

      setStatus('success');
      setTitle('');
      setArtist('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploaded(newSong);
    } catch (err) {
      console.error('[AdminDashboard] Upload error:', err);
      setErrorMsg(err.message || 'Upload failed. Please try again.');
      setStatus('error');
    }
  };

  return (
    <div className="dash-section" aria-labelledby="upload-section-title">
      <h2 className="dash-section-title" id="upload-section-title">
        <span aria-hidden="true">🎵</span> Upload Song
      </h2>

      <form id="admin-upload-form" className="upload-form" onSubmit={handleSubmit} noValidate>
        {/* Title + Artist row */}
        <div className="upload-field-row">
          <div className="upload-field">
            <label htmlFor="upload-title" className="upload-label">
              Song Title <span className="upload-required">*</span>
            </label>
            <div className="upload-input-wrap">
              <span className="upload-input-icon" aria-hidden="true">🎵</span>
              <input
                id="upload-title"
                type="text"
                className="upload-input"
                placeholder="e.g. Swing Through Manhattan"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>
          </div>

          <div className="upload-field">
            <label htmlFor="upload-artist" className="upload-label">
              Artist <span className="upload-required">*</span>
            </label>
            <div className="upload-input-wrap">
              <span className="upload-input-icon" aria-hidden="true">🎤</span>
              <input
                id="upload-artist"
                type="text"
                className="upload-input"
                placeholder="e.g. Peter Parker"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                maxLength={80}
              />
            </div>
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={`drop-zone${dragOver ? ' drag-over' : ''}${file ? ' has-file' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Drop audio file here or click to browse"
          onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            id="upload-file-input"
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {file ? (
            <div className="drop-zone__file-info">
              <span className="drop-zone__file-icon" aria-hidden="true">🎧</span>
              <div>
                <p className="drop-zone__filename">{file.name}</p>
                <p className="drop-zone__filesize">{fmtSize(file.size)}</p>
              </div>
              <button
                type="button"
                className="drop-zone__clear"
                aria-label="Remove selected file"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >✕</button>
            </div>
          ) : (
            <>
              <span className="drop-zone__icon" aria-hidden="true">☁️</span>
              <p className="drop-zone__text">
                Drag &amp; drop an audio file, or <span className="drop-zone__link">browse</span>
              </p>
              <p className="drop-zone__hint">MP3, WAV, OGG, FLAC, AAC – max 50 MB</p>
            </>
          )}
        </div>

        {/* Meta badges */}
        <div className="upload-meta-badges">
          <span className="badge badge-red">uploadedBy: {user?.username || 'admin'}</span>
          <span className="badge badge-blue">songType: admin</span>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontSize: '0.7rem' }}>
            Visible to all users
          </span>
          <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', fontSize: '0.7rem' }}>
            ☁️ Stored in Supabase
          </span>
        </div>

        {/* Alerts */}
        {(errorMsg || status === 'error') && (
          <div className="upload-alert upload-alert-error" role="alert">
            ⚠️ {errorMsg || 'Upload failed. Please try again.'}
          </div>
        )}
        {status === 'success' && (
          <div className="upload-alert upload-alert-success" role="status">
            ✅ Song uploaded to Supabase and is now visible to all users!
          </div>
        )}

        <button
          id="admin-upload-submit"
          type="submit"
          className="btn btn-primary upload-submit-btn"
          disabled={status === 'uploading'}
        >
          {status === 'uploading' ? (
            <><span className="login-spinner" aria-hidden="true" /> Uploading…</>
          ) : (
            '⬆️  Upload Song'
          )}
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Song Row
// ─────────────────────────────────────────────

function SongRow({ song, queue, onDelete, isDeleting }) {
  const { playSong, togglePlay, currentSong, isPlaying, loading } = usePlayer();
  const [confirmDel, setConfirmDel] = useState(false);

  const isActive      = currentSong?.id === song.id;
  const isThisPlaying = isActive && isPlaying;

  const handlePlayToggle = useCallback(() => {
    if (isActive) {
      togglePlay();
    } else {
      playSong(song, queue);
    }
  }, [isActive, togglePlay, playSong, song, queue]);

  const handleDelete = () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    onDelete(song.id);
  };

  const uploadDate = song.created_at
    ? formatDate(song.created_at, { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div className={`song-row${isDeleting ? ' song-row--deleting' : ''}${isActive ? ' is-active-song' : ''}`}>
      {/* Play button */}
      <button
        id={`play-song-${song.id}`}
        className={`song-play-btn${isThisPlaying ? ' playing' : ''}`}
        onClick={handlePlayToggle}
        aria-label={isThisPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
        disabled={isActive && loading}
      >
        {isActive && loading
          ? <span className="login-spinner" style={{ width: 14, height: 14 }} aria-hidden="true" />
          : isThisPlaying
            ? <WaveIcon />
            : '▶'}
      </button>

      {/* Info */}
      <div className="song-info">
        <p className="song-title">{song.title}</p>
        <p className="song-artist">{song.artist}</p>
      </div>

      {/* Meta */}
      <div className="song-meta">
        <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>admin</span>
        <span className="song-date">{uploadDate}</span>
      </div>

      {/* Delete */}
      <div className="song-actions">
        {confirmDel ? (
          <>
            <button
              id={`confirm-delete-${song.id}`}
              className="song-action-btn song-action-btn--danger"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? '…' : 'Confirm'}
            </button>
            <button
              id={`cancel-delete-${song.id}`}
              className="song-action-btn"
              onClick={() => setConfirmDel(false)}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            id={`delete-song-${song.id}`}
            className="song-action-btn song-action-btn--danger"
            onClick={handleDelete}
            aria-label={`Delete ${song.title}`}
          >
            🗑️
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Song Library
// ─────────────────────────────────────────────

function SongLibrary({ songs, onDelete, deletingId }) {
  const [search, setSearch] = useState('');

  const filtered = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.artist.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="dash-section" aria-labelledby="library-section-title">
      <div className="library-header">
        <h2 className="dash-section-title" id="library-section-title">
          <span aria-hidden="true">📂</span> Song Library
          <span className="library-count">{songs.length}</span>
        </h2>

        {songs.length > 0 && (
          <div className="library-search-wrap">
            <span className="library-search-icon" aria-hidden="true">🔍</span>
            <input
              id="admin-song-search"
              type="text"
              className="library-search"
              placeholder="Search title or artist…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search songs"
            />
            {search && (
              <button
                className="library-search-clear"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >✕</button>
            )}
          </div>
        )}
      </div>

      {songs.length === 0 ? (
        <div className="library-empty">
          <span aria-hidden="true">🎵</span>
          <p>No songs uploaded yet. Upload your first track above!</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="library-empty">
          <span aria-hidden="true">🔍</span>
          <p>No songs match &ldquo;{search}&rdquo;.</p>
        </div>
      ) : (
        <div className="song-list" role="list" aria-label="Admin song library">
          {filtered.map((song) => (
            <SongRow
              key={song.id}
              song={song}
              queue={songs}
              onDelete={onDelete}
              isDeleting={deletingId === song.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  AdminDashboard (root)
// ─────────────────────────────────────────────

export default function AdminDashboard() {
  const { user } = useAuth();

  const [songs,      setSongs]      = useState([]);
  const [userCount,  setUserCount]  = useState(0);
  const [deletingId, setDeletingId] = useState(null);
  const [loading,    setLoading]    = useState(true);

  // ── Load songs + user count from Supabase ──
  const loadData = useCallback(async () => {
    try {
      const [songsResult, countResult] = await Promise.all([
        supabase
          .from('songs')
          .select('*')
          .eq('song_type', 'admin')
          .order('created_at', { ascending: false }),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'user'),
      ]);

      if (songsResult.error) console.error('[AdminDashboard] Songs load error:', songsResult.error.message);
      if (countResult.error) console.error('[AdminDashboard] Count error:', countResult.error.message);

      setSongs(songsResult.data || []);
      setUserCount(countResult.count || 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Upload callback ─────────────────────────
  const handleUploaded = (newSong) => {
    setSongs((prev) => [newSong, ...prev]);
  };

  // ── Delete: remove from songs table + Storage
  const handleDelete = async (songId) => {
    setDeletingId(songId);
    try {
      const song = songs.find((s) => s.id === songId);

      const { error } = await supabase
        .from('songs')
        .delete()
        .eq('id', songId);

      if (error) {
        console.error('[AdminDashboard] Delete error:', error.message);
        return;
      }

      // Remove file from Storage (best-effort)
      if (song?.storage_path) {
        await supabase.storage.from(BUCKET).remove([song.storage_path]);
      }

      setSongs((prev) => prev.filter((s) => s.id !== songId));
    } catch (err) {
      console.error('[AdminDashboard] Delete failed:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const joinDate = user?.createdAt
    ? formatDate(user.createdAt, { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  return (
    <div className="dashboard-layout">
      <DashTopbar />

      <main className="dashboard-body" id="admin-main" role="main">

        {/* Welcome banner */}
        <div
          className="dashboard-welcome admin-theme"
          data-emoji="🛡️"
          aria-label="Admin welcome banner"
        >
          <span className="welcome-tag">⚡ Control Panel</span>
          <h1 className="welcome-title">
            Admin <span className="text-gradient-red">Dashboard</span>
          </h1>
          <p className="welcome-sub">
            Upload songs for all users, manage the library, and oversee the platform from this secure command centre.
          </p>
        </div>

        {/* Stat cards */}
        <div className="dash-stats" aria-label="Overview statistics">
          <StatCard icon="🎵" value={loading ? '…' : songs.length} label="Admin Songs"      delay={1} />
          <StatCard icon="👥" value={loading ? '…' : userCount}    label="Registered Users" delay={2} />
          <StatCard icon="🛡️" value="admin"                        label="Your Role"         delay={3} />
          <StatCard icon="📅" value={joinDate}                      label="Member Since"     delay={4} />
        </div>

        {/* Upload form */}
        <UploadForm onUploaded={handleUploaded} />

        {/* Song library */}
        <SongLibrary
          songs={songs}
          onDelete={handleDelete}
          deletingId={deletingId}
        />

      </main>
    </div>
  );
}
