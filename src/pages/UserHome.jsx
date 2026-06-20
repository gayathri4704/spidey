/**
 * UserHome.jsx
 * ──────────────────────────────────────────────────────────────
 * Full user portal with Spotify-like Bottom Navigation tabs:
 *   • Home: All available songs (Admin + Mine)
 *   • Connect: Social features (Friends, Rooms)
 *   • Library: Favorites & My Songs
 *   • Chat: E2EE messaging
 *   • Todo: Personal task list
 *   • Settings: Profile, Themes, Security (via ⚙️ topbar icon)
 * ──────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth }   from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { useTheme }  from '../context/ThemeContext';
import { supabase }  from '../lib/supabaseClient';
import { formatDate } from '../utils/helpers';
import EmojiPicker from 'emoji-picker-react';
import '../styles/dashboard.css';
import TodoTab from '../components/TodoTab';
import DebugHealthCheck from '../components/DebugHealthCheck';
import { encryptMessage, decryptMessage, getPrivateKey, savePrivateKey, generateKeyPair, exportPublicKey, generateSafetyNumber } from '../utils/crypto';

const BUCKET = 'spidey';

// ── Pure helpers ──
function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function WaveIcon() {
  return (
    <span className="wave-icon" aria-hidden="true">
      <span /><span /><span /><span />
    </span>
  );
}

async function loadAllSongs(userId) {
  const [adminResult, myResult] = await Promise.all([
    supabase.from('songs').select('*').eq('song_type', 'admin').order('created_at', { ascending: false }),
    supabase.from('songs').select('*').eq('song_type', 'user').eq('uploaded_by', userId).order('created_at', { ascending: false }),
  ]);
  
  const adminSongs = adminResult.data || [];
  const mySongs = myResult.data || [];
  
  const resolvePlayableUrl = async (song) => {
    const path = song.storage_path || song.file_path;
    if (!path) return { ...song, playable_url: null };
    const bucket = song.bucket_id || 'spidey';
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    return { ...song, playable_url: data?.signedUrl || null };
  };

  return {
    adminSongs: await Promise.all(adminSongs.map(resolvePlayableUrl)),
    mySongs: await Promise.all(mySongs.map(resolvePlayableUrl)),
  };
}

// ─────────────────────────────────────────────
//  Shared UI Components
// ─────────────────────────────────────────────

function SearchBar({ id, value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="library-search-wrap">
      <span className="library-search-icon" aria-hidden="true">🔍</span>
      <input
        id={id}
        type="text"
        className="library-search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={placeholder}
      />
      {value && <button className="library-search-clear" onClick={() => onChange('')}>✕</button>}
    </div>
  );
}

function SongRow({ song, queue, favoriteIds, onFavToggle, onDelete, isDeleting, showDelete = false }) {
  const { playSong, togglePlay, currentSong, isPlaying, loading } = usePlayer();
  const [confirmDel, setConfirmDel] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  const isFavorited   = favoriteIds.includes(song.id);
  const isActive      = currentSong?.id === song.id;
  const isThisPlaying = isActive && isPlaying;
  const isAdminSong   = song.song_type === 'admin';

  const handlePlayToggle = () => isActive ? togglePlay() : playSong(song, queue);
  const handleFav = async () => {
    if (favLoading) return;
    setFavLoading(true);
    try { await onFavToggle(song.id); } finally { setFavLoading(false); }
  };
  const handleDelete = () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    onDelete(song.id);
  };

  return (
    <div className={`song-row user-song-row ${isDeleting ? 'song-row--deleting' : ''} ${isActive ? 'is-active-song' : ''}`} role="listitem">
      <button className={`song-play-btn ${isThisPlaying ? 'playing' : ''}`} onClick={handlePlayToggle} disabled={isActive && loading}>
        {isActive && loading ? <span className="login-spinner" style={{ width: 14, height: 14 }} /> : isThisPlaying ? <WaveIcon /> : '▶'}
      </button>

      <div className="song-info">
        <p className="song-title">{song.title}</p>
        <p className="song-artist">{song.artist}</p>
      </div>

      <div className="song-meta">
        <span className={`badge ${isAdminSong ? 'badge-red' : 'badge-blue'}`} style={{ fontSize: '0.63rem' }}>
          {isAdminSong ? '🛡️ admin' : '🕷️ mine'}
        </span>
      </div>

      <div className="song-actions">
        <button className={`song-fav-btn ${isFavorited ? 'favorited' : ''}`} onClick={handleFav} disabled={favLoading}>
          {favLoading ? '…' : isFavorited ? '⭐' : '☆'}
        </button>
        {showDelete && (
          confirmDel ? (
            <>
              <button className="song-action-btn song-action-btn--danger" onClick={handleDelete} disabled={isDeleting}>{isDeleting ? '…' : 'Confirm'}</button>
              <button className="song-action-btn" onClick={() => setConfirmDel(false)}>Cancel</button>
            </>
          ) : (
            <button className="song-action-btn song-action-btn--danger" onClick={handleDelete}>🗑️</button>
          )
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  Tab Content Components
// ─────────────────────────────────────────────

function HomeTab({ allSongs, search, favoriteIds, onFavToggle }) {
  const filtered = allSongs.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) || s.artist.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="tab-pane active" aria-labelledby="tab-home">
      <div className="dash-section">
        <h2 className="dash-section-title">🏠 All Songs</h2>
        {filtered.length === 0 ? (
          <div className="library-empty"><p>No songs found.</p></div>
        ) : (
          <div className="song-list">
            {filtered.map(song => (
              <SongRow key={song.id} song={song} queue={allSongs} favoriteIds={favoriteIds} onFavToggle={onFavToggle} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ConnectTab() {
  const { user } = useAuth();
  const { joinRoomChannel, leaveRoomChannel, syncFromHost } = usePlayer();
  const [friendSearch, setFriendSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [friends, setFriends] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  
  const [myPlaylists, setMyPlaylists] = useState([]);
  const [sharedPlaylists, setSharedPlaylists] = useState([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(true);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [selectedFriendId, setSelectedFriendId] = useState('');
  const [isSharing, setIsSharing] = useState(false);

  // ── Listen Together / Rooms ───────────────────────────────────
  const [activeRoom,     setActiveRoom]     = useState(null);   // listening_rooms row
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isLeavingRoom,  setIsLeavingRoom]  = useState(false);
  const [copiedCode,     setCopiedCode]     = useState(false);
  const [joinCode,       setJoinCode]       = useState('');
  const [isJoiningRoom,  setIsJoiningRoom]  = useState(false);
  const [roomMembers,    setRoomMembers]    = useState([]);     // profile rows of members
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [roomHost,       setRoomHost]       = useState(null);   // profile of host

  const loadFriends = useCallback(async () => {
    setIsLoadingFriends(true);
    try {
      const { data: friendRows, error } = await supabase
        .from('friends')
        .select('friend_id')
        .eq('user_id', user.id);

      if (error) throw error;

      if (friendRows && friendRows.length > 0) {
        // Deduplicate friend IDs in case of duplicate rows
        const uniqueIds = [...new Set(friendRows.map(f => f.friend_id))];
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('id, username, display_name, role')
          .in('id', uniqueIds)
          .eq('access_status', 'approved');

        if (profErr) throw profErr;

        // Final dedup by profile id (safety net)
        const seen = new Set();
        const unique = (profiles || []).filter(p => {
          if (seen.has(p.id)) return false;
          seen.add(p.id);
          return true;
        });
        setFriends(unique);
      } else {
        setFriends([]);
      }
    } catch (err) {
      console.error('[Spidey] Error loading friends:', err);
      setFriends([]);
    } finally {
      setIsLoadingFriends(false);
    }
  }, [user.id]);

  const loadIncomingRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    try {
      const { data: reqs, error } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('receiver_id', user.id)
        .eq('status', 'pending');
        
      if (error) throw error;
      
      if (reqs && reqs.length > 0) {
        const senderIds = reqs.map(r => r.sender_id);
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('id, username, display_name')
          .in('id', senderIds)
          .eq('access_status', 'approved');
          
        if (profErr) throw profErr;
        
        const combined = reqs.map(r => ({
          ...r,
          sender: profiles.find(p => p.id === r.sender_id)
        })).filter(r => r.sender);
        
        setIncomingRequests(combined);
      } else {
        setIncomingRequests([]);
      }
    } catch (err) {
      console.error('Error loading requests:', err);
    } finally {
      setIsLoadingRequests(false);
    }
  }, [user.id]);

  const loadPlaylists = useCallback(async () => {
    setIsLoadingPlaylists(true);
    try {
      // 1. Fetch my playlists
      const { data: myPl, error: myPlErr } = await supabase
        .from('playlists')
        .select('*')
        .eq('user_id', user.id);
        
      if (!myPlErr && myPl) setMyPlaylists(myPl);

      // 2. Fetch playlists shared with me
      const { data: sharedRows, error: sharedRowsErr } = await supabase
        .from('shared_playlists')
        .select('*')
        .eq('shared_with', user.id);
        
      if (sharedRowsErr) throw sharedRowsErr;
      
      if (sharedRows && sharedRows.length > 0) {
        const pIds = sharedRows.map(r => r.playlist_id);
        const sIds = sharedRows.map(r => r.shared_by);
        
        const [plData, profData] = await Promise.all([
          supabase.from('playlists').select('*').in('id', pIds),
          supabase.from('profiles').select('id, username, display_name').in('id', sIds)
        ]);
        
        const combined = sharedRows.map(r => ({
          ...r,
          playlist: plData.data?.find(p => p.id === r.playlist_id),
          shared_by_profile: profData.data?.find(p => p.id === r.shared_by)
        })).filter(r => r.playlist && r.shared_by_profile);
        
        setSharedPlaylists(combined);
      } else {
        setSharedPlaylists([]);
      }
    } catch (err) {
      console.error('Error loading playlists:', err);
    } finally {
      setIsLoadingPlaylists(false);
    }
  }, [user.id]);

  // ── Load existing room the user is already hosting ──────────
  const loadActiveRoom = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('listening_rooms')
        .select('*')
        .eq('host_id', user.id)
        .maybeSingle();
      if (error) throw error;
      setActiveRoom(data || null);
      // Re-join as host if room exists (e.g. after page refresh)
      if (data) joinRoomChannel(data.id, true);
    } catch (err) {
      console.error('[Spidey] loadActiveRoom:', err);
    }
  }, [user.id, joinRoomChannel]);

  useEffect(() => {
    loadIncomingRequests();
    loadFriends();
    loadPlaylists();
    loadActiveRoom();
  }, [loadIncomingRequests, loadFriends, loadPlaylists, loadActiveRoom]);

  useEffect(() => {
    // Watch friend_requests table for incoming request changes
    const reqChannel = supabase
      .channel('friend_requests_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests' },
        (payload) => {
          const relevantRow = payload.new || payload.old;
          if (!relevantRow) return;
          if (relevantRow.receiver_id === user.id) loadIncomingRequests();
          if (relevantRow.sender_id === user.id || relevantRow.receiver_id === user.id) loadFriends();
        }
      )
      .subscribe();

    // Watch friends table directly so My Friends updates immediately after insert
    const friendsChannel = supabase
      .channel('friends_table_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'friends' },
        (payload) => {
          if (payload.new?.user_id === user.id || payload.new?.friend_id === user.id) {
            loadFriends();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reqChannel);
      supabase.removeChannel(friendsChannel);
    };
  }, [user.id, loadIncomingRequests, loadFriends]);

  useEffect(() => {
    if (!friendSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const delay = setTimeout(async () => {
      setIsSearching(true);
      try {
        console.log('[Connect] search term:', friendSearch);
        console.log('[Connect] current user id:', user.id);
        const { data: users, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, role')
          .neq('id', user.id)
          .eq('access_status', 'approved')
          .or(`username.ilike.%${friendSearch}%,display_name.ilike.%${friendSearch}%`)
          .limit(10);
        
        if (error) {
          console.error('[Connect] search error:', error);
          throw error;
        }
        console.log('[Connect] search result count:', users?.length || 0);

        if (users && users.length > 0) {
          const { data: requests, error: reqErr } = await supabase
            .from('friend_requests')
            .select('*')
            .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
            
          if (reqErr) throw reqErr;

          const resultsWithStatus = users.map(u => {
            const req = requests?.find(r => 
              (r.sender_id === user.id && r.receiver_id === u.id) ||
              (r.receiver_id === user.id && r.sender_id === u.id)
            );
            return {
              ...u,
              friendStatus: req ? req.status : 'none',
              amSender: req ? req.sender_id === user.id : false
            };
          });
          setSearchResults(resultsWithStatus);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delay);
  }, [friendSearch, user.id]);

  const handleSendRequest = async (targetId) => {
    try {
      if (!user?.id) {
        setMessage({ text: 'Please login again', type: 'error' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        return;
      }

      if (targetId === user.id) {
        setMessage({ text: 'Cannot send request to yourself.', type: 'error' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        return;
      }

      const { data: senderProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!senderProfile) {
        setMessage({ text: 'Your profile is missing. Please logout and login again.', type: 'error' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        return;
      }

      const { data: receiverProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', targetId)
        .maybeSingle();

      if (!receiverProfile) {
        setMessage({ text: 'Selected user profile not found.', type: 'error' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        return;
      }

      // Check if already friends
      const { data: existingFriend, error: friendErr } = await supabase
        .from('friends')
        .select('*')
        .eq('user_id', user.id)
        .eq('friend_id', targetId)
        .maybeSingle();

      if (friendErr) throw friendErr;
      if (existingFriend) {
        setMessage({ text: 'Already Friends', type: 'error' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        return;
      }

      // Check existing pending request from current user
      const { data: sentReq, error: sentErr } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('sender_id', user.id)
        .eq('receiver_id', targetId)
        .eq('status', 'pending')
        .maybeSingle();
      
      if (sentErr) throw sentErr;
      if (sentReq) {
        setMessage({ text: 'Request already sent', type: 'error' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        return;
      }

      // Check existing pending request from receiver
      const { data: receivedReq, error: receivedErr } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('sender_id', targetId)
        .eq('receiver_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();
      
      if (receivedErr) throw receivedErr;
      if (receivedReq) {
        setMessage({ text: 'This user already sent you a request. Check Friend Requests.', type: 'error' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        return;
      }

      const { error } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: user.id,
          receiver_id: targetId,
          status: 'pending'
        });
      
      if (error) throw error;
      
      setMessage({ text: 'Request sent', type: 'success' });
      setSearchResults(prev => prev.map(u => u.id === targetId ? { ...u, friendStatus: 'pending', amSender: true } : u));
      
      loadIncomingRequests();
      loadFriends();
    } catch (err) {
      console.error(err);
      setMessage({ text: err.message || 'Failed to send request.', type: 'error' });
    }
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleAccept = async (requestId, senderId) => {
    try {
      const { error: updErr } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId);
      if (updErr) throw updErr;

      const { error: insErr } = await supabase
        .from('friends')
        .insert([
          { user_id: user.id, friend_id: senderId },
          { user_id: senderId, friend_id: user.id }
        ]);
        
      if (insErr && insErr.code !== '23505') throw insErr;

      setMessage({ text: 'Friend request accepted!', type: 'success' });
      loadIncomingRequests();
      loadFriends();
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Error accepting request.', type: 'error' });
    }
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleReject = async (requestId) => {
    try {
      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId);
      if (error) throw error;
      
      setMessage({ text: 'Friend request rejected.', type: 'success' });
      loadIncomingRequests();
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Error rejecting request.', type: 'error' });
    }
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  const handleSharePlaylist = async () => {
    if (!selectedPlaylistId || !selectedFriendId) return;
    setIsSharing(true);
    try {
      // Check for duplicate share
      const { data: existing } = await supabase
        .from('shared_playlists')
        .select('id')
        .eq('playlist_id', selectedPlaylistId)
        .eq('shared_with', selectedFriendId)
        .maybeSingle();
        
      if (existing) {
        setMessage({ text: 'Playlist already shared with this friend.', type: 'error' });
        setIsSharing(false);
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        return;
      }
      
      const { error } = await supabase
        .from('shared_playlists')
        .insert({
          playlist_id: selectedPlaylistId,
          shared_by: user.id,
          shared_with: selectedFriendId
        });
        
      if (error) throw error;
      
      setMessage({ text: 'Playlist shared successfully!', type: 'success' });
      setSelectedPlaylistId('');
      setSelectedFriendId('');
    } catch (err) {
      console.error(err);
      setMessage({ text: 'Failed to share playlist.', type: 'error' });
    } finally {
      setIsSharing(false);
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
  };

  // ── Create Room ────────────────────────────────────────────────
  const handleCreateRoom = async () => {
    if (isCreatingRoom) return;
    setIsCreatingRoom(true);
    try {
      // Guard: surface existing room instead of creating duplicate
      const { data: existing, error: chkErr } = await supabase
        .from('listening_rooms')
        .select('*')
        .eq('host_id', user.id)
        .maybeSingle();
      if (chkErr) throw chkErr;

      if (existing) {
        setActiveRoom(existing);
        // Re-join channel as host (in case of page refresh)
        joinRoomChannel(existing.id, true);
        setMessage({ text: 'You already have an active room!', type: 'success' });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        return;
      }

      // Create the room row
      const roomName = `${user.username || user.display_name || 'User'}'s Room`;
      const { data: newRoom, error: roomErr } = await supabase
        .from('listening_rooms')
        .insert({
          room_name:        roomName,
          host_id:          user.id,
          is_playing:       false,
          current_position: 0,
        })
        .select()
        .single();
      if (roomErr) throw roomErr;

      // Add host as first member
      const { error: memberErr } = await supabase
        .from('room_members')
        .insert({ room_id: newRoom.id, user_id: user.id });
      // Ignore duplicate-member constraint errors
      if (memberErr && memberErr.code !== '23505') throw memberErr;

      setActiveRoom(newRoom);
      // Join the realtime broadcast channel as host
      joinRoomChannel(newRoom.id, true);
      setMessage({ text: '🎧 Room created! Share the code with friends.', type: 'success' });
      setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    } catch (err) {
      console.error('[Spidey] handleCreateRoom:', err);
      setMessage({ text: err.message || 'Failed to create room.', type: 'error' });
      setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  // ── Leave Room (host = disband, guest = remove self only) ──────
  const handleLeaveRoom = async () => {
    if (!activeRoom || isLeavingRoom) return;
    setIsLeavingRoom(true);
    const isHost = activeRoom.host_id === user.id;
    try {
      if (isHost) {
        // Host leaving: remove all members then delete room
        await supabase.from('room_members').delete().eq('room_id', activeRoom.id);
        const { error } = await supabase
          .from('listening_rooms').delete()
          .eq('id', activeRoom.id).eq('host_id', user.id);
        if (error) throw error;
        setMessage({ text: 'Room closed successfully.', type: 'success' });
      } else {
        // Guest leaving: only remove self
        const { error } = await supabase
          .from('room_members').delete()
          .eq('room_id', activeRoom.id).eq('user_id', user.id);
        if (error) throw error;
        setMessage({ text: 'You left the room.', type: 'success' });
      }
      // Unsubscribe from room broadcast channel
      leaveRoomChannel();
      setActiveRoom(null);
      setRoomMembers([]);
      setRoomHost(null);
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } catch (err) {
      console.error('[Spidey] handleLeaveRoom:', err);
      setMessage({ text: err.message || 'Failed to leave room.', type: 'error' });
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    } finally {
      setIsLeavingRoom(false);
    }
  };

  // ── Join Room via code ────────────────────────────────────────
  const handleJoinRoom = async () => {
    const code = joinCode.trim().toLowerCase();
    if (!code || isJoiningRoom) return;
    setIsJoiningRoom(true);
    try {
      // Find room: match full UUID or first-8-chars prefix (case-insensitive)
      const { data: rooms, error: findErr } = await supabase
        .from('listening_rooms')
        .select('*');
      if (findErr) throw findErr;

      const match = (rooms || []).find(r =>
        r.id.toLowerCase() === code ||
        r.id.toLowerCase().startsWith(code)
      );

      if (!match) {
        setMessage({ text: 'Room not found. Check the code and try again.', type: 'error' });
        setTimeout(() => setMessage({ text: '', type: '' }), 4000);
        return;
      }

      // Insert member row (ignore duplicate)
      const { error: memberErr } = await supabase
        .from('room_members')
        .insert({ room_id: match.id, user_id: user.id });
      if (memberErr && memberErr.code !== '23505') throw memberErr;

      setActiveRoom(match);
      setJoinCode('');

      // Join the realtime broadcast channel as guest
      joinRoomChannel(match.id, false, syncFromHost);

      // Late-joiner catchup: sync current state from DB
      if (match.current_song_id) {
        const { data: songData } = await supabase
          .from('songs')
          .select('*')
          .eq('id', match.current_song_id)
          .maybeSingle();
        if (songData) {
          setTimeout(() => {
            syncFromHost({
              song: songData,
              current_position: match.current_position || 0,
              is_playing: match.is_playing || false,
              timestamp: Date.now(),
            });
          }, 800);
        }
      }

      setMessage({ text: `Joined "${match.room_name}"! 🎧`, type: 'success' });
      setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    } catch (err) {
      console.error('[Spidey] handleJoinRoom:', err);
      setMessage({ text: err.message || 'Failed to join room.', type: 'error' });
      setTimeout(() => setMessage({ text: '', type: '' }), 4000);
    } finally {
      setIsJoiningRoom(false);
    }
  };

  // ── Load room members (profiles) ──────────────────────────────
  const loadRoomMembers = useCallback(async (roomId) => {
    setIsLoadingMembers(true);
    try {
      const { data: memberRows, error: mErr } = await supabase
        .from('room_members')
        .select('user_id')
        .eq('room_id', roomId);
      if (mErr) throw mErr;
      if (!memberRows || memberRows.length === 0) { setRoomMembers([]); return; }
      const ids = [...new Set(memberRows.map(m => m.user_id))];
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .in('id', ids);
      if (pErr) throw pErr;
      setRoomMembers(profiles || []);
    } catch (err) {
      console.error('[Spidey] loadRoomMembers:', err);
      setRoomMembers([]);
    } finally {
      setIsLoadingMembers(false);
    }
  }, []);

  // ── Load room host profile ────────────────────────────────────
  const loadRoomHost = useCallback(async (hostId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .eq('id', hostId)
        .maybeSingle();
      if (error) throw error;
      setRoomHost(data || null);
    } catch (err) {
      console.error('[Spidey] loadRoomHost:', err);
    }
  }, []);

  // ── Copy room code to clipboard ───────────────────────────────
  const handleCopyCode = (code) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code).then(() => {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      });
    } else {
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  // ── Reload members + host whenever active room changes ─────────
  useEffect(() => {
    if (activeRoom) {
      loadRoomMembers(activeRoom.id);
      loadRoomHost(activeRoom.host_id);

      // Subscribe to room_members changes for real-time member list
      const membersChannel = supabase
        .channel(`room_members_${activeRoom.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${activeRoom.id}` },
          () => { loadRoomMembers(activeRoom.id); }
        )
        .subscribe();

      // Guests: auto-clear when host deletes the room
      const isGuestInRoom = activeRoom.host_id !== user.id;
      let roomDeleteChannel = null;
      if (isGuestInRoom) {
        roomDeleteChannel = supabase
          .channel(`room_delete_${activeRoom.id}`)
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'listening_rooms', filter: `id=eq.${activeRoom.id}` },
            () => {
              leaveRoomChannel();
              setActiveRoom(null);
              setRoomMembers([]);
              setRoomHost(null);
              setMessage({ text: 'The host closed the room.', type: 'error' });
              setTimeout(() => setMessage({ text: '', type: '' }), 4000);
            }
          )
          .subscribe();
      }

      return () => {
        supabase.removeChannel(membersChannel);
        if (roomDeleteChannel) supabase.removeChannel(roomDeleteChannel);
      };
    } else {
      setRoomMembers([]);
      setRoomHost(null);
    }
  }, [activeRoom, loadRoomMembers, loadRoomHost, leaveRoomChannel, user.id]);

  return (
    <div className="tab-pane active" aria-labelledby="tab-connect">
      <div className="dashboard-welcome user-theme" style={{ marginBottom: '1.5rem' }}>
        <h1 className="welcome-title">Connect</h1>
        <p className="welcome-sub">Find friends, share playlists, and listen together.</p>
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">🔍 Search Friends</h2>
        <div className="user-global-search" style={{ marginBottom: searchResults.length > 0 ? '1rem' : 0 }}>
          <SearchBar 
            id="search-friends" 
            value={friendSearch} 
            onChange={setFriendSearch} 
            placeholder="Search by username or display name..." 
          />
        </div>
        
        {message.text && (
          <div className={`upload-alert upload-alert-${message.type}`} style={{ marginBottom: '1rem' }}>
            {message.text}
          </div>
        )}

        {isSearching ? (
          <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '1rem' }}>Searching...</p>
        ) : searchResults.length > 0 ? (
          <div className="song-list">
            {searchResults.map(u => (
              <div className="song-row user-song-row" key={u.id}>
                <div className="mini-thumb" style={{ flexShrink: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--spidey-red-dark), var(--spidey-blue-dark))' }}>
                  👤
                </div>
                <div className="song-info">
                  <p className="song-title">{u.display_name || u.username}</p>
                  <p className="song-artist">@{u.username}</p>
                </div>
                <div className="song-meta">
                  <span className={`badge ${u.role === 'admin' ? 'badge-red' : 'badge-blue'}`}>
                    {u.role === 'admin' ? '🛡️ admin' : '🕷️ user'}
                  </span>
                </div>
                <div className="song-actions">
                  {u.friendStatus === 'accepted' ? (
                    <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Already Friends</span>
                  ) : u.friendStatus === 'pending' ? (
                    <span className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{u.amSender ? 'Request Sent' : 'Pending Request'}</span>
                  ) : (
                    <button className="song-action-btn" onClick={() => handleSendRequest(u.id)}>
                      Send Request
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : friendSearch.trim() && !isSearching ? (
          <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '1rem' }}>No users found.</p>
        ) : null}
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">💌 Friend Requests</h2>
        {isLoadingRequests ? (
          <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '1rem' }}>Loading requests...</p>
        ) : incomingRequests.length > 0 ? (
          <div className="song-list">
            {incomingRequests.map(req => (
              <div className="song-row user-song-row" key={req.id}>
                <div className="mini-thumb" style={{ flexShrink: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--spidey-red-dark), var(--spidey-blue-dark))' }}>
                  👤
                </div>
                <div className="song-info">
                  <p className="song-title">{req.sender.display_name || req.sender.username}</p>
                  <p className="song-artist">@{req.sender.username}</p>
                </div>
                <div className="song-meta">
                  <span className="badge badge-blue">New Request</span>
                </div>
                <div className="song-actions">
                  <button className="song-action-btn" onClick={() => handleAccept(req.id, req.sender_id)}>
                    Accept
                  </button>
                  <button className="song-action-btn song-action-btn--danger" onClick={() => handleReject(req.id)}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="library-empty" style={{ padding: '2rem 1rem' }}>
            <span>👋</span>
            <p>No pending requests.</p>
          </div>
        )}
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">👥 My Friends</h2>
        {isLoadingFriends ? (
          <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: '1rem' }}>Loading friends...</p>
        ) : friends.length > 0 ? (
          <div className="song-list">
            {friends.map(f => (
              <div className="song-row user-song-row" key={f.id} style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                {/* Avatar */}
                <div style={{
                  flexShrink: 0, fontSize: '1.3rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '44px', height: '44px', borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--spidey-red-dark), var(--spidey-blue-dark))',
                  boxShadow: '0 0 8px var(--spidey-red-glow)',
                }}>
                  👤
                </div>

                {/* Info */}
                <div className="song-info">
                  <p className="song-title">{f.display_name || f.username}</p>
                  <p className="song-artist">@{f.username}</p>
                </div>

                {/* Badge */}
                <div className="song-meta">
                  <span className="badge badge-blue">Friend</span>
                </div>

                {/* Actions */}
                <div className="song-actions" style={{ gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button
                    className="song-action-btn"
                    title="Share a playlist with this friend"
                    onClick={() => {
                      setSelectedFriendId(f.id);
                      document.getElementById('share-playlist-section')?.scrollIntoView({ behavior: 'smooth' });
                      setMessage({ text: `Selected ${f.display_name || f.username} for playlist sharing. Pick a playlist below.`, type: 'success' });
                      setTimeout(() => setMessage({ text: '', type: '' }), 4000);
                    }}
                  >
                    🎵 Share Playlist
                  </button>
                  <button
                    className="song-action-btn"
                    title="Listen Together (coming soon)"
                    onClick={() => {
                      setMessage({ text: 'Listening Rooms are coming soon!', type: 'success' });
                      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
                    }}
                  >
                    🎧 Listen Together
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="library-empty" style={{ padding: '2rem 1rem' }}>
            <span>👻</span>
            <p>You haven't added any friends yet. Search for users above and send a friend request!</p>
          </div>
        )}
      </div>

      <div className="dash-section" id="share-playlist-section">
        <h2 className="dash-section-title">🎵 Shared Playlists</h2>

        {/* Share Playlist UI */}
        <div style={{ marginBottom: '2rem', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Share a Playlist</h3>
          {myPlaylists.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Create playlists in Library to share with friends.</p>
          ) : friends.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>Add friends first to share your playlists.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <select
                className="upload-input"
                value={selectedPlaylistId}
                onChange={e => setSelectedPlaylistId(e.target.value)}
                style={{ padding: '10px 14px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)' }}
              >
                <option value="" style={{ color: '#000' }}>-- Select Playlist --</option>
                {myPlaylists.map(pl => (
                  <option key={pl.id} value={pl.id} style={{ color: '#000' }}>{pl.name || pl.title}</option>
                ))}
              </select>

              <select
                className="upload-input"
                value={selectedFriendId}
                onChange={e => setSelectedFriendId(e.target.value)}
                style={{ padding: '10px 14px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-primary)' }}
              >
                <option value="" style={{ color: '#000' }}>-- Select Friend --</option>
                {friends.map(f => (
                  <option key={f.id} value={f.id} style={{ color: '#000' }}>{f.display_name || f.username}</option>
                ))}
              </select>

              <button
                className="btn btn-primary"
                onClick={handleSharePlaylist}
                disabled={isSharing || !selectedPlaylistId || !selectedFriendId}
                style={{ alignSelf: 'flex-start' }}
              >
                {isSharing ? 'Sharing...' : 'Share'}
              </button>
            </div>
          )}
        </div>

        {/* Display Shared Playlists */}
        {isLoadingPlaylists ? (
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>Loading playlists...</p>
        ) : sharedPlaylists.length > 0 ? (
          <div className="song-list">
            {sharedPlaylists.map(sp => (
              <div className="song-row user-song-row" key={sp.id}>
                <div className="mini-thumb" style={{ flexShrink: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--spidey-blue-dark), var(--spidey-red-dark))' }}>
                  🎧
                </div>
                <div className="song-info">
                  <p className="song-title">{sp.playlist.name || sp.playlist.title}</p>
                  <p className="song-artist">Shared by @{sp.shared_by_profile.username}</p>
                </div>
                <div className="song-meta">
                  <span className="badge badge-red">Playlist</span>
                </div>
                <div className="song-actions">
                  <button className="song-action-btn" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                    Open (Soon)
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="library-empty" style={{ padding: '2rem 1rem' }}>
            <span>🎧</span>
            <p>No shared playlists available.</p>
          </div>
        )}
      </div>

      <div className="dash-section" id="listen-together-section">
        <h2 className="dash-section-title">📻 Listen Together</h2>
        <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          Create a room and invite friends to listen in sync.
        </p>

        {/* ── Active Room Card ── */}
        {activeRoom ? (
          <div style={{
            background: 'linear-gradient(135deg, rgba(192,57,43,0.12), rgba(26,58,107,0.12))',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            marginBottom: '1rem',
          }}>
            {/* Room header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{
                width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--spidey-red-dark), var(--spidey-blue-dark))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem', boxShadow: '0 0 12px var(--spidey-red-glow)',
              }}>🎙️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {activeRoom.room_name}
                </p>
                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Hosted by @{roomHost?.username || '…'} &nbsp;·&nbsp; {roomMembers.length} member{roomMembers.length !== 1 ? 's' : ''}
                </p>
              </div>
              <span className="badge badge-red" style={{ flexShrink: 0 }}>🔴 Live</span>
            </div>

            {/* Room code */}
            <div className="room-card-header">
              <div className="room-code-section">
                <p className="room-code-label">Room Code</p>
                <p className="room-code-value">
                  {activeRoom.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <button
                id="copy-room-code-btn"
                className="song-action-btn room-copy-btn"
                onClick={() => handleCopyCode(activeRoom.id.slice(0, 8).toUpperCase())}
              >
                {copiedCode ? '✅ Copied!' : '📋 Copy Code'}
              </button>
            </div>

            {/* Room actions */}
            <div className="room-action-buttons">
              <button
                id="invite-friend-room-btn"
                className="song-action-btn"
                onClick={() => {
                  handleCopyCode(activeRoom.id.slice(0, 8).toUpperCase());
                  setMessage({ text: 'Room code copied! Share it with a friend.', type: 'success' });
                  setTimeout(() => setMessage({ text: '', type: '' }), 3000);
                }}
              >
                👥 Invite Friend
              </button>
              <button
                id="leave-room-btn"
                className="song-action-btn song-action-btn--danger"
                onClick={handleLeaveRoom}
                disabled={isLeavingRoom}
              >
                {isLeavingRoom ? '⏳ Leaving…' : '🚪 Leave Room'}
              </button>
            </div>
          {/* ── Room members list ── */}
          <div style={{ marginTop: '1rem' }}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Members</p>
            {isLoadingMembers ? (
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>Loading members…</p>
            ) : roomMembers.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>No members yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {roomMembers.map(m => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--spidey-red-dark), var(--spidey-blue-dark))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>👤</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.display_name || m.username}</p>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>@{m.username}</p>
                    </div>
                    {m.id === activeRoom.host_id && (
                      <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>🛡️ Host</span>
                    )}
                    {m.id === user.id && m.id !== activeRoom.host_id && (
                      <span className="badge badge-blue" style={{ fontSize: '0.65rem' }}>You</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        ) : (
          /* ── No Room – Create or Join ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Create */}
            <button
              id="create-room-btn"
              className="btn btn-primary"
              onClick={handleCreateRoom}
              disabled={isCreatingRoom}
              style={{ justifyContent: 'center' }}
            >
              {isCreatingRoom
                ? <><span className="login-spinner" style={{ width: 16, height: 16 }} /> Creating…</>
                : '🎙️ Create Room'}
            </button>

            {/* Divider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>or join with a code</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-subtle)' }} />
            </div>

            {/* Join input + button */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                id="join-room-input"
                type="text"
                className="form-input"
                placeholder="Enter room code (e.g. A1B2C3D4)"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoinRoom()}
                maxLength={36}
                style={{ flex: '1 1 180px', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}
              />
              <button
                id="join-room-btn"
                className="btn btn-secondary"
                onClick={handleJoinRoom}
                disabled={isJoiningRoom || !joinCode.trim()}
                style={{ flexShrink: 0 }}
              >
                {isJoiningRoom
                  ? <><span className="login-spinner" style={{ width: 14, height: 14 }} /> Joining…</>
                  : '🔗 Join'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryTab({ favorites, mySongs, search, favoriteIds, onFavToggle, onUploaded, onDelete, deletingId }) {
  const favFiltered = favorites.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.artist.toLowerCase().includes(search.toLowerCase()));
  const myFiltered = mySongs.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.artist.toLowerCase().includes(search.toLowerCase()));

  // ── Upload state ──
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (status === 'success') {
      const t = setTimeout(() => setStatus('idle'), 3500);
      return () => clearTimeout(t);
    }
  }, [status]);

  const handleFile = (chosen) => {
    if (!chosen) return;
    if (!chosen.type.startsWith('audio/')) { setErrorMsg('Only audio files allowed.'); setFile(null); return; }
    if (chosen.size > 50 * 1024 * 1024) { setErrorMsg('File exceeds 50 MB.'); setFile(null); return; }
    setErrorMsg(''); setFile(chosen);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !artist.trim() || !file) { setErrorMsg('All fields required.'); return; }
    setStatus('uploading');
    try {
      const ext = file.name.split('.').pop();
      const filePath = `audio/${user.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(filePath, file, { contentType: file.type });
      if (upErr) throw upErr;

      const { data: newSong, error: insErr } = await supabase.from('songs').insert({
        title:        title.trim(),
        artist:       artist.trim(),
        uploaded_by:  user.id,
        song_type:    'user',
        file_path:    filePath,
        storage_path: filePath,
        mime_type:    file.type,
        file_size:    file.size,
        is_public:    false,
      }).select().single();
      if (insErr) { await supabase.storage.from(BUCKET).remove([filePath]); throw insErr; }

      setStatus('success'); setTitle(''); setArtist(''); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '';
      if(onUploaded) onUploaded(newSong);
    } catch (err) { setErrorMsg(err.message); setStatus('error'); }
  };

  return (
    <div className="tab-pane active" aria-labelledby="tab-library">
      <div className="dash-section">
        <h2 className="dash-section-title">⭐ Favorites</h2>
        {favFiltered.length === 0 ? <p className="text-muted">No favorites yet.</p> : (
          <div className="song-list">
            {favFiltered.map(song => <SongRow key={song.id} song={song} queue={favorites} favoriteIds={favoriteIds} onFavToggle={onFavToggle} />)}
          </div>
        )}
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">⬆️ Upload Song</h2>
        <div className="upload-form">
          <div className="upload-field-row">
            <input className="upload-input" placeholder="Song Title" value={title} onChange={e => setTitle(e.target.value)} />
            <input className="upload-input" placeholder="Artist" value={artist} onChange={e => setArtist(e.target.value)} />
          </div>
          <div className="drop-zone" onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
            {file ? <p>{file.name} ({fmtSize(file.size)})</p> : <p>Tap to select an audio file (max 50 MB)</p>}
          </div>
          {errorMsg && <div className="upload-alert upload-alert-error">{errorMsg}</div>}
          {status === 'success' && <div className="upload-alert upload-alert-success">Uploaded!</div>}
          <button className="btn btn-primary" onClick={handleSubmit} disabled={status === 'uploading'}>
            {status === 'uploading' ? 'Uploading...' : 'Upload'}
          </button>
        </div>
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">🕷️ My Uploads</h2>
        {myFiltered.length === 0 ? <p className="text-muted">No uploads yet.</p> : (
          <div className="song-list">
            {myFiltered.map(song => <SongRow key={song.id} song={song} queue={mySongs} favoriteIds={favoriteIds} onFavToggle={onFavToggle} onDelete={onDelete} isDeleting={deletingId === song.id} showDelete={true} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatTab({ startCall, privateKey, myPublicKey }) {
  const { user } = useAuth();
  const [friends, setFriends] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(true);
  
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [chatSearch, setChatSearch] = useState('');
  const messagesEndRef = useRef(null);
  
  const [selectedFriendPublicKey, setSelectedFriendPublicKey] = useState(null);
  const pubKeyRef = useRef(null);
  
  const [hiddenMessages, setHiddenMessages] = useState(new Set());
  const [chatSettings, setChatSettings] = useState(null);
  const [sharedSettings, setSharedSettings] = useState(null);
  const [systemEvents, setSystemEvents] = useState([]);
  const [localNotices, setLocalNotices] = useState([]);
  
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const chatMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target)) {
        setChatMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setChatMenuOpen(false);
  }, [selectedFriend?.id]);

  const [showClearModal, setShowClearModal] = useState(false);
  const [showAutoClearModal, setShowAutoClearModal] = useState(false);
  
  const [activeMessageMenu, setActiveMessageMenu] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);

  const { joinRoomChannel } = usePlayer();
  
  // Emoji & Attach State
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  // ── upsertChatMessage: insert or update-in-place ─────────────
  function upsertChatMessage(newMsg) {
    setMessages(prev => {
      const exists = prev.some(m => m.id === newMsg.id);
      if (exists) {
        return prev.map(m => m.id === newMsg.id ? { ...m, ...newMsg } : m);
      }
      return [...prev, newMsg].sort(
        (a, b) => new Date(a.created_at) - new Date(b.created_at)
      );
    });
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  // Legacy alias kept so existing call-sites still compile
  const addMessageWithoutDuplicate = upsertChatMessage;

  const handleListenTogetherInvite = async () => {
    if (!selectedFriend) return;
    const roomId = `room_${Date.now()}`;
    joinRoomChannel(roomId, true);
    
    let msgText = `I started a Listen Together room! Tap to join: ${roomId}`;
    if (!privateKey || !selectedFriendPublicKey) {
      alert("Encrypted chat is not ready. Please refresh or open this chat again.");
      return;
    }
    
    const encryptedMsgText = await encryptMessage(msgText, privateKey, selectedFriendPublicKey);
    if (!encryptedMsgText || !encryptedMsgText.includes('{"v":1')) {
      alert("Encrypted chat is not ready. Please refresh or open this chat again.");
      return;
    }
    
    try {
      await supabase.from('chat_messages').insert({
        sender_id: user.id,
        receiver_id: selectedFriend.id,
        message: encryptedMsgText
      });
    } catch (err) { console.error(err); }
  };

  const onEmojiClick = (emojiObj) => {
    setNewMessage(prev => prev + emojiObj.emoji);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleDeleteForMe = async (msgId) => {
    try {
      await supabase.from('chat_message_hidden').insert({ message_id: msgId, user_id: user.id });
      setHiddenMessages(prev => new Set(prev).add(msgId));
    } catch (err) { console.error(err); }
    setActiveMessageMenu(null);
  };

  const handleDeleteForEveryone = async (msgId) => {
    if (!window.confirm("This message will be permanently deleted for everyone.")) return;
    try {
      await supabase.rpc('delete_message_for_everyone', { msg_id: msgId });
    } catch (err) { console.error(err); }
    setActiveMessageMenu(null);
  };

  const handleClearForMe = async () => {
    try {
      const { data } = await supabase.from('chat_settings').upsert({
        user_id: user.id,
        friend_id: selectedFriend.id,
        cleared_at: new Date().toISOString()
      }, { onConflict: 'user_id,friend_id' }).select().single();
      if (data) setChatSettings(data);
    } catch (err) { console.error(err); }
    setShowClearModal(false);
    setChatMenuOpen(false);
  };

  const handleClearForBoth = async () => {
    if (!window.confirm("This will permanently delete this chat for both users. This cannot be undone.")) return;
    try {
      await supabase.rpc('clear_chat_for_both', { other_user_id: selectedFriend.id });
    } catch (err) { console.error(err); }
    setShowClearModal(false);
    setChatMenuOpen(false);
  };

  const handleAutoClearChange = async (scope, mode) => {
    try {
      if (scope === 'me') {
        const { data } = await supabase.from('chat_settings').upsert({
          user_id: user.id,
          friend_id: selectedFriend.id,
          auto_clear_mode: mode,
          auto_clear_updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,friend_id' }).select().single();
        if (data) setChatSettings(data);
        
        // Inject local notice
        const localNotice = {
          id: `local_${Date.now()}`,
          is_event: true,
          event_type: 'auto_clear_me_changed',
          event_data: { mode },
          created_at: new Date().toISOString()
        };
        setLocalNotices(prev => [...prev, localNotice]);

      } else if (scope === 'both') {
        if (!window.confirm("This will auto clear this chat for both users.")) return;
        await supabase.rpc('set_chat_shared_auto_clear', { other_user_id: selectedFriend.id, mode });
      }
    } catch (err) { console.error(err); }
    setShowAutoClearModal(false);
    setChatMenuOpen(false);
  };

  // Fetch Friends
  useEffect(() => {
    const fetchFriends = async () => {
      setIsLoadingFriends(true);
      try {
        const { data: friendRows, error } = await supabase
          .from('friends')
          .select('friend_id')
          .eq('user_id', user.id);
        if (error) throw error;
        if (friendRows && friendRows.length > 0) {
          const uniqueIds = [...new Set(friendRows.map(f => f.friend_id))];
          const { data: profiles, error: profErr } = await supabase
            .from('profiles')
            .select('id, username, display_name')
            .in('id', uniqueIds);
          if (profErr) throw profErr;
          setFriends(profiles || []);
        } else {
          setFriends([]);
        }
      } catch (err) {
        console.error('Error fetching friends:', err);
      } finally {
        setIsLoadingFriends(false);
      }
    };
    fetchFriends();
  }, [user.id]);

  // Fetch Messages when a friend is selected
  useEffect(() => {
    if (!selectedFriend) return;
    
    const fetchMessagesAndKey = async () => {
      setIsLoadingMessages(true);
      try {
        // Resolve friend's public key
        let friendPubKey = null;
        const { data: keyData } = await supabase.from('user_keys').select('public_key').eq('user_id', selectedFriend.id).maybeSingle();
        if (keyData?.public_key) {
          friendPubKey = keyData.public_key;
          setSelectedFriendPublicKey(friendPubKey);
          pubKeyRef.current = friendPubKey;
        }

        // Get my private key fresh from IndexedDB
        const myPrivKey = await getPrivateKey();

        // Direction-aware decrypt helper
        const decryptForChat = async (msg) => {
          try {
            if (!myPrivKey) throw new Error('Missing local private key');
            // Other party key = always the friend's key (ECDH is symmetric: myPriv + friendPub = same secret)
            if (!friendPubKey) throw new Error('Missing friend public key');
            const direction = msg.sender_id === user.id ? 'sent' : 'received';
            console.log('[E2EE] decrypt direction', {
              messageId: msg.id,
              direction,
              senderId: msg.sender_id,
              receiverId: msg.receiver_id,
              privateKeyExists: true,
              otherPublicKeyExists: true
            });
            const text = await decryptMessage(msg.message, myPrivKey, friendPubKey);
            return text || '🔒 Encrypted message cannot be decrypted';
          } catch (err) {
            console.warn('[E2EE] decrypt failed', { messageId: msg?.id, reason: err?.message });
            return '🔒 Encrypted message cannot be decrypted';
          }
        };

        // Fetch hidden messages
        const { data: hiddenData } = await supabase.from('chat_message_hidden').select('message_id').eq('user_id', user.id);
        const hiddenSet = new Set(hiddenData?.map(h => h.message_id) || []);
        setHiddenMessages(hiddenSet);
        
        // Fetch chat settings
        const { data: settingsData } = await supabase.from('chat_settings').select('*').eq('user_id', user.id).eq('friend_id', selectedFriend.id).maybeSingle();
        setChatSettings(settingsData);
        
        // Fetch shared settings
        const { data: sharedData } = await supabase.from('chat_shared_settings').select('*')
          .or(`and(user1_id.eq.${user.id},user2_id.eq.${selectedFriend.id}),and(user1_id.eq.${selectedFriend.id},user2_id.eq.${user.id})`)
          .maybeSingle();
        setSharedSettings(sharedData);

        const { data, error } = await supabase
          .from('chat_messages')
          .select('*')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedFriend.id}),and(sender_id.eq.${selectedFriend.id},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        const decryptedData = await Promise.all((data || []).map(async (msg) => {
          const text = await decryptForChat(msg);
          return { ...msg, message: text, is_message: true };
        }));

        // Fetch system events
        const { data: eventsData } = await supabase
          .from('chat_system_events')
          .select('*')
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${selectedFriend.id}),and(sender_id.eq.${selectedFriend.id},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: true });
        
        const eventsList = eventsData || [];
        setSystemEvents(eventsList);
        setMessages(decryptedData);
      } catch (err) {
        console.error('Error fetching messages:', err);
      } finally {
        setIsLoadingMessages(false);
        messagesEndRef.current?.scrollIntoView();
      }
    };
    fetchMessagesAndKey();

    // Subscribe to messages
    const channelName = `chat_messages_${[user.id, selectedFriend.id].sort().join('_')}`;
    console.log('[Chat realtime] subscribing', channelName);
    const channel = supabase.channel(channelName)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages'
      }, async payload => {
        console.log('[Chat realtime payload]', payload.eventType, payload);

        if (payload.eventType === 'DELETE') {
          const deletedId = payload.old?.id;
          if (deletedId) {
            setMessages(prev => prev.filter(m => m.id !== deletedId));
          }
          return;
        }

        const msg = payload.new;
        if (!msg) return;

        const isCurrentConversation =
          (msg.sender_id === user.id && msg.receiver_id === selectedFriend.id) ||
          (msg.sender_id === selectedFriend.id && msg.receiver_id === user.id);

        console.log('[Chat realtime] message belongs to active conversation', isCurrentConversation);
        if (!isCurrentConversation) return;

        // Always fetch fresh private key from IndexedDB for realtime events
        let finalMessageText = msg.message;
        try {
          const myPrivKey = await getPrivateKey();
          if (!myPrivKey) throw new Error('Missing local private key');
          const friendPubKey = pubKeyRef.current;
          if (!friendPubKey) throw new Error('Missing friend public key');

          const direction = msg.sender_id === user.id ? 'sent' : 'received';
          console.log('[E2EE] decrypt direction', {
            messageId: msg.id,
            direction,
            senderId: msg.sender_id,
            receiverId: msg.receiver_id,
            privateKeyExists: true,
            otherPublicKeyExists: true
          });
          finalMessageText = await decryptMessage(msg.message, myPrivKey, friendPubKey);
          if (!finalMessageText) finalMessageText = '🔒 Encrypted message cannot be decrypted';
        } catch (err) {
          console.warn('[E2EE] decrypt failed', { messageId: msg?.id, reason: err?.message });
          finalMessageText = '🔒 Encrypted message cannot be decrypted';
        }

        upsertChatMessage({
          ...msg,
          message: finalMessageText,
          is_message: true
        });
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_system_events'
      }, payload => {
        const ev = payload.new;
        if ((ev.sender_id === user.id && ev.receiver_id === selectedFriend.id) ||
            (ev.sender_id === selectedFriend.id && ev.receiver_id === user.id)) {
          setSystemEvents(prev => [...prev, ev]);
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_shared_settings'
      }, payload => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const setting = payload.new;
          if ((setting.user1_id === user.id && setting.user2_id === selectedFriend.id) ||
              (setting.user1_id === selectedFriend.id && setting.user2_id === user.id)) {
            setSharedSettings(setting);
          }
        }
      })
      .subscribe((status, err) => {
        console.log('[Chat realtime status]', status, err);

        if (status === 'SUBSCRIBED') {
          console.log('[Chat realtime] subscribed successfully');
        }

        if (status === 'CHANNEL_ERROR') {
          console.error('[Chat realtime] channel error', err);
        }

        if (status === 'TIMED_OUT') {
          console.error('[Chat realtime] timed out');
        }

        if (status === 'CLOSED') {
          console.warn('[Chat realtime] closed');
        }
      });

    return () => {
      console.log('[Chat realtime] removing channel', channelName);
      supabase.removeChannel(channel);
    };
  }, [selectedFriend, user?.id, privateKey]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedFriend) return;
    
    if (!friends.some(f => f.id === selectedFriend.id)) {
      console.warn('Blocked sending message to non-friend.');
      return;
    }

    if (!privateKey || !selectedFriendPublicKey) {
      alert("Encrypted chat is not ready. Please refresh or open this chat again.");
      return;
    }

    let msgText = newMessage.trim();
    setNewMessage('');
    
    const encryptedMsgText = await encryptMessage(msgText, privateKey, selectedFriendPublicKey);
    if (!encryptedMsgText || !encryptedMsgText.includes('{"v":1')) {
      alert("Encrypted chat is not ready. Please refresh or open this chat again.");
      return;
    }
    
    if (editingMessage) {
      try {
        await supabase.from('chat_messages').update({
          message: encryptedMsgText,
          edited_at: new Date().toISOString()
        }).eq('id', editingMessage.id);
        setEditingMessage(null);
      } catch(err) { console.error('Error editing message:', err); }
      return;
    }

    try {
      const { data: insertedMsg, error } = await supabase.from('chat_messages').insert({
        sender_id: user.id,
        receiver_id: selectedFriend.id,
        message: encryptedMsgText
      }).select('*').single();
      
      if (error) throw error;

      if (insertedMsg) {
        addMessageWithoutDuplicate({
          ...insertedMsg,
          message: msgText,
          is_message: true
        });
      }
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  const filteredFriends = friends.filter(f => 
    (f.display_name || '').toLowerCase().includes(chatSearch.toLowerCase()) || 
    (f.username || '').toLowerCase().includes(chatSearch.toLowerCase())
  );

  const combinedFeed = [...messages.map(m=>({...m, is_message:true})), ...systemEvents.map(e=>({...e, is_event:true})), ...localNotices]
    .sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

  const filteredFeed = combinedFeed.filter(item => {
    if (item.is_message && hiddenMessages.has(item.id)) return false;

    const itemDate = new Date(item.created_at);
    if (chatSettings?.cleared_at && itemDate < new Date(chatSettings.cleared_at)) return false;

    const meMode = chatSettings?.auto_clear_mode || 'off';
    const bothMode = sharedSettings?.auto_clear_mode || 'off';
    
    const applyClear = (mode) => {
      if (mode === '24h' && Date.now() - itemDate.getTime() > 24 * 60 * 60 * 1000) return true;
      if (mode === 'week' && Date.now() - itemDate.getTime() > 7 * 24 * 60 * 60 * 1000) return true;
      return false;
    };

    if (applyClear(meMode) || applyClear(bothMode)) return false;
    return true;
  });

  const renderSystemEvent = (ev) => {
    let text = '';
    if (ev.event_type === 'auto_clear_both_changed') {
      text = ev.event_data?.mode === 'off' 
        ? "⏱️ Auto clear for both users is turned off"
        : `⏱️ Auto clear is set to ${ev.event_data?.mode === 'week' ? '1 week' : '24 hours'} for both users`;
    } else if (ev.event_type === 'auto_clear_me_changed') {
      text = ev.event_data?.mode === 'off'
        ? "⏱️ Auto clear only for you is turned off"
        : `⏱️ Auto clear is set to ${ev.event_data?.mode === 'week' ? '1 week' : '24 hours'} only for you`;
    } else if (ev.event_type === 'message_deleted_for_everyone') {
      text = "🗑️ A message was deleted for everyone";
    } else if (ev.event_type === 'clear_for_both') {
      text = "🧹 Chat was cleared for both users";
    } else {
      return null;
    }
    return <div key={ev.id} className="e2ee-system-message">{text}</div>;
  };

  if (selectedFriend) {
    return (
      <div className="chat-conversation" aria-labelledby="tab-chat">
        <div className="chat-conversation-header">
          <div className="chat-header-left">
            <button className="chat-back-btn" onClick={() => setSelectedFriend(null)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div className="chat-header-avatar">👤</div>
            <div className="chat-header-info">
              <h2 className="chat-thread-name">{selectedFriend.display_name || selectedFriend.username}</h2>
              <span className="chat-thread-username">@{selectedFriend.username}</span>
            </div>
          </div>
          <div className="chat-header-actions">
            <button className="chat-header-icon" onClick={() => {
              if (friends.some(f => f.id === selectedFriend.id)) handleListenTogetherInvite();
            }} title="Listen Together">🎧</button>
            <button className="chat-header-icon" onClick={() => {
              if (friends.some(f => f.id === selectedFriend.id)) startCall('voice', selectedFriend);
            }} title="Voice Call">📞</button>
            <button className="chat-header-icon" onClick={() => {
              if (friends.some(f => f.id === selectedFriend.id)) startCall('video', selectedFriend);
            }} title="Video Call">📹</button>
            <div className="chat-menu-wrapper" ref={chatMenuRef}>
              <button
                type="button"
                className="chat-header-icon chat-more-btn"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log('[Chat menu] button clicked');
                  setChatMenuOpen((prev) => {
                    console.log('[Chat menu]', !prev ? 'opened' : 'closed');
                    return !prev;
                  });
                }}
                aria-label="More options"
                title="Menu"
              >
                ⋮
              </button>
              {chatMenuOpen && (
                <div
                  className="chat-dropdown-menu chat-more-menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      console.log('[Chat menu] option clicked: Clear Chat');
                      if (!user?.id || !selectedFriend?.id) {
                        setMessage?.({ type: 'error', text: 'Chat user not found.' });
                        return;
                      }
                      setShowClearModal(true);
                      setChatMenuOpen(false);
                    }}
                  >
                    Clear Chat
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      console.log('[Chat menu] option clicked: Auto Clear Chat');
                      if (!user?.id || !selectedFriend?.id) {
                        setMessage?.({ type: 'error', text: 'Chat user not found.' });
                        return;
                      }
                      setShowAutoClearModal(true);
                      setChatMenuOpen(false);
                    }}
                  >
                    Auto Clear Chat
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="chat-messages-area">
          <div className="e2ee-system-message">🔒 Messages and calls are end-to-end encrypted.</div>
          {isLoadingMessages ? (
            <p className="chat-empty-state">Loading messages...</p>
          ) : filteredFeed.length === 0 ? (
            <p className="chat-empty-state">Say hi to start the conversation!</p>
          ) : (
            filteredFeed.map(item => {
              if (item.is_event) {
                return renderSystemEvent(item);
              }
              const msg = item;
              const isMine = msg.sender_id === user.id;
              const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={msg.id} className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
                  <div className="message-bubble" onContextMenu={(e) => { e.preventDefault(); setActiveMessageMenu(msg.id); }}>
                    {msg.message}
                    {msg.edited_at && <span className="message-edited-label">(edited)</span>}
                    <span className="message-time">{time}</span>
                    
                    {activeMessageMenu === msg.id && (
                      <div className="message-action-menu">
                        <button onClick={() => handleDeleteForMe(msg.id)}>Delete for me</button>
                        {isMine && <button onClick={() => handleDeleteForEveryone(msg.id)}>Delete for everyone</button>}
                        {isMine && <button onClick={() => { setEditingMessage(msg); setNewMessage(msg.message); setActiveMessageMenu(null); }}>Edit</button>}
                        <button onClick={() => setActiveMessageMenu(null)}>Cancel</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div style={{ position: 'relative' }}>
          {showEmojiPicker && (
            <div className="emoji-picker-container">
              <EmojiPicker onEmojiClick={onEmojiClick} theme="dark" />
            </div>
          )}
          {selectedFile && (
            <div className="attachment-preview">
              <span className="attachment-name">{selectedFile.name}</span>
              <button type="button" onClick={() => setSelectedFile(null)}>✖</button>
            </div>
          )}
          {editingMessage && (
            <div className="edit-message-banner">
              <span>Editing message...</span>
              <button type="button" onClick={() => { setEditingMessage(null); setNewMessage(''); }}>✖</button>
            </div>
          )}
          <form className="chat-composer" onSubmit={handleSendMessage}>
            <button type="button" className="chat-icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>😊</button>
            <button type="button" className="chat-icon-btn" onClick={() => fileInputRef.current?.click()}>📎</button>
            <input type="file" ref={fileInputRef} hidden accept="image/*,audio/*" onChange={handleFileChange} />
            <input 
              type="text" 
              className="chat-text-input" 
              placeholder={editingMessage ? "Edit your message..." : "Type a message..."}
              value={newMessage} 
              onChange={(e) => setNewMessage(e.target.value)} 
              onClick={() => setShowEmojiPicker(false)}
            />
            <button type="submit" className="chat-send-btn" disabled={!newMessage.trim() && !selectedFile}>
              {editingMessage ? '✓' : '➤'}
            </button>
          </form>
        </div>

        {showClearModal && (
          <div className="security-modal-overlay">
            <div className="security-modal">
              <button className="security-modal-close" onClick={() => setShowClearModal(false)}>✖</button>
              <h3>Clear Chat</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
                <button className="btn-accept" onClick={handleClearForMe}>Clear only for me</button>
                <button className="btn-reject" onClick={handleClearForBoth}>Clear for both</button>
              </div>
            </div>
          </div>
        )}

        {showAutoClearModal && (
          <div className="security-modal-overlay">
            <div className="security-modal" style={{ padding: '24px', borderRadius: '24px', textAlign: 'left', minWidth: '320px' }}>
              <button className="security-modal-close" onClick={() => setShowAutoClearModal(false)}>✖</button>
              <h3 style={{ marginBottom: '16px', fontSize: '1.2rem', fontWeight: 600 }}>Auto Clear Chat</h3>
              
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>Only for me</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Current: {chatSettings?.auto_clear_mode || 'off'}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <button className="btn-accept" style={{ padding: '10px 0', fontSize: '0.9rem', borderRadius: '30px', background: (!chatSettings?.auto_clear_mode || chatSettings.auto_clear_mode === 'off') ? 'var(--bg-hover)' : 'transparent', border: '1px solid var(--border-subtle)' }} onClick={() => handleAutoClearChange('me', 'off')}>Off</button>
                  <button className="btn-accept" style={{ padding: '10px 0', fontSize: '0.9rem', borderRadius: '30px', background: chatSettings?.auto_clear_mode === '24h' ? 'var(--bg-hover)' : 'transparent', border: '1px solid var(--border-subtle)' }} onClick={() => handleAutoClearChange('me', '24h')}>24h</button>
                  <button className="btn-accept" style={{ padding: '10px 0', fontSize: '0.9rem', borderRadius: '30px', background: chatSettings?.auto_clear_mode === 'week' ? 'var(--bg-hover)' : 'transparent', border: '1px solid var(--border-subtle)' }} onClick={() => handleAutoClearChange('me', 'week')}>1 week</button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>For both</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Current: {sharedSettings?.auto_clear_mode || 'off'}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <button className="btn-accept" style={{ padding: '10px 0', fontSize: '0.9rem', borderRadius: '30px', background: (!sharedSettings?.auto_clear_mode || sharedSettings.auto_clear_mode === 'off') ? 'var(--bg-hover)' : 'transparent', border: '1px solid var(--border-subtle)' }} onClick={() => handleAutoClearChange('both', 'off')}>Off</button>
                  <button className="btn-accept" style={{ padding: '10px 0', fontSize: '0.9rem', borderRadius: '30px', background: sharedSettings?.auto_clear_mode === '24h' ? 'var(--bg-hover)' : 'transparent', border: '1px solid var(--border-subtle)' }} onClick={() => handleAutoClearChange('both', '24h')}>24h</button>
                  <button className="btn-accept" style={{ padding: '10px 0', fontSize: '0.9rem', borderRadius: '30px', background: sharedSettings?.auto_clear_mode === 'week' ? 'var(--bg-hover)' : 'transparent', border: '1px solid var(--border-subtle)' }} onClick={() => handleAutoClearChange('both', 'week')}>1 week</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="chat-app" aria-labelledby="tab-chat">
      <div className="chat-list-screen">
        <div className="chat-list-header">
          <div>
            <h1 className="welcome-title" style={{ fontSize: '1.8rem', marginBottom: '4px' }}>Messages</h1>
            <p className="welcome-sub" style={{ margin: 0 }}>Chat with your friends</p>
          </div>
          <div className="chat-search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input 
              type="text" 
              placeholder="Search friends..." 
              value={chatSearch}
              onChange={(e) => setChatSearch(e.target.value)}
            />
          </div>
        </div>
        
        <div className="chat-thread-list">
          {isLoadingFriends ? (
            <p className="chat-empty">Loading friends...</p>
          ) : filteredFriends.length === 0 ? (
            <p className="chat-empty">No friends found.</p>
          ) : (
            filteredFriends.map(friend => (
              <div key={friend.id} className="chat-thread-item" onClick={() => setSelectedFriend(friend)}>
                <div className="chat-avatar">👤</div>
                <div className="chat-thread-main">
                  <div className="chat-thread-name">{friend.display_name || friend.username}</div>
                  <div className="chat-thread-preview">Tap to chat</div>
                </div>
                <div className="chat-thread-meta">
                  <span className="chat-thread-username">@{friend.username}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── InstallAppSection ─────────────────────────────────────────
function InstallAppSection() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installDone,   setInstallDone]   = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Detect iOS/iPadOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(ios);

    // Detect already installed (standalone mode)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    setIsStandalone(standalone);

    // Listen for Chrome/Android install prompt
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log('[PWA] install outcome:', outcome);
    if (outcome === 'accepted') {
      setInstallDone(true);
      setInstallPrompt(null);
    }
  };

  const cardStyle = {
    background: 'rgba(223,1,57,0.07)',
    border: '1px solid rgba(223,1,57,0.25)',
    borderRadius: '14px',
    padding: '1.1rem 1.2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.7rem',
  };

  const stepStyle = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.6rem',
    fontSize: '0.88rem',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
  };

  const numStyle = {
    background: 'rgba(223,1,57,0.2)',
    color: '#ff6b8a',
    borderRadius: '50%',
    width: 22, height: 22,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, marginTop: 1,
  };

  if (isStandalone) {
    return (
      <div className="dash-section">
        <h2 className="dash-section-title">📲 Install Spidey App</h2>
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#4ade80' }}>
            ✅ Spidey is already installed as an app on this device!
          </p>
        </div>
      </div>
    );
  }

  if (installDone) {
    return (
      <div className="dash-section">
        <h2 className="dash-section-title">📲 Install Spidey App</h2>
        <div style={cardStyle}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#4ade80' }}>
            ✅ Spidey installed! Open it from your Home Screen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-section">
      <h2 className="dash-section-title">📲 Install Spidey App</h2>
      <div style={cardStyle}>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          Install Spidey on your device for a full-screen app experience — no browser bar.
        </p>

        {/* Android Chrome: show one-tap install button */}
        {installPrompt && (
          <button
            id="pwa-install-btn"
            onClick={handleInstall}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px',
              background: 'linear-gradient(135deg, #df0139, #8b0000)',
              border: 'none', borderRadius: '50px',
              color: '#fff', fontWeight: 700, fontSize: '0.9rem',
              cursor: 'pointer', width: 'fit-content',
              boxShadow: '0 4px 16px rgba(223,1,57,0.35)',
              transition: 'all 0.2s',
            }}
          >
            📲 Install Spidey App
          </button>
        )}

        {/* Android Chrome (no prompt yet) */}
        {!installPrompt && !isIOS && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              🤖 Android — Chrome
            </p>
            <div style={stepStyle}><span style={numStyle}>1</span> Open Spidey in <strong>Chrome</strong></div>
            <div style={stepStyle}><span style={numStyle}>2</span> Tap the <strong>⋮ menu</strong> (top right)</div>
            <div style={stepStyle}><span style={numStyle}>3</span> Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong></div>
            <div style={stepStyle}><span style={numStyle}>4</span> Tap <strong>Install</strong> to confirm</div>
          </div>
        )}

        {/* iPhone / iPad */}
        {isIOS && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              🍎 iPhone / iPad — Safari
            </p>
            <div style={stepStyle}><span style={numStyle}>1</span> Open Spidey in <strong>Safari</strong> (not Chrome)</div>
            <div style={stepStyle}><span style={numStyle}>2</span> Tap the <strong>Share ↑</strong> button at the bottom</div>
            <div style={stepStyle}><span style={numStyle}>3</span> Scroll down and tap <strong>"Add to Home Screen"</strong></div>
            <div style={stepStyle}><span style={numStyle}>4</span> Tap <strong>Add</strong> in the top right</div>
            <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Works on iPhone 14, 15, 16, 17 and all iPads with iOS/iPadOS 16.4+
            </p>
          </div>
        )}

        {/* Show both when not on iOS and no prompt */}
        {!installPrompt && !isIOS && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.5rem' }}>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              🍎 iPhone / iPad — Safari
            </p>
            <div style={stepStyle}><span style={numStyle}>1</span> Open Spidey in <strong>Safari</strong></div>
            <div style={stepStyle}><span style={numStyle}>2</span> Tap the <strong>Share ↑</strong> button</div>
            <div style={stepStyle}><span style={numStyle}>3</span> Tap <strong>"Add to Home Screen"</strong></div>
            <div style={stepStyle}><span style={numStyle}>4</span> Tap <strong>Add</strong></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── SettingsTab (was ProfileTab) ─────────────────────────────
function SettingsTab({ totalSongs, favCount, myUploadsCount, privateKey, myPublicKey }) {
  const { user, logout } = useAuth();
  const { themes, currentThemeId, changeTheme } = useTheme();
  const joinDate = user?.createdAt ? formatDate(user.createdAt, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="tab-pane active" aria-labelledby="tab-settings">
      <div className="dashboard-welcome user-theme" style={{ marginBottom: '1rem' }}>
        <h1 className="welcome-title">{user?.username || user?.email}</h1>
        <p className="welcome-sub">Manage your profile and settings.</p>
      </div>
      
      <div className="dash-stats" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="dash-stat-card">
          <div className="dash-stat-value">{favCount}</div>
          <div className="dash-stat-label">Favorites</div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-value dash-stat-value--blue">{myUploadsCount}</div>
          <div className="dash-stat-label">Uploads</div>
        </div>
      </div>
      
      <div className="dash-section">
        <h2 className="dash-section-title">🎨 Appearance</h2>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {themes.map(t => (
            <div 
              key={t.id} 
              onClick={() => changeTheme(t.id)}
              style={{
                background: t.bg_card,
                border: `2px solid ${currentThemeId === t.id ? t.primary_color : t.border_secondary}`,
                borderRadius: '8px',
                padding: '1rem',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.2s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div style={{ width: 24, height: 24, background: t.primary_color, borderRadius: '50%' }}></div>
                <div style={{ width: 24, height: 24, background: t.secondary_color, borderRadius: '50%' }}></div>
              </div>
              <p style={{ color: t.text_primary, fontWeight: currentThemeId === t.id ? 'bold' : 'normal', margin: 0 }}>{t.name}</p>
            </div>
          ))}
          {themes.length === 0 && <p className="text-muted">No themes available.</p>}
        </div>
      </div>

      <div className="dash-section">
        <h2 className="dash-section-title">🔒 Security Verification</h2>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Messages and calls are end-to-end encrypted. Generate a safety number with a friend to verify.</p>
          <button className="btn-accept" onClick={async () => {
            const username = window.prompt("Enter friend's username to verify:");
            if (!username) return;
            const { data } = await supabase.from('profiles').select('id, username').eq('username', username).maybeSingle();
            if (!data) return alert('User not found.');
            const { data: keyData } = await supabase.from('user_keys').select('public_key').eq('user_id', data.id).maybeSingle();
            if (!keyData || !keyData.public_key) return alert('Security code unavailable for this user.');
            const sn = await generateSafetyNumber(myPublicKey, keyData.public_key);
            alert(`Safety Number with ${data.username}:\n\n${sn}\n\nCompare this code with your friend to verify.`);
          }} style={{ width: 'fit-content' }}>Verify Friend</button>
        </div>
      </div>

      {/* ── Install Spidey App ────────────────────────────────── */}
      <InstallAppSection />

      <div className="dash-section">
        <h2 className="dash-section-title">⚙️ Account</h2>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <p>Email: {user?.email}</p>
          <p>Member Since: {joinDate}</p>
          <button className="logout-btn" onClick={logout} style={{ width: 'fit-content' }}>🚪 Logout</button>
        </div>
      </div>
    </div>
  );
}


// ── TodoTab is imported from src/components/TodoTab.jsx

// ─────────────────────────────────────────────
//  UserHome (root)
// ─────────────────────────────────────────────

export default function UserHome() {
  const { user } = useAuth();
  
  const [privateKey, setPrivateKey] = useState(null);
  const [myPublicKey, setMyPublicKey] = useState(null);

  useEffect(() => {
    if (!user?.id) return;
    const initCrypto = async () => {
      try {
        let pubKey = null;
        let key = await getPrivateKey();
        if (!key) {
          const keyPair = await generateKeyPair();
          await savePrivateKey(keyPair.privateKey);
          key = keyPair.privateKey;
          
          const exportedPubKey = await exportPublicKey(keyPair.publicKey);
          await supabase.from('user_keys').upsert({
            user_id: user.id,
            public_key: exportedPubKey
          });
          pubKey = exportedPubKey;
        } else {
          const { data } = await supabase.from('user_keys').select('public_key').eq('user_id', user.id).maybeSingle();
          if (data) pubKey = data.public_key;
        }
        setPrivateKey(key);
        setMyPublicKey(pubKey);
      } catch (err) {
        console.error('[Crypto] Error initializing keys:', err);
      }
    };
    initCrypto();
  }, [user?.id]);

  const [activeTab,   setActiveTab]   = useState('home');
  const [adminSongs,  setAdminSongs]  = useState([]);
  const [mySongs,     setMySongs]     = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [deletingId,  setDeletingId]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [showSearch,  setShowSearch]  = useState(false);

  // ─── Global Call State ───────────────────────────────────────
  const [incomingCall, setIncomingCall]   = useState(null);   // incoming ring data
  const [activeCall,   setActiveCall]     = useState(null);   // active call data
  const [callStatus,   setCallStatus]     = useState('idle'); // idle|ringing|connecting|connected|ended
  const [localStream,  setLocalStream]    = useState(null);
  const [remoteStream, setRemoteStream]   = useState(null);

  const peerConnectionRef  = useRef(null);
  const localStreamRef     = useRef(null);
  const remoteStreamRef    = useRef(null);  // accumulates remote tracks
  const localVideoRef      = useRef(null);
  const remoteVideoRef     = useRef(null);
  const remoteAudioRef     = useRef(null);  // hidden audio for voice-call only
  const callRoleRef        = useRef(null);  // 'caller' | 'receiver'
  const activeCallRef      = useRef(null);  // mirror of activeCall for use inside event handlers
  const pendingCandidates  = useRef([]);    // ICE candidates queued before remote desc is set
  const ringTimeoutRef     = useRef(null);  // auto-cancel ring after 30 s

  // Sync local video srcObject
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, activeCall]);

  // Sync remote video srcObject (video call)
  useEffect(() => {
    if (!remoteStream) return;
    console.log('[Call] remoteStream updated, tracks:',
      remoteStream.getTracks().map(t => `${t.kind}:${t.readyState}`));
    console.log('[Call] video tracks:', remoteStream.getVideoTracks().length,
      'audio tracks:', remoteStream.getAudioTracks().length);

    // Always attach to video element (works for both voice+video)
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch(e => console.warn('[Call] remote video play:', e));
    }
    // Voice call: also pipe into dedicated audio element
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(e => console.warn('[Call] remote audio play:', e));
    }
  }, [remoteStream]);

  // Re-attach srcObject whenever the video DOM node appears (after remount)
  const attachRemoteVideoRef = useCallback((node) => {
    remoteVideoRef.current = node;
    if (node && remoteStreamRef.current) {
      node.srcObject = remoteStreamRef.current;
      node.play().catch(e => console.warn('[Call] remote video attach play:', e));
    }
  }, []);

  const attachLocalVideoRef = useCallback((node) => {
    localVideoRef.current = node;
    if (node && localStreamRef.current) {
      node.srcObject = localStreamRef.current;
    }
  }, []);

  // ── sendCallSignal ────────────────────────────────────────────
  // Broadcasts an event to the target user's personal channel.
  // Each user listens on calls:{user.id}; we publish to that channel.
  const sendCallSignal = useCallback((targetId, eventName, payload) => {
    console.log('[Call] sendCallSignal →', targetId, eventName);
    // Subscribe to the target's channel so we can broadcast into it
    const ch = supabase.channel(`calls:${targetId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: eventName, payload })
          .then(() => setTimeout(() => supabase.removeChannel(ch), 2000))
          .catch(err => console.error('[Call] sendCallSignal error:', err));
      }
    });
  }, []);

  // Stable ref so event handlers inside the minimal-dep useEffect always get latest fn
  const sendCallSignalRef = useRef(sendCallSignal);
  useEffect(() => { sendCallSignalRef.current = sendCallSignal; }, [sendCallSignal]);

  // Fully tears down media + PeerConnection
  const cleanupCall = useCallback(() => {
    console.log('[Call] cleanupCall()');
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach(t => t.stop());
      remoteStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack        = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    remoteStreamRef.current   = null;
    pendingCandidates.current = [];
    callRoleRef.current       = null;
    activeCallRef.current     = null;
    setLocalStream(null);
    setRemoteStream(null);
    setCallStatus('idle');
  }, []);

  const cleanupCallRef = useRef(cleanupCall);
  useEffect(() => { cleanupCallRef.current = cleanupCall; }, [cleanupCall]);

  // Acquire local media (audio only for voice, audio+video for video)
  const requestMedia = useCallback(async (callType) => {
    try {
      const constraints = { audio: true, video: callType === 'video' };
      console.log('[Call] requestMedia constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[WebRTC] getUserMedia success');
      localStreamRef.current = stream;
      setLocalStream(stream);
      console.log('[Call] got local stream, tracks count:', stream.getTracks().length);
      return stream;
    } catch (err) {
      console.error('[WebRTC] getUserMedia failure:', err);
      if (err.name === 'NotAllowedError') {
        alert('Please allow microphone/camera permission');
      } else if (err.name === 'NotFoundError') {
        alert('No camera/microphone found');
      } else {
        alert('Could not access microphone/camera.');
      }
      return null;
    }
  }, []);

  const requestMediaRef = useRef(requestMedia);
  useEffect(() => { requestMediaRef.current = requestMedia; }, [requestMedia]);

  // Create/return RTCPeerConnection wired to signal the given peer
  const createPeerConnection = useCallback((targetUserId) => {
    console.log('[Call] createPeerConnection → target:', targetUserId);
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
        // Add TURN server here for production if needed
      ],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] sending ICE candidate');
        sendCallSignalRef.current(targetUserId, 'webrtc-ice-candidate', { candidate: event.candidate, senderId: user.id });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] remote track received', event.track.kind);

      const remoteStream = remoteStreamRef.current || new MediaStream();
      
      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((track) => {
          remoteStream.addTrack(track);
        });
      } else {
        remoteStream.addTrack(event.track);
      }

      remoteStreamRef.current = remoteStream;
      setRemoteStream(new MediaStream(remoteStream.getTracks()));

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
        remoteVideoRef.current.play().catch(console.warn);
      }

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(console.warn);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] connectionState:', pc.connectionState);

      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
        setActiveCall(prev => prev ? { ...prev, status: 'connected' } : prev);
      }

      if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected' ||
        pc.connectionState === 'closed'
      ) {
        console.warn('[WebRTC] connection lost:', pc.connectionState);
        setTimeout(() => {
          if (peerConnectionRef.current?.connectionState !== 'connected') {
            setActiveCall(null);
            setIncomingCall(null);
            cleanupCallRef.current();
          }
        }, 3000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] iceConnectionState:', pc.iceConnectionState);

      if (
        pc.iceConnectionState === 'connected' ||
        pc.iceConnectionState === 'completed'
      ) {
        setCallStatus('connected');
        setActiveCall(prev => prev ? { ...prev, status: 'connected' } : prev);
      }

      if (pc.iceConnectionState === 'failed') {
        console.error('Call connection failed. TURN server may be required.');
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  }, [user?.id]);

  const createPeerConnectionRef = useRef(createPeerConnection);
  useEffect(() => { createPeerConnectionRef.current = createPeerConnection; }, [createPeerConnection]);

  // ── Incoming-call listener effect ─────────────────────────────
  // Minimal deps: uses stable refs for all volatile state/fn access.
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase.channel(`calls:${user.id}`, {
      config: { broadcast: { self: false } },
    });

    // ── A) Incoming ring ─────────────────────────────────────────
    channel.on('broadcast', { event: 'call-offer' }, async ({ payload }) => {
      console.log('[Call] received call-offer from', payload.callerId);
      const { data: isFriend } = await supabase
        .from('friends')
        .select('id')
        .eq('user_id', user.id)
        .eq('friend_id', payload.callerId)
        .maybeSingle();

      if (!isFriend) { console.warn('[Call] rejected call from non-friend'); return; }
      if (activeCallRef.current) { console.log('[Call] busy — auto-rejecting'); return; }

      setIncomingCall({ ...payload, status: 'ringing' });
      setCallStatus('ringing');

      ringTimeoutRef.current = setTimeout(() => {
        console.log('[Call] ring timeout — clearing incoming');
        setIncomingCall(null);
        setCallStatus('idle');
      }, 30_000);
    });

    // ── B) Caller receives: receiver accepted ─────────────────────
    channel.on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
      console.log('[Call] received call-answer, my role:', callRoleRef.current);
      if (callRoleRef.current !== 'caller') {
        console.log('[Call] ignoring call-answer (not caller)');
        return;
      }

      setCallStatus('connecting');
      setActiveCall(prev => prev ? { ...prev, status: 'connecting' } : prev);

      const callType = activeCallRef.current?.callType || payload.callType;
      const stream   = await requestMediaRef.current(callType);
      if (!stream) {
        alert('Could not access microphone/camera. Call failed.');
        sendCallSignalRef.current(payload.callerId, 'call-ended', {});
        setActiveCall(null); setCallStatus('idle'); cleanupCallRef.current();
        return;
      }

      const receiverId = payload.callerId;
      const pc = createPeerConnectionRef.current(receiverId);
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[Call] caller sending webrtc-offer to', receiverId);
      sendCallSignalRef.current(receiverId, 'webrtc-offer', { sdp: offer, senderId: user.id, callType });
    });

    // ── C) Receiver gets the WebRTC offer ────────────────────────
    channel.on('broadcast', { event: 'webrtc-offer' }, async ({ payload }) => {
      console.log('[Call] received webrtc-offer, my role:', callRoleRef.current);
      if (callRoleRef.current !== 'receiver') {
        console.log('[Call] ignoring webrtc-offer (not receiver)');
        return;
      }

      if (!localStreamRef.current) {
        const callType = activeCallRef.current?.callType || 'voice';
        const stream = await requestMediaRef.current(callType);
        if (!stream) {
          alert('Could not access microphone/camera.');
          sendCallSignalRef.current(payload.senderId, 'call-ended', {});
          setActiveCall(null); setCallStatus('idle'); cleanupCallRef.current();
          return;
        }
      }

      const pc = createPeerConnectionRef.current(payload.senderId);
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));

      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));

      for (const c of pendingCandidates.current) {
        try { await pc.addIceCandidate(c); } catch {}
      }
      pendingCandidates.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('[Call] receiver sending webrtc-answer to', payload.senderId);
      sendCallSignalRef.current(payload.senderId, 'webrtc-answer', { sdp: answer, senderId: user.id });
    });

    // ── D) Caller receives the answer ────────────────────────────
    channel.on('broadcast', { event: 'webrtc-answer' }, async ({ payload }) => {
      console.log('[Call] received webrtc-answer, my role:', callRoleRef.current);
      if (callRoleRef.current !== 'caller') {
        console.log('[Call] ignoring webrtc-answer (not caller)');
        return;
      }
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        for (const c of pendingCandidates.current) {
          try { await peerConnectionRef.current.addIceCandidate(c); } catch {}
        }
        pendingCandidates.current = [];
        console.log('[Call] caller set remote description — WebRTC handshake complete');
      }
    });

    // ── E) ICE candidate exchange ────────────────────────────────
    channel.on('broadcast', { event: 'webrtc-ice-candidate' }, async ({ payload }) => {
      if (!payload.candidate) return;
      const pc = peerConnectionRef.current;
      if (pc && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); }
        catch (e) { console.warn('[Call] addIceCandidate error:', e); }
      } else {
        console.log('[Call] queuing ICE candidate (no remote desc yet)');
        pendingCandidates.current.push(new RTCIceCandidate(payload.candidate));
      }
    });

    // ── F) Call ended by remote ──────────────────────────────────
    channel.on('broadcast', { event: 'call-ended' }, () => {
      console.log('[Call] received call-ended from remote');
      setIncomingCall(null); setActiveCall(null);
      cleanupCallRef.current();
    });

    // ── G) Call rejected by receiver ─────────────────────────────
    channel.on('broadcast', { event: 'call-rejected' }, () => {
      console.log('[Call] received call-rejected');
      setIncomingCall(null); setActiveCall(null);
      cleanupCallRef.current();
    });

    channel.subscribe((status) => {
      console.log('[Call] personal channel status:', status);
    });

    return () => {
      console.log('[Call] removing personal call channel');
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // intentionally minimal — handlers use refs for volatile access

  // ── startCall: caller initiates ─────────────────────────────
  const startCall = (type, targetUser) => {
    if (!targetUser) return;
    console.log('[Call] startCall type:', type, 'target:', targetUser.id);
    callRoleRef.current = 'caller';
    const callData = {
      callerId:       user.id,
      callerName:     user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
      targetUserId:   targetUser.id,
      targetUserName: targetUser.display_name || targetUser.username,
      callType:       type,
      status:         'ringing',
    };
    activeCallRef.current = callData;
    setActiveCall(callData);
    setCallStatus('ringing');
    sendCallSignal(targetUser.id, 'call-offer', callData);

    // Auto-cancel if no answer in 30 s
    ringTimeoutRef.current = setTimeout(() => {
      if (callRoleRef.current === 'caller' && callStatus !== 'connected') {
        console.log('[Call] ring timeout — no answer');
        sendCallSignal(targetUser.id, 'call-ended', {});
        setActiveCall(null);
        setCallStatus('idle');
        cleanupCall();
      }
    }, 30_000);
  };

  // ── acceptCall: receiver accepts ─────────────────────────────
  const acceptCall = async () => {
    if (!incomingCall) return;
    console.log('[Call] acceptCall — acquiring media for', incomingCall.callType);

    // Clear ring timeout
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }

    callRoleRef.current   = 'receiver';
    const callData        = { ...incomingCall, status: 'connecting' };
    activeCallRef.current = callData;

    // Clear incoming (hides ring modal) BEFORE async work
    setIncomingCall(null);
    setActiveCall(callData);   // show call screen immediately
    setCallStatus('connecting');

    // Receiver acquires media NOW (before offer arrives)
    const stream = await requestMedia(incomingCall.callType);
    if (!stream) {
      alert('Could not access microphone/camera. Rejecting call.');
      sendCallSignal(incomingCall.callerId, 'call-rejected', {});
      setActiveCall(null);
      setCallStatus('idle');
      activeCallRef.current = null;
      callRoleRef.current   = null;
      return;
    }

    // Signal caller that receiver accepted
    sendCallSignal(incomingCall.callerId, 'call-answer', {
      ...callData,
      callerId: incomingCall.callerId,   // preserve original callerId so caller identifies itself
    });

    console.log('[Call] acceptCall complete — waiting for webrtc-offer from caller');
  };

  // ── rejectCall ───────────────────────────────────────────────
  const rejectCall = () => {
    if (!incomingCall) return;
    console.log('[Call] rejectCall');
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
    sendCallSignal(incomingCall.callerId, 'call-rejected', {});
    setIncomingCall(null);
    setCallStatus('idle');
  };

  // ── endCall ──────────────────────────────────────────────────
  const endCall = () => {
    if (!activeCallRef.current && !activeCall) return;
    const call = activeCallRef.current || activeCall;
    console.log('[Call] endCall, role:', callRoleRef.current);
    const targetId = call.callerId === user.id ? call.targetUserId : call.callerId;
    sendCallSignal(targetId, 'call-ended', {});
    setActiveCall(null);
    setIncomingCall(null);
    cleanupCall();
  };

  const loadData = useCallback(async () => {
    try {
      const [songData, favResult] = await Promise.all([
        loadAllSongs(user.id),
        supabase.from('favorites').select('song_id').eq('user_id', user.id),
      ]);
      setAdminSongs(songData.adminSongs);
      setMySongs(songData.mySongs);
      setFavoriteIds(favResult.data?.map(f => f.song_id) || []);
    } catch (err) { console.error(err); } finally { setLoading(false); }
  }, [user.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFavToggle = async (songId) => {
    const isFav = favoriteIds.includes(songId);
    try {
      if (isFav) {
        await supabase.from('favorites').delete().eq('user_id', user.id).eq('song_id', songId);
        setFavoriteIds(prev => prev.filter(id => id !== songId));
      } else {
        await supabase.from('favorites').insert({ user_id: user.id, song_id: songId });
        setFavoriteIds(prev => [...prev, songId]);
      }
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (songId) => {
    setDeletingId(songId);
    try {
      const song = mySongs.find(s => s.id === songId);
      await supabase.from('songs').delete().eq('id', songId);
      if (song?.storage_path) await supabase.storage.from(BUCKET).remove([song.storage_path]);
      setMySongs(prev => prev.filter(s => s.id !== songId));
      setFavoriteIds(prev => prev.filter(id => id !== songId));
    } catch (err) { console.error(err); } finally { setDeletingId(null); }
  };

  const allSongs = [...adminSongs, ...mySongs].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  const favoriteSongs = allSongs.filter(s => favoriteIds.includes(s.id));

  const isDebug = new URLSearchParams(window.location.search).get('debug') === 'true';

  return (
    <div className="dashboard-layout user-layout-with-nav">
      {isDebug && <DebugHealthCheck selectedFriend={null} />}
      
      {/* ── Top Header with Search Toggle ── */}
      <header className="dashboard-topbar" role="banner">
        <div className="topbar-logo" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          SPIDEY
        </div>
        <div className="topbar-right">
          <button
            id="topbar-search-btn"
            className="topbar-icon-btn"
            onClick={() => setShowSearch(!showSearch)}
            aria-label="Toggle search"
          >
            🔍
          </button>
          <button
            id="topbar-settings-btn"
            className={`topbar-icon-btn topbar-settings-btn${activeTab === 'settings' ? ' active' : ''}`}
            onClick={() => setActiveTab(prev => prev === 'settings' ? 'home' : 'settings')}
            aria-label="Settings"
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      {showSearch && (
        <div className="global-search-container">
          <SearchBar id="global-search" value={search} onChange={setSearch} placeholder="Search songs..." />
        </div>
      )}

      {/* ── Main Scrolling Content ── */}
      <main className="dashboard-body" id="user-main" role="main">
        {activeTab === 'home'     && <HomeTab allSongs={allSongs} search={search} favoriteIds={favoriteIds} onFavToggle={handleFavToggle} />}
        {activeTab === 'connect'  && <ConnectTab />}
        {activeTab === 'library'  && <LibraryTab favorites={favoriteSongs} mySongs={mySongs} search={search} favoriteIds={favoriteIds} onFavToggle={handleFavToggle} onUploaded={s => setMySongs(p => [s,...p])} onDelete={handleDelete} deletingId={deletingId} />}
        {activeTab === 'chat'     && <ChatTab startCall={startCall} privateKey={privateKey} myPublicKey={myPublicKey} />}
        {activeTab === 'todo'     && <TodoTab />}
        {activeTab === 'settings' && <SettingsTab totalSongs={allSongs.length} favCount={favoriteIds.length} myUploadsCount={mySongs.length} privateKey={privateKey} myPublicKey={myPublicKey} />}
      </main>

      {/* ── Incoming Call Ring ── */}
      {incomingCall && (
        <div className="call-overlay">
          <div className="call-modal">
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>
              {incomingCall.callType === 'video' ? '📹' : '📞'}
            </div>
            <h3>Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call</h3>
            <p style={{ marginBottom: '4px' }}>{incomingCall.callerName}</p>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '20px' }}>Ringing...</p>
            <div className="call-actions">
              <button className="btn-accept" onClick={acceptCall}>✅ Accept</button>
              <button className="btn-reject" onClick={rejectCall}>❌ Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Call Screen ──
           IMPORTANT: Video elements are always mounted when activeCall exists,
           never conditionally removed, so srcObject is never lost on re-render.
      */}
      {activeCall && (
        <div className="call-overlay active-call-overlay">
          <div className="call-modal" style={{
            width: '90%', maxWidth: '800px', height: '80vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden'
          }}>

            {/* Status header */}
            <h3 style={{ marginBottom: '6px', flexShrink: 0 }}>
              {callStatus === 'ringing'    ? '📞 Ringing...' :
               callStatus === 'connecting' ? '⏳ Connecting...' :
               callStatus === 'connected'  ? '🟢 Connected' : 'Call'}
            </h3>
            <p style={{ marginBottom: '4px', flexShrink: 0 }}>
              {activeCall.targetUserId === user.id ? activeCall.callerName : activeCall.targetUserName}
            </p>
            <p style={{ fontSize: '0.8rem', color: '#00ff88', marginBottom: '10px', flexShrink: 0 }}>
              🔒 End-to-end encrypted
            </p>

            {/* Video / Voice area */}
            <div style={{
              flex: 1, position: 'relative', background: '#111',
              borderRadius: '12px', overflow: 'hidden',
              marginBottom: '16px', minHeight: '180px'
            }}>

              {/* ── Remote video ──
                  Always rendered. Hidden via CSS for voice calls.
                  Using callback ref so srcObject survives React remounts.
              */}
              <video
                ref={attachRemoteVideoRef}
                autoPlay
                playsInline
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: activeCall.callType === 'video' ? 'block' : 'none',
                  zIndex: 1,
                }}
              />

              {/* Hidden audio element – plays remote audio for VOICE calls
                  (for video calls, audio comes through the video element above) */}
              <audio
                ref={remoteAudioRef}
                autoPlay
                playsInline
                style={{ display: 'none' }}
              />

              {/* Voice call UI */}
              {activeCall.callType === 'voice' && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 2,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  color: '#fff', gap: '12px'
                }}>
                  <div style={{ fontSize: '4rem' }}>🎙️</div>
                  <p style={{ fontSize: '1rem', opacity: 0.7 }}>
                    {callStatus === 'connected' ? 'Voice call active' : 'Connecting audio...'}
                  </p>
                  {remoteStream && callStatus === 'connected' && (
                    <p style={{ fontSize: '0.75rem', color: '#4ade80' }}>● Audio connected</p>
                  )}
                </div>
              )}

              {/* Video call: connecting placeholder (shown until remote video arrives) */}
              {activeCall.callType === 'video' && !remoteStream && (
                <div style={{
                  position: 'absolute', inset: 0, zIndex: 2,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(255,255,255,0.6)', gap: '8px'
                }}>
                  <div style={{ fontSize: '2rem' }}>📹</div>
                  <p style={{ fontSize: '0.9rem' }}>Connecting video...</p>
                </div>
              )}

              {/* Local video preview – bottom-right pip, video calls only */}
              {activeCall.callType === 'video' && (
                <video
                  ref={attachLocalVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    position: 'absolute', bottom: '12px', right: '12px',
                    width: '110px', height: '148px',
                    objectFit: 'cover', borderRadius: '8px',
                    border: '2px solid rgba(255,255,255,0.35)',
                    background: '#222', zIndex: 3,
                  }}
                />
              )}
            </div>

            <div className="call-actions" style={{ paddingBottom: '10px', flexShrink: 0 }}>
              <button className="btn-reject" onClick={endCall}>📵 End Call</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Spotify-like Bottom Nav ── */}
      <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
        <button
          id="nav-home"
          className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => setActiveTab('home')}
          aria-label="Home"
        >
          <span className="nav-icon">🏠</span><span className="nav-label">Home</span>
        </button>
        <button
          id="nav-connect"
          className={`nav-item ${activeTab === 'connect' ? 'active' : ''}`}
          onClick={() => setActiveTab('connect')}
          aria-label="Connect"
        >
          <span className="nav-icon">🤝</span><span className="nav-label">Connect</span>
        </button>
        <button
          id="nav-library"
          className={`nav-item ${activeTab === 'library' ? 'active' : ''}`}
          onClick={() => setActiveTab('library')}
          aria-label="Library"
        >
          <span className="nav-icon">📚</span><span className="nav-label">Library</span>
        </button>
        <button
          id="nav-chat"
          className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
          aria-label="Chat"
        >
          <span className="nav-icon">💬</span><span className="nav-label">Chat</span>
        </button>
        <button
          id="nav-todo"
          className={`nav-item ${activeTab === 'todo' ? 'active' : ''}`}
          onClick={() => setActiveTab('todo')}
          aria-label="Todo"
        >
          <span className="nav-icon">✅</span><span className="nav-label">Todo</span>
        </button>
      </nav>

    </div>
  );
}
