/**
 * AdminDashboard.jsx
 * ──────────────────────────────────────────────────────
 * Full admin control panel with:
 *   • Overview (statistics cards + recent songs & users)
 *   • User Management (search, role update user <-> admin, self-demote safety)
 *   • Song Management (search, filters, play inline, delete with storage file removal)
 *   • Playlist Management (search, view songs read-only, delete)
 *   • Shared Playlist Management (revoke shares)
 *   • Listening Room Monitoring (disband active rooms) 
 *──────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth }   from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { supabase }  from '../lib/supabaseClient';
import { formatDate } from '../utils/helpers';
import '../styles/dashboard.css';

const BUCKET = 'spidey';

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

export default function AdminDashboard() {
  const { user } = useAuth();
  const { playSong, currentSong, isPlaying, loading: playerLoading } = usePlayer();

  // Tabs state
  const [activeTab, setActiveTab] = useState('overview'); // overview | users | songs | playlists | shares | rooms

  // Database states
  const [profiles, setProfiles] = useState([]);
  const [songs, setSongs] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [playlistSongs, setPlaylistSongs] = useState([]);
  const [sharedPlaylists, setSharedPlaylists] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [themes, setThemes] = useState([]);
  const [roomMembers, setRoomMembers] = useState([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ text: '', type: '' });
  
  // Search & Filter states
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');

  const [songSearch, setSongSearch] = useState('');
  const [songTypeFilter, setSongTypeFilter] = useState('all');

  const [playlistSearch, setPlaylistSearch] = useState('');

  // Modals state
  const [viewPlaylistSongsId, setViewPlaylistSongsId] = useState(null);
  
  // Admin Create/Edit Modals state
  const [showSongModal, setShowSongModal] = useState(false);
  const [songFormData, setSongFormData] = useState({ id: null, title: '', artist: '', is_public: true, selectedUsers: [], file: null });
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [themeFormData, setThemeFormData] = useState({ id: null, name: '', mode: 'dark', description: '', bg_primary: '#0a0c14', bg_secondary: '#0f1220', bg_card: '#131826', bg_card_hover: '#1a2235', bg_overlay: 'rgba(10, 12, 20, 0.85)', text_primary: '#f0f4ff', text_secondary: '#9db4cc', text_muted: '#5a7090', text_accent: '#e74c3c', border_primary: 'rgba(192, 57, 43, 0.3)', border_secondary: 'rgba(37, 99, 235, 0.25)', border_subtle: 'rgba(240, 244, 255, 0.08)', primary_color: '#c0392b', secondary_color: '#1a3a6b', accent_color: '#e74c3c' });
  const [showUserModal, setShowUserModal] = useState(false);
  const [userFormData, setUserFormData] = useState({ id: null, username: '', display_name: '', role: 'user' });
  const [playlistFormData, setPlaylistFormData] = useState({ id: null, name: '', visibility: 'public', selectedUsers: [], selectedSongs: [] });
  
  // Deletions / Updates confirmation target state
  const [confirmTarget, setConfirmTarget] = useState(null); // { type: 'song'|'playlist'|'share'|'room'|'role', id: any, additionalData?: any }
  const [processingAction, setProcessingAction] = useState(false);

  // Security check: Redirect non-admins immediately
  useEffect(() => {
    if (!user || user.role !== 'admin') {
      window.location.href = '/';
    }
  }, [user]);

  // Load all dashboard data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        resProfiles,
        resSongs,
        resPlaylists,
        resPlaylistSongs,
        resSharedPlaylists,
        resRooms,
        resThemes,
        resRoomMembers
      ] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('songs').select('*').order('created_at', { ascending: false }),
        supabase.from('playlists').select('*').order('created_at', { ascending: false }),
        supabase.from('playlist_songs').select('*'),
        supabase.from('shared_playlists').select('*').order('created_at', { ascending: false }),
        supabase.from('listening_rooms').select('*').order('created_at', { ascending: false }),
        supabase.from('themes').select('*'),
        supabase.from('room_members').select('*')
      ]);

      if (resProfiles.error) throw resProfiles.error;
      if (resSongs.error) throw resSongs.error;
      if (resPlaylists.error) throw resPlaylists.error;
      if (resPlaylistSongs.error) throw resPlaylistSongs.error;
      if (resSharedPlaylists.error) throw resSharedPlaylists.error;
      if (resRooms.error) throw resRooms.error;
      if (resThemes && resThemes.error) throw resThemes.error;
      if (resRoomMembers.error) throw resRoomMembers.error;

      setProfiles(resProfiles.data || []);
      setSongs(resSongs.data || []);
      setPlaylists(resPlaylists.data || []);
      setPlaylistSongs(resPlaylistSongs.data || []);
      setSharedPlaylists(resSharedPlaylists.data || []);
      setRooms(resRooms.data || []);
      if (resThemes) setThemes(resThemes.data || []);
      setRoomMembers(resRoomMembers.data || []);
    } catch (err) {
      console.error('[AdminDashboard] Error loading data:', err);
      setMessage({ text: `Failed to load dashboard data: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role === 'admin') {
      loadData();
    }
  }, [user, loadData]);

  // Flash message handler
  const showFlash = (text, type, duration = 3000) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), duration);
  };

  // ── User Requests Management ──
  const handleUserRequest = async (targetUserId, action) => {
    setProcessingAction(true);
    try {
      const status = action === 'grant' ? 'approved' : 'rejected';
      const { error } = await supabase
        .from('profiles')
        .update({ access_status: status })
        .eq('id', targetUserId);
      if (error) throw error;

      setProfiles(prev => prev.map(p => p.id === targetUserId ? { ...p, access_status: status } : p));
      showFlash(`✅ User access ${status} successfully.`, 'success');
    } catch (err) {
      console.error('[AdminDashboard] User request error:', err);
      showFlash(err.message || 'Failed to update user request.', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  // ── Role Management ──
  const handleUpdateRole = async (targetUserId, newRole) => {
    if (targetUserId === user.id) {
      showFlash('❌ You cannot remove your own admin privileges.', 'error');
      return;
    }
    setProcessingAction(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', targetUserId);
      if (error) throw error;

      setProfiles(prev => prev.map(p => p.id === targetUserId ? { ...p, role: newRole } : p));
      showFlash(`✅ Role updated to "${newRole}" successfully.`, 'success');
    } catch (err) {
      console.error('[AdminDashboard] Role update error:', err);
      showFlash(err.message || 'Failed to update role.', 'error');
    } finally {
      setProcessingAction(false);
      setConfirmTarget(null);
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setProcessingAction(true);
    try {
      const { error } = await supabase.from('profiles').update({ username: userFormData.username, display_name: userFormData.display_name, role: userFormData.role }).eq('id', userFormData.id);
      if (error) throw error;
      setProfiles(prev => prev.map(p => p.id === userFormData.id ? { ...p, ...userFormData } : p));
      showFlash('✅ User updated successfully', 'success');
      setShowUserModal(false);
    } catch (err) {
      console.error(err);
      showFlash(err.message, 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleSaveTheme = async (e) => {
    e.preventDefault();
    setProcessingAction(true);
    try {
      const payload = { ...themeFormData };
      delete payload.id;
      if (themeFormData.id) {
        const { error } = await supabase.from('themes').update(payload).eq('id', themeFormData.id);
        if (error) throw error;
        setThemes(prev => prev.map(th => th.id === themeFormData.id ? { ...themeFormData } : th));
        showFlash('✅ Theme updated successfully', 'success');
      } else {
        const { data, error } = await supabase.from('themes').insert([payload]).select().single();
        if (error) throw error;
        setThemes([data, ...themes]);
        showFlash('✅ Theme created successfully', 'success');
      }
      setShowThemeModal(false);
    } catch (err) {
      console.error(err);
      showFlash(err.message, 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const confirmThemeDelete = async () => {
    setProcessingAction(true);
    try {
      const { error } = await supabase.from('themes').delete().eq('id', confirmTarget.id);
      if (error) throw error;
      setThemes(prev => prev.filter(t => t.id !== confirmTarget.id));
      showFlash('✅ Theme deleted', 'success');
    } catch (e) { showFlash(e.message, 'error'); } finally { setProcessingAction(false); setConfirmTarget(null); }
  };

  // ── Song Management ──
  const handleDeleteSong = async (songId) => {
    setProcessingAction(true);
    try {
      const songToDelete = songs.find(s => s.id === songId);
      if (!songToDelete) return;

      // 1. Delete references in playlist_songs first
      await supabase
        .from('playlist_songs')
        .delete()
        .eq('song_id', songId);

      // 2. Delete song row from database
      const { error } = await supabase
        .from('songs')
        .delete()
        .eq('id', songId);
      if (error) throw error;

      // 3. Remove file from storage bucket spidey (best-effort)
      if (songToDelete.storage_path) {
        await supabase.storage.from(BUCKET).remove([songToDelete.storage_path]);
      } else if (songToDelete.file_path) {
        await supabase.storage.from(BUCKET).remove([songToDelete.file_path]);
      }

      setSongs(prev => prev.filter(s => s.id !== songId));
      showFlash('✅ Song deleted successfully.', 'success');
    } catch (err) {
      console.error('[AdminDashboard] Delete song error:', err);
      showFlash(err.message || 'Failed to delete song.', 'error');
    } finally {
      setProcessingAction(false);
      setConfirmTarget(null);
    }
  };

  // ── Playlist Management ──
  const handleDeletePlaylist = async (playlistId) => {
    setProcessingAction(true);
    try {
      // 1. Delete references in playlist_songs
      await supabase
        .from('playlist_songs')
        .delete()
        .eq('playlist_id', playlistId);

      // 2. Delete shared links
      await supabase
        .from('shared_playlists')
        .delete()
        .eq('playlist_id', playlistId);

      // 3. Delete playlist row
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId);
      if (error) throw error;

      setPlaylists(prev => prev.filter(p => p.id !== playlistId));
      showFlash('✅ Playlist deleted successfully.', 'success');
    } catch (err) {
      console.error('[AdminDashboard] Delete playlist error:', err);
      showFlash(err.message || 'Failed to delete playlist.', 'error');
    } finally {
      setProcessingAction(false);
      setConfirmTarget(null);
    }
  };

  // ── Shared Playlists ──
  const handleRevokeShare = async (shareId) => {
    setProcessingAction(true);
    try {
      const { error } = await supabase
        .from('shared_playlists')
        .delete()
        .eq('id', shareId);
      if (error) throw error;

      setSharedPlaylists(prev => prev.filter(s => s.id !== shareId));
      showFlash('✅ Share link revoked successfully.', 'success');
    } catch (err) {
      console.error('[AdminDashboard] Revoke share error:', err);
      showFlash(err.message || 'Failed to revoke share link.', 'error');
    } finally {
      setProcessingAction(false);
      setConfirmTarget(null);
    }
  };

  // ── Active Listening Rooms ──
  const handleCloseRoom = async (roomId) => {
    setProcessingAction(true);
    try {
      // 1. Clear room members
      await supabase
        .from('room_members')
        .delete()
        .eq('room_id', roomId);

      // 2. Delete room
      const { error } = await supabase
        .from('listening_rooms')
        .delete()
        .eq('id', roomId);
      if (error) throw error;

      setRooms(prev => prev.filter(r => r.id !== roomId));
      showFlash('✅ Listening room disbanded.', 'success');
    } catch (err) {
      console.error('[AdminDashboard] Close room error:', err);
      showFlash(err.message || 'Failed to disband room.', 'error');
    } finally {
      setProcessingAction(false);
      setConfirmTarget(null);
    }
  };

  // ── Create/Edit Handlers ──
  const openEditSong = async (song) => {
    setSongFormData({ id: song.id, title: song.title, artist: song.artist, is_public: song.is_public !== false, selectedUsers: [], file: null });
    setShowSongModal(true);
    const { data } = await supabase.from('admin_song_access').select('user_id').eq('song_id', song.id);
    if (data && data.length > 0) setSongFormData(prev => ({ ...prev, selectedUsers: data.map(d => d.user_id) }));
  };

  const handleSaveSong = async (e) => {
    e.preventDefault();
    if (!songFormData.title || !songFormData.artist) return showFlash('Missing title or artist.', 'error');
    if (!songFormData.id && !songFormData.file) return showFlash('Please select an audio file.', 'error');

    setProcessingAction(true);
    try {
      let storagePath = null;
      let finalFileUrl = null;

      if (!songFormData.id && songFormData.file) {
        const fileExt = songFormData.file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        storagePath = `audio/admin/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, songFormData.file);

        if (uploadError) throw uploadError;
      }

      let songId = songFormData.id;

      if (!songId) {
        const payload = {
          title: songFormData.title,
          artist: songFormData.artist,
          song_type: 'admin',
          is_public: songFormData.is_public,
          bucket_id: BUCKET,
          storage_path: storagePath,
          file_path: storagePath,
          uploaded_by: user.id
        };
        console.log('[Upload] final songs payload keys:', Object.keys(payload));
        console.log('[Upload] storage path:', storagePath);
        console.log('[Upload] insert payload:', payload);

        const { data, error } = await supabase.from('songs').insert([payload]).select();
        if (error) {
          console.error('[Upload] error:', error);
          throw error;
        }
        songId = data[0].id;
        setSongs(prev => [data[0], ...prev]);
      } else {
        const payload = {
          title: songFormData.title,
          artist: songFormData.artist,
          is_public: songFormData.is_public
        };
        console.log('[Upload] final songs payload keys:', Object.keys(payload));
        console.log('[Upload] update payload:', payload);

        const { error } = await supabase.from('songs').update(payload).eq('id', songId);
        if (error) {
          console.error('[Upload] error:', error);
          throw error;
        }
        setSongs(prev => prev.map(s => s.id === songId ? { ...s, title: songFormData.title, artist: songFormData.artist, is_public: songFormData.is_public } : s));
      }

      await supabase.from('admin_song_access').delete().eq('song_id', songId);
      if (!songFormData.is_public && songFormData.selectedUsers.length > 0) {
        const accessRows = songFormData.selectedUsers.map(uid => ({ song_id: songId, user_id: uid }));
        const { error: accessErr } = await supabase.from('admin_song_access').insert(accessRows);
        if (accessErr) throw accessErr;
      }

      showFlash(`✅ Song ${songFormData.id ? 'updated' : 'uploaded'} successfully.`, 'success');
      setShowSongModal(false);
    } catch (err) {
      console.error(err);
      showFlash(err.message || 'Failed to save song.', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const openEditPlaylist = async (playlist) => {
    setPlaylistFormData({ id: playlist.id, name: playlist.name, visibility: playlist.visibility || 'public', selectedUsers: [], selectedSongs: playlistSongs.filter(ps => ps.playlist_id === playlist.id).map(ps => ps.song_id) });
    setShowPlaylistModal(true);
    if (playlist.visibility === 'selected') {
      const { data } = await supabase.from('admin_playlist_access').select('user_id').eq('playlist_id', playlist.id);
      if (data) setPlaylistFormData(prev => ({ ...prev, selectedUsers: data.map(d => d.user_id) }));
    }
  };

  const handleSavePlaylist = async (e) => {
    e.preventDefault();
    if (!playlistFormData.name) return showFlash('Missing playlist name.', 'error');

    setProcessingAction(true);
    try {
      let playlistId = playlistFormData.id;

      if (!playlistId) {
        const { data, error } = await supabase.from('playlists').insert([{
          name: playlistFormData.name,
          user_id: user.id,
          visibility: playlistFormData.visibility
        }]).select();
        if (error) throw error;
        playlistId = data[0].id;
        setPlaylists(prev => [data[0], ...prev]);
      } else {
        const { error } = await supabase.from('playlists').update({
          name: playlistFormData.name,
          visibility: playlistFormData.visibility
        }).eq('id', playlistId);
        if (error) throw error;
        setPlaylists(prev => prev.map(p => p.id === playlistId ? { ...p, name: playlistFormData.name, visibility: playlistFormData.visibility } : p));
      }

      await supabase.from('admin_playlist_access').delete().eq('playlist_id', playlistId);
      if (playlistFormData.visibility === 'selected' && playlistFormData.selectedUsers.length > 0) {
        const accessRows = playlistFormData.selectedUsers.map(uid => ({ playlist_id: playlistId, user_id: uid }));
        const { error: accessErr } = await supabase.from('admin_playlist_access').insert(accessRows);
        if (accessErr) throw accessErr;
      }

      await supabase.from('playlist_songs').delete().eq('playlist_id', playlistId);
      if (playlistFormData.selectedSongs.length > 0) {
        const songRows = playlistFormData.selectedSongs.map(sid => ({ playlist_id: playlistId, song_id: sid }));
        const { error: psErr } = await supabase.from('playlist_songs').insert(songRows);
        if (psErr) throw psErr;
        
        setPlaylistSongs(prev => {
          const filtered = prev.filter(ps => ps.playlist_id !== playlistId);
          return [...filtered, ...songRows];
        });
      } else {
        setPlaylistSongs(prev => prev.filter(ps => ps.playlist_id !== playlistId));
      }

      showFlash(`✅ Playlist ${playlistFormData.id ? 'updated' : 'created'} successfully.`, 'success');
      setShowPlaylistModal(false);
    } catch (err) {
      console.error(err);
      showFlash(err.message || 'Failed to save playlist.', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  if (!user || user.role !== 'admin') {
    return null;
  }

  // ── FILTERED DATASETS ──
  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = !userSearch || 
      (p.username?.toLowerCase() || '').includes(userSearch.toLowerCase()) ||
      (p.display_name?.toLowerCase() || '').includes(userSearch.toLowerCase());
    
    const matchesRole = userRoleFilter === 'all' || p.role === userRoleFilter;
    return matchesSearch && matchesRole;
  });

  const filteredSongs = songs.filter(s => {
    const matchesSearch = !songSearch ||
      (s.title?.toLowerCase() || '').includes(songSearch.toLowerCase()) ||
      (s.artist?.toLowerCase() || '').includes(songSearch.toLowerCase());
    
    if (!matchesSearch) return false;
    
    if (songTypeFilter === 'all') return true;
    if (songTypeFilter === 'public') return s.is_public === true;
    if (songTypeFilter === 'private') return s.is_public === false;
    if (songTypeFilter === 'admin') return s.song_type === 'admin';
    if (songTypeFilter === 'user') return s.song_type === 'user';
    return true;
  });

  const filteredPlaylists = playlists.filter(pl => {
    return !playlistSearch || (pl.name?.toLowerCase() || '').includes(playlistSearch.toLowerCase());
  });

  // Recent lists
  const recentSongs = songs.slice(0, 5);
  // Profiles that have role: 'user' or created_at sorting
  const recentUsers = [...profiles]
    .sort((a, b) => b.id.localeCompare(a.id)) // Fallback sort since profiles created_at might be missing
    .slice(0, 5);

  return (
    <div className="dashboard-layout">
      <DashTopbar />

      <main className="dashboard-body" id="admin-main" role="main">
        {/* Welcome banner */}
        <div className="dashboard-welcome admin-theme" data-emoji="🛡️" aria-label="Admin welcome banner">
          <span className="welcome-tag">⚡ Control Panel</span>
          <h1 className="welcome-title">
            Admin <span className="text-gradient-red">Dashboard</span>
          </h1>
          <p className="welcome-sub">
            Monitor and oversee platform users, songs, playlists, shared connections, and active listening rooms.
          </p>
        </div>

        {/* Global alert messages */}
        {message.text && (
          <div className={`upload-alert upload-alert-${message.type === 'success' ? 'success' : 'error'}`} style={{ marginBottom: '1.5rem' }}>
            {message.text}
          </div>
        )}

        {/* Tabs navigation */}
        <nav className="admin-tabs-nav" aria-label="Admin tabs">
          <button className={`admin-tab-btn ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>📊 Overview</button>
          <button className={`admin-tab-btn ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>👥 Users</button>
          <button className={`admin-tab-btn ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
            📬 Requests
            {profiles.filter(p => p.access_status === 'pending').length > 0 && (
              <span className="badge badge-red" style={{ marginLeft: '8px', fontSize: '0.7rem' }}>
                {profiles.filter(p => p.access_status === 'pending').length}
              </span>
            )}
          </button>
          <button className={`admin-tab-btn ${activeTab === 'songs' ? 'active' : ''}`} onClick={() => setActiveTab('songs')}>🎵 Songs</button>
          <button className={`admin-tab-btn ${activeTab === 'playlists' ? 'active' : ''}`} onClick={() => setActiveTab('playlists')}>📋 Playlists</button>
          <button className={`admin-tab-btn ${activeTab === 'shares' ? 'active' : ''}`} onClick={() => setActiveTab('shares')}>📤 Shares</button>
          <button className={`admin-tab-btn ${activeTab === 'rooms' ? 'active' : ''}`} onClick={() => setActiveTab('rooms')}>📻 Rooms</button>
          <button className={`admin-tab-btn ${activeTab === 'themes' ? 'active' : ''}`} onClick={() => setActiveTab('themes')}>🎨 Themes</button>
        </nav>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <span className="login-spinner" style={{ width: '40px', height: '40px', marginBottom: '1rem' }} />
            <p className="text-muted">Loading dashboard details...</p>
          </div>
        ) : (
          <>
            {/* TABS CONTENT */}

            {/* A) OVERVIEW TAB */}
            {activeTab === 'overview' && (
              <div>
                <div className="dash-stats" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                  <StatCard icon="👥" value={profiles.length} label="Total Users" delay={1} />
                  <StatCard icon="🎵" value={songs.length} label="Total Songs" delay={2} />
                  <StatCard icon="📋" value={playlists.length} label="Playlists" delay={3} />
                  <StatCard icon="📤" value={sharedPlaylists.length} label="Shared Links" delay={4} />
                  <StatCard icon="📻" value={rooms.length} label="Active Rooms" delay={5} />
                </div>

                <div className="admin-recent-grid">
                  {/* Recent Songs */}
                  <div className="admin-recent-box">
                    <h3 className="admin-recent-title">🎵 Recent Uploads</h3>
                    {recentSongs.length === 0 ? (
                      <p className="text-muted" style={{ fontSize: '0.85rem' }}>No songs uploaded yet.</p>
                    ) : (
                      <div className="admin-recent-list">
                        {recentSongs.map(s => (
                          <div key={s.id} className="admin-recent-item">
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</p>
                              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.artist}</p>
                            </div>
                            <span className={`badge ${s.song_type === 'admin' ? 'badge-red' : 'badge-blue'}`} style={{ fontSize: '0.65rem', flexShrink: 0 }}>
                              {s.song_type}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent Users */}
                  <div className="admin-recent-box">
                    <h3 className="admin-recent-title">👥 Recently Registered</h3>
                    {recentUsers.length === 0 ? (
                      <p className="text-muted" style={{ fontSize: '0.85rem' }}>No registered users found.</p>
                    ) : (
                      <div className="admin-recent-list">
                        {recentUsers.map(u => (
                          <div key={u.id} className="admin-recent-item">
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>@{u.username}</p>
                              <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>{u.display_name || '—'}</p>
                            </div>
                            <span className={`badge ${u.role === 'admin' ? 'badge-red' : ''}`} style={{ fontSize: '0.65rem', background: u.role !== 'admin' ? 'rgba(255,255,255,0.05)' : '', color: u.role !== 'admin' ? 'var(--text-muted)' : '', border: u.role !== 'admin' ? '1px solid var(--border-subtle)' : '', flexShrink: 0 }}>
                              {u.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* B) USERS TAB */}
            {activeTab === 'users' && (
              <div className="dash-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 className="dash-section-title" style={{ marginBottom: 0 }}>👥 User Management</h2>
                  <button className="btn btn-primary" onClick={() => {
                    showFlash('Note: New users must register securely via the Signup page first. Service key is not exposed here for security.', 'error', 6000);
                  }}>➕ Add User</button>
                </div>
                <p className="text-muted" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
                  * To create a new user, please use the standard Auth Sign Up page. Admin dashboard only edits existing profiles safely.
                </p>
                
                <div className="admin-filters-row">
                  <input
                    type="text"
                    className="library-search admin-search-input"
                    placeholder="Search by username or display name..."
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                  />
                  <select
                    className="admin-filter-select"
                    value={userRoleFilter}
                    onChange={e => setUserRoleFilter(e.target.value)}
                  >
                    <option value="all">All Roles</option>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                {filteredProfiles.length === 0 ? (
                  <div className="library-empty">
                    <span>🔍</span>
                    <p>No users found matching search criteria.</p>
                  </div>
                ) : (
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Username</th>
                          <th>Display Name</th>
                          <th>Role</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredProfiles.map(p => (
                          <tr key={p.id}>
                            <td><strong>@{p.username}</strong></td>
                            <td>{p.display_name || '—'}</td>
                            <td>
                              <span className={`badge ${p.role === 'admin' ? 'badge-red' : 'badge-blue'}`}>
                                {p.role}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="song-action-btn"
                                style={{ padding: '4px 10px', fontSize: '0.8rem', marginRight: '8px' }}
                                onClick={() => {
                                  setUserFormData({ id: p.id, username: p.username || '', display_name: p.display_name || '', role: p.role || 'user' });
                                  setShowUserModal(true);
                                }}
                              >
                                ✏️ Edit
                              </button>
                              {p.id === user.id ? (
                                <span className="text-muted" style={{ fontSize: '0.8rem' }}>(You)</span>
                              ) : (
                                <button
                                  className="song-action-btn"
                                  style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                  onClick={() => setConfirmTarget({
                                    type: 'role',
                                    id: p.id,
                                    additionalData: {
                                      username: p.username,
                                      currentRole: p.role,
                                      nextRole: p.role === 'admin' ? 'user' : 'admin'
                                    }
                                  })}
                                >
                                  {p.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── USER REQUESTS TAB ──────────────────────────────────── */}
            {activeTab === 'requests' && (
              <div className="dash-section">
                <div style={{ marginBottom: '1.5rem' }}>
                  <h2 style={{ color: '#cdd6f4', fontSize: '1.5rem', marginBottom: '0.5rem' }}>Pending Approvals</h2>
                  <p className="text-muted">Review and manage new user registrations.</p>
                </div>

                <div className="dash-card">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User Info</th>
                        <th>Joined Date</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profiles.filter(p => p.access_status === 'pending').length === 0 ? (
                        <tr>
                          <td colSpan="3" style={{ textAlign: 'center', padding: '2rem' }}>
                            <span className="text-muted">No pending user requests.</span>
                          </td>
                        </tr>
                      ) : (
                        profiles.filter(p => p.access_status === 'pending').map(p => (
                          <tr key={p.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div className="admin-avatar">👤</div>
                                <div>
                                  <div style={{ fontWeight: 'bold' }}>{p.display_name} <span className="text-muted" style={{ fontWeight: 'normal' }}>@{p.username}</span></div>
                                  {p.email && <div className="text-muted" style={{ fontSize: '0.85rem' }}>{p.email}</div>}
                                </div>
                              </div>
                            </td>
                            <td className="text-muted">
                              {formatDate(p.created_at || new Date().toISOString())}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="btn btn-sm"
                                style={{ backgroundColor: '#a6e3a1', color: '#11111b', marginRight: '0.5rem' }}
                                onClick={() => handleUserRequest(p.id, 'grant')}
                                disabled={processingAction}
                              >
                                ✅ Grant Access
                              </button>
                              <button
                                className="btn btn-sm"
                                style={{ backgroundColor: '#f38ba8', color: '#11111b' }}
                                onClick={() => handleUserRequest(p.id, 'decline')}
                                disabled={processingAction}
                              >
                                ❌ Decline
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* C) SONGS TAB */}
            {activeTab === 'songs' && (
              <div className="dash-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 className="dash-section-title" style={{ marginBottom: 0 }}>🎵 Song Management</h2>
                  <button className="btn btn-primary" onClick={() => { setSongFormData({ id: null, title: '', artist: '', is_public: true, selectedUsers: [], file: null }); setShowSongModal(true); }}>
                    + Upload Admin Song
                  </button>
                </div>

                <div className="admin-filters-row">
                  <input
                    type="text"
                    className="library-search admin-search-input"
                    placeholder="Search by title or artist..."
                    value={songSearch}
                    onChange={e => setSongSearch(e.target.value)}
                  />
                  <select
                    className="admin-filter-select"
                    value={songTypeFilter}
                    onChange={e => setSongTypeFilter(e.target.value)}
                  >
                    <option value="all">All Songs</option>
                    <option value="public">Public Songs</option>
                    <option value="private">Private Songs</option>
                    <option value="admin">Uploaded by Admin</option>
                    <option value="user">Uploaded by Users</option>
                  </select>
                </div>

                {filteredSongs.length === 0 ? (
                  <div className="library-empty">
                    <span>🎵</span>
                    <p>No songs found matching search criteria.</p>
                  </div>
                ) : (
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Play</th>
                          <th>Title</th>
                          <th>Artist</th>
                          <th>Uploaded By</th>
                          <th>Type</th>
                          <th>Visibility</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSongs.map(s => {
                          const isActive = currentSong?.id === s.id;
                          const isThisPlaying = isActive && isPlaying;
                          const uploader = profiles.find(p => p.id === s.uploaded_by);
                          
                          return (
                            <tr key={s.id} className={isActive ? 'is-active-song' : ''}>
                              <td style={{ width: '40px' }}>
                                <button
                                  className={`song-play-btn ${isThisPlaying ? 'playing' : ''}`}
                                  style={{ margin: 0 }}
                                  onClick={() => isActive ? usePlayer().togglePlay() : playSong(s, filteredSongs)}
                                  disabled={isActive && playerLoading}
                                >
                                  {isActive && playerLoading ? (
                                    <span className="login-spinner" style={{ width: 12, height: 12 }} />
                                  ) : isThisPlaying ? (
                                    <WaveIcon />
                                  ) : '▶'}
                                </button>
                              </td>
                              <td><strong>{s.title}</strong></td>
                              <td>{s.artist}</td>
                              <td>
                                <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                                  {uploader ? `@${uploader.username}` : 'unknown'}
                                </span>
                              </td>
                              <td>
                                <span className={`badge ${s.song_type === 'admin' ? 'badge-red' : 'badge-blue'}`} style={{ fontSize: '0.7rem' }}>
                                  {s.song_type}
                                </span>
                              </td>
                              <td>
                                <span className="badge" style={{ fontSize: '0.7rem', background: s.is_public ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)', color: s.is_public ? '#2ecc71' : '#e74c3c', border: s.is_public ? '1px solid rgba(46, 204, 113, 0.3)' : '1px solid rgba(231, 76, 60, 0.3)' }}>
                                  {s.is_public ? 'Public' : 'Private'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                  <button className="song-action-btn" onClick={() => openEditSong(s)}>✏️ Edit</button>
                                  <button
                                    className="song-action-btn song-action-btn--danger"
                                    onClick={() => setConfirmTarget({
                                      type: 'song',
                                      id: s.id,
                                      additionalData: { title: s.title, artist: s.artist }
                                    })}
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* D) PLAYLISTS TAB */}
            {activeTab === 'playlists' && (
              <div className="dash-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h2 className="dash-section-title" style={{ marginBottom: 0 }}>📋 Playlist Management</h2>
                  <button className="btn btn-primary" onClick={() => { setPlaylistFormData({ id: null, name: '', visibility: 'public', selectedUsers: [], selectedSongs: [] }); setShowPlaylistModal(true); }}>
                    + Create Admin Playlist
                  </button>
                </div>

                <div className="admin-filters-row">
                  <input
                    type="text"
                    className="library-search admin-search-input"
                    placeholder="Search playlists by name..."
                    value={playlistSearch}
                    onChange={e => setPlaylistSearch(e.target.value)}
                  />
                </div>

                {filteredPlaylists.length === 0 ? (
                  <div className="library-empty">
                    <span>📋</span>
                    <p>No playlists found.</p>
                  </div>
                ) : (
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Playlist Name</th>
                          <th>Owner</th>
                          <th>Songs Count</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPlaylists.map(pl => {
                          const owner = profiles.find(p => p.id === pl.user_id);
                          const count = playlistSongs.filter(ps => ps.playlist_id === pl.id).length;
                          
                          return (
                            <tr key={pl.id}>
                              <td><strong>{pl.name}</strong></td>
                              <td>
                                <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                                  {owner ? `@${owner.username}` : 'unknown'}
                                </span>
                              </td>
                              <td>{count} song{count !== 1 ? 's' : ''}</td>
                              <td style={{ textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                                  <button className="song-action-btn" onClick={() => openEditPlaylist(pl)}>✏️ Edit</button>
                                  <button
                                    className="song-action-btn"
                                    onClick={() => setViewPlaylistSongsId(pl.id)}
                                  >
                                    👁️ View
                                  </button>
                                  <button
                                    className="song-action-btn song-action-btn--danger"
                                    onClick={() => setConfirmTarget({
                                      type: 'playlist',
                                      id: pl.id,
                                      additionalData: { name: pl.name }
                                    })}
                                  >
                                    🗑️ Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* E) SHARES TAB */}
            {activeTab === 'shares' && (
              <div className="dash-section">
                <h2 className="dash-section-title">📤 Shared Playlists</h2>

                {sharedPlaylists.length === 0 ? (
                  <div className="library-empty">
                    <span>📤</span>
                    <p>No active shared playlists found.</p>
                  </div>
                ) : (
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Playlist Name</th>
                          <th>Shared By</th>
                          <th>Shared With</th>
                          <th>Shared At</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sharedPlaylists.map(sp => {
                          const playlist = playlists.find(p => p.id === sp.playlist_id);
                          const sharer = profiles.find(p => p.id === sp.shared_by);
                          const receiver = profiles.find(p => p.id === sp.shared_with);
                          
                          return (
                            <tr key={sp.id}>
                              <td><strong>{playlist ? playlist.name : 'Unknown Playlist'}</strong></td>
                              <td>{sharer ? `@${sharer.username}` : 'unknown'}</td>
                              <td>{receiver ? `@${receiver.username}` : 'unknown'}</td>
                              <td>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  {sp.created_at ? formatDate(sp.created_at, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                </span>
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  className="song-action-btn song-action-btn--danger"
                                  onClick={() => setConfirmTarget({
                                    type: 'share',
                                    id: sp.id,
                                    additionalData: { playlistName: playlist ? playlist.name : 'Unknown', sharer: sharer?.username }
                                  })}
                                >
                                  Revoke Share
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* F) ROOMS TAB */}
            {activeTab === 'rooms' && (
              <div className="dash-section">
                <h2 className="dash-section-title">📻 Active Listening Rooms</h2>

                {rooms.length === 0 ? (
                  <div className="library-empty">
                    <span>📻</span>
                    <p>No active listening rooms monitored.</p>
                  </div>
                ) : (
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Room Code / ID</th>
                          <th>Room Name</th>
                          <th>Host</th>
                          <th>Members Count</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rooms.map(r => {
                          const hostProfile = profiles.find(p => p.id === r.host_id);
                          const membersCount = roomMembers.filter(rm => rm.room_id === r.id).length;
                          
                          return (
                            <tr key={r.id}>
                              <td><code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{r.id}</code></td>
                              <td><strong>{r.room_name}</strong></td>
                              <td>{hostProfile ? `@${hostProfile.username}` : 'unknown'}</td>
                              <td>{membersCount} user{membersCount !== 1 ? 's' : ''} in room</td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  className="song-action-btn song-action-btn--danger"
                                  onClick={() => setConfirmTarget({
                                    type: 'room',
                                    id: r.id,
                                    additionalData: { name: r.room_name }
                                  })}
                                >
                                  Disband Room
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
            {/* G) THEMES TAB */}
            {activeTab === 'themes' && (
              <div className="dash-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 className="dash-section-title" style={{ marginBottom: 0 }}>🎨 Theme Management</h2>
                  <button className="btn btn-primary" onClick={() => {
                    setThemeFormData({ id: null, name: '', mode: 'dark', description: '', bg_primary: '#0a0c14', bg_secondary: '#0f1220', bg_card: '#131826', bg_card_hover: '#1a2235', bg_overlay: 'rgba(10, 12, 20, 0.85)', text_primary: '#f0f4ff', text_secondary: '#9db4cc', text_muted: '#5a7090', text_accent: '#e74c3c', border_primary: 'rgba(192, 57, 43, 0.3)', border_secondary: 'rgba(37, 99, 235, 0.25)', border_subtle: 'rgba(240, 244, 255, 0.08)', primary_color: '#c0392b', secondary_color: '#1a3a6b', accent_color: '#e74c3c' });
                    setShowThemeModal(true);
                  }}>➕ Create Theme</button>
                </div>
                
                {themes.length === 0 ? (
                  <div className="library-empty">
                    <span>🎨</span>
                    <p>No themes found. Create one!</p>
                  </div>
                ) : (
                  <div className="admin-table-container">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Theme Name</th>
                          <th>Mode</th>
                          <th>Colors</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {themes.map(t => (
                          <tr key={t.id}>
                            <td><strong>{t.name}</strong></td>
                            <td>{t.mode}</td>
                            <td>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <div style={{ width: 24, height: 24, background: t.primary_color, borderRadius: 4 }}></div>
                                <div style={{ width: 24, height: 24, background: t.secondary_color, borderRadius: 4 }}></div>
                              </div>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="song-action-btn"
                                style={{ padding: '4px 10px', fontSize: '0.8rem', marginRight: '8px' }}
                                onClick={() => {
                                  setThemeFormData({ ...t });
                                  setShowThemeModal(true);
                                }}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                className="song-action-btn song-action-btn--danger"
                                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                onClick={() => setConfirmTarget({
                                  type: 'theme',
                                  id: t.id,
                                  additionalData: { name: t.name }
                                })}
                              >
                                🗑️ Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* VIEW PLAYLIST SONGS MODAL */}
      {viewPlaylistSongsId && (
        <div className="admin-modal-overlay" onClick={() => setViewPlaylistSongsId(null)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                🎵 Playlist Songs (Read-Only)
              </h3>
              <button className="admin-modal-close" onClick={() => setViewPlaylistSongsId(null)}>✕</button>
            </div>
            <div className="admin-modal-body">
              {(() => {
                const associatedSongs = playlistSongs
                  .filter(ps => ps.playlist_id === viewPlaylistSongsId)
                  .map(ps => songs.find(s => s.id === ps.song_id))
                  .filter(Boolean);
                
                if (associatedSongs.length === 0) {
                  return <p className="text-muted" style={{ textAlign: 'center', margin: '2rem 0' }}>No songs in this playlist.</p>;
                }
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {associatedSongs.map((s, index) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', width: '20px' }}>{index + 1}</span>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.artist}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="admin-modal-footer">
              <button className="btn btn-primary" onClick={() => setViewPlaylistSongsId(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* SONG UPLOAD/EDIT MODAL */}
      {showSongModal && (
        <div className="admin-modal-overlay" onClick={() => !processingAction && setShowSongModal(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSaveSong}>
              <div className="admin-modal-header">
                <h3 className="admin-modal-title">
                  🎵 {songFormData.id ? 'Edit Admin Song' : 'Upload Admin Song'}
                </h3>
                <button type="button" className="admin-modal-close" onClick={() => !processingAction && setShowSongModal(false)} disabled={processingAction}>✕</button>
              </div>
              <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {!songFormData.id && (
                  <div>
                    <label className="input-label">Audio File</label>
                    <input type="file" accept="audio/*" className="admin-input" onChange={e => setSongFormData(prev => ({ ...prev, file: e.target.files[0] }))} disabled={processingAction} required />
                  </div>
                )}
                <div>
                  <label className="input-label">Title</label>
                  <input type="text" className="admin-input" value={songFormData.title} onChange={e => setSongFormData(prev => ({ ...prev, title: e.target.value }))} disabled={processingAction} required />
                </div>
                <div>
                  <label className="input-label">Artist</label>
                  <input type="text" className="admin-input" value={songFormData.artist} onChange={e => setSongFormData(prev => ({ ...prev, artist: e.target.value }))} disabled={processingAction} required />
                </div>
                <div>
                  <label className="input-label">Visibility (is_public)</label>
                  <select className="admin-input" value={songFormData.is_public ? 'public' : 'private'} onChange={e => setSongFormData(prev => ({ ...prev, is_public: e.target.value === 'public', selectedUsers: e.target.value !== 'selected' ? [] : prev.selectedUsers }))} disabled={processingAction}>
                    <option value="public">Public (Visible to All)</option>
                    <option value="selected">Selected Users Only (Private)</option>
                    <option value="private">Private (Admin Only)</option>
                  </select>
                </div>
                {!songFormData.is_public && songFormData.selectedUsers !== undefined && (
                  <div>
                    <label className="input-label">Select Users</label>
                    <div className="admin-scroll-list" style={{ maxHeight: '150px', overflowY: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                      {profiles.filter(p => p.role !== 'admin').map(p => (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={songFormData.selectedUsers.includes(p.id)} onChange={e => {
                            const checked = e.target.checked;
                            setSongFormData(prev => ({
                              ...prev,
                              selectedUsers: checked ? [...prev.selectedUsers, p.id] : prev.selectedUsers.filter(id => id !== p.id)
                            }));
                          }} disabled={processingAction} />
                          @{p.username} {p.display_name ? `(${p.display_name})` : ''}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} onClick={() => setShowSongModal(false)} disabled={processingAction}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={processingAction}>{processingAction ? 'Saving...' : 'Save Song'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PLAYLIST CREATE/EDIT MODAL */}
      {showPlaylistModal && (
        <div className="admin-modal-overlay" onClick={() => !processingAction && setShowPlaylistModal(false)}>
          <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <form onSubmit={handleSavePlaylist}>
              <div className="admin-modal-header">
                <h3 className="admin-modal-title">
                  📋 {playlistFormData.id ? 'Edit Admin Playlist' : 'Create Admin Playlist'}
                </h3>
                <button type="button" className="admin-modal-close" onClick={() => !processingAction && setShowPlaylistModal(false)} disabled={processingAction}>✕</button>
              </div>
              <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="input-label">Playlist Name</label>
                  <input type="text" className="admin-input" value={playlistFormData.name} onChange={e => setPlaylistFormData(prev => ({ ...prev, name: e.target.value }))} disabled={processingAction} required />
                </div>
                <div>
                  <label className="input-label">Visibility</label>
                  <select className="admin-input" value={playlistFormData.visibility} onChange={e => setPlaylistFormData(prev => ({ ...prev, visibility: e.target.value }))} disabled={processingAction}>
                    <option value="public">Public (Visible to All)</option>
                    <option value="selected">Selected Users Only</option>
                    <option value="private">Private (Admin Only)</option>
                  </select>
                </div>
                {playlistFormData.visibility === 'selected' && (
                  <div>
                    <label className="input-label">Select Users</label>
                    <div className="admin-scroll-list" style={{ maxHeight: '150px', overflowY: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                      {profiles.filter(p => p.role !== 'admin').map(p => (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                          <input type="checkbox" checked={playlistFormData.selectedUsers.includes(p.id)} onChange={e => {
                            const checked = e.target.checked;
                            setPlaylistFormData(prev => ({
                              ...prev,
                              selectedUsers: checked ? [...prev.selectedUsers, p.id] : prev.selectedUsers.filter(id => id !== p.id)
                            }));
                          }} disabled={processingAction} />
                          @{p.username} {p.display_name ? `(${p.display_name})` : ''}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="input-label">Select Songs</label>
                  <div className="admin-scroll-list" style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                    {songs.map(s => (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={playlistFormData.selectedSongs.includes(s.id)} onChange={e => {
                          const checked = e.target.checked;
                          setPlaylistFormData(prev => ({
                            ...prev,
                            selectedSongs: checked ? [...prev.selectedSongs, s.id] : prev.selectedSongs.filter(id => id !== s.id)
                          }));
                        }} disabled={processingAction} />
                        {s.title} - <span style={{ color: 'var(--text-muted)' }}>{s.artist}</span>
                        {s.song_type === 'admin' && <span className="badge badge-red" style={{ fontSize: '0.6rem', marginLeft: 'auto' }}>ADMIN</span>}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }} onClick={() => setShowPlaylistModal(false)} disabled={processingAction}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={processingAction}>{processingAction ? 'Saving...' : 'Save Playlist'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG MODAL */}
      
      {/* ── Theme Modal ── */}
      {showThemeModal && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <h3>{themeFormData.id ? 'Edit Theme' : 'Create Theme'}</h3>
            <form onSubmit={handleSaveTheme} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', maxHeight: '60vh', overflowY: 'auto', paddingRight: '1rem' }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Theme Name</label>
                <input type="text" className="admin-input" required value={themeFormData.name} onChange={e => setThemeFormData({...themeFormData, name: e.target.value})} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label>Mode</label>
                <select className="admin-select" value={themeFormData.mode} onChange={e => setThemeFormData({...themeFormData, mode: e.target.value})}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
              
              <div><label>Primary Color</label><input type="color" className="admin-input" style={{height:'40px', padding: 0}} value={themeFormData.primary_color} onChange={e => setThemeFormData({...themeFormData, primary_color: e.target.value})} /></div>
              <div><label>Secondary Color</label><input type="color" className="admin-input" style={{height:'40px', padding: 0}} value={themeFormData.secondary_color} onChange={e => setThemeFormData({...themeFormData, secondary_color: e.target.value})} /></div>
              <div><label>Accent Color</label><input type="color" className="admin-input" style={{height:'40px', padding: 0}} value={themeFormData.accent_color} onChange={e => setThemeFormData({...themeFormData, accent_color: e.target.value})} /></div>
              
              <div><label>Background Primary</label><input type="text" className="admin-input" value={themeFormData.bg_primary} onChange={e => setThemeFormData({...themeFormData, bg_primary: e.target.value})} /></div>
              <div><label>Background Secondary</label><input type="text" className="admin-input" value={themeFormData.bg_secondary} onChange={e => setThemeFormData({...themeFormData, bg_secondary: e.target.value})} /></div>
              <div><label>Background Card</label><input type="text" className="admin-input" value={themeFormData.bg_card} onChange={e => setThemeFormData({...themeFormData, bg_card: e.target.value})} /></div>
              
              <div><label>Text Primary</label><input type="text" className="admin-input" value={themeFormData.text_primary} onChange={e => setThemeFormData({...themeFormData, text_primary: e.target.value})} /></div>
              <div><label>Text Secondary</label><input type="text" className="admin-input" value={themeFormData.text_secondary} onChange={e => setThemeFormData({...themeFormData, text_secondary: e.target.value})} /></div>

              <div style={{ gridColumn: 'span 2', display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button type="submit" className="spidey-btn" disabled={processingAction}>{processingAction ? 'Saving...' : 'Save Theme'}</button>
                <button type="button" className="spidey-btn spidey-btn--outline" onClick={() => setShowThemeModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── User Edit Modal ── */}
      {showUserModal && (
        <div className="admin-modal-overlay">
          <div className="admin-modal">
            <h3>Edit User Profile</h3>
            <form onSubmit={handleSaveUser}>
              <label>Username</label>
              <input type="text" className="admin-input" value={userFormData.username} onChange={e => setUserFormData({...userFormData, username: e.target.value})} />
              
              <label>Display Name</label>
              <input type="text" className="admin-input" value={userFormData.display_name} onChange={e => setUserFormData({...userFormData, display_name: e.target.value})} />
              
              <label>Role</label>
              <select className="admin-select" value={userFormData.role} onChange={e => setUserFormData({...userFormData, role: e.target.value})}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>

              <div className="admin-modal-actions" style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                <button type="submit" className="spidey-btn" disabled={processingAction}>{processingAction ? 'Saving...' : 'Save Profile'}</button>
                <button type="button" className="spidey-btn spidey-btn--outline" onClick={() => setShowUserModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* CONFIRMATION DIALOG MODAL */}
      {confirmTarget && (
        <div className="admin-modal-overlay">
          <div className="admin-modal" style={{ maxWidth: '400px' }}>
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" style={{ color: 'var(--spidey-red-light)' }}>
                ⚠ Confirm Action
              </h3>
            </div>
            <div className="admin-modal-body">
              {confirmTarget.type === 'role' && (
                <p>
                  Are you sure you want to change role of <strong>@{confirmTarget.additionalData.username}</strong> from <strong>{confirmTarget.additionalData.currentRole}</strong> to <strong>{confirmTarget.additionalData.nextRole}</strong>?
                </p>
              )}
              {confirmTarget.type === 'song' && (
                <p>
                  Are you sure you want to delete song <strong>&ldquo;{confirmTarget.additionalData.title}&rdquo;</strong> by <strong>{confirmTarget.additionalData.artist}</strong>? This action cannot be undone and will remove the file from storage.
                </p>
              )}
              {confirmTarget.type === 'playlist' && (
                <p>
                  Are you sure you want to delete playlist <strong>&ldquo;{confirmTarget.additionalData.name}&rdquo;</strong>? This will also revoke any active shared links for this playlist.
                </p>
              )}
              {confirmTarget.type === 'share' && (
                <p>
                  Are you sure you want to revoke the shared playlist link for <strong>&ldquo;{confirmTarget.additionalData.playlistName}&rdquo;</strong> shared by <strong>@{confirmTarget.additionalData.sharer}</strong>?
                </p>
              )}
              {confirmTarget.type === 'room' && (
                <p>
                  Are you sure you want to disband listening room <strong>&ldquo;{confirmTarget.additionalData.name}&rdquo;</strong>? All connected listeners will be disconnected.
                </p>
              )}
              {confirmTarget.type === 'theme' && (
                <p>
                  Are you sure you want to delete theme <strong>&ldquo;{confirmTarget.additionalData.name}&rdquo;</strong>?
                </p>
              )}
            </div>
            <div className="admin-modal-footer">
              <button
                className="btn"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
                onClick={() => setConfirmTarget(null)}
                disabled={processingAction}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ background: 'var(--spidey-red-dark)' }}
                disabled={processingAction}
                onClick={() => {
                  if (confirmTarget.type === 'role') {
                    handleUpdateRole(confirmTarget.id, confirmTarget.additionalData.nextRole);
                  } else if (confirmTarget.type === 'song') {
                    handleDeleteSong(confirmTarget.id);
                  } else if (confirmTarget.type === 'playlist') {
                    handleDeletePlaylist(confirmTarget.id);
                  } else if (confirmTarget.type === 'share') {
                    handleRevokeShare(confirmTarget.id);
                  } else if (confirmTarget.type === 'room') {
                    handleCloseRoom(confirmTarget.id);
                  } else if (confirmTarget.type === 'theme') {
                    confirmThemeDelete();
                  }
                }}
              >
                {processingAction ? 'Processing…' : 'Yes, Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
