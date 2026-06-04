/**
 * UserHome.jsx
 * ──────────────────────────────────────────────────────────────
 * Full user portal with Spotify-like Bottom Navigation tabs:
 *   • Home: All available songs (Admin + Mine)
 *   • Connect: Social features (Friends, Rooms)
 *   • Library: Favorites & My Songs
 *   • Create: Upload & Manage Songs
 *   • Profile: Stats & Settings
 * ──────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth }   from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { supabase }  from '../lib/supabaseClient';
import { formatDate } from '../utils/helpers';
import '../styles/dashboard.css';

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
  return {
    adminSongs: adminResult.data || [],
    mySongs:    myResult.data    || [],
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
          .in('id', uniqueIds);

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
          .in('id', senderIds);
          
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
        const { data: users, error } = await supabase
          .from('profiles')
          .select('id, username, display_name, role')
          .neq('id', user.id)
          .or(`username.ilike.%${friendSearch}%,display_name.ilike.%${friendSearch}%`)
          .limit(10);
        
        if (error) throw error;

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
      if (targetId === user.id) {
        setMessage({ text: 'Cannot send request to yourself.', type: 'error' });
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
            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap',
            }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Room Code</p>
                <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '1rem', color: 'var(--spidey-white)', letterSpacing: '0.15em' }}>
                  {activeRoom.id.slice(0, 8).toUpperCase()}
                </p>
              </div>
              <button
                id="copy-room-code-btn"
                className="song-action-btn"
                onClick={() => handleCopyCode(activeRoom.id.slice(0, 8).toUpperCase())}
                style={{ minWidth: '110px' }}
              >
                {copiedCode ? '✅ Copied!' : '📋 Copy Code'}
              </button>
            </div>

            {/* Room actions */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                id="invite-friend-room-btn"
                className="song-action-btn"
                onClick={() => {
                  handleCopyCode(activeRoom.id.slice(0, 8).toUpperCase());
                  setMessage({ text: 'Room code copied! Share it with a friend.', type: 'success' });
                  setTimeout(() => setMessage({ text: '', type: '' }), 3000);
                }}
                style={{ flex: '1 1 auto' }}
              >
                👥 Invite Friend
              </button>
              <button
                id="leave-room-btn"
                className="song-action-btn song-action-btn--danger"
                onClick={handleLeaveRoom}
                disabled={isLeavingRoom}
                style={{ flex: '1 1 auto' }}
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

function LibraryTab({ favorites, mySongs, search, favoriteIds, onFavToggle }) {
  const favFiltered = favorites.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.artist.toLowerCase().includes(search.toLowerCase()));
  const myFiltered = mySongs.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.artist.toLowerCase().includes(search.toLowerCase()));

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
        <h2 className="dash-section-title">🕷️ My Uploads</h2>
        {myFiltered.length === 0 ? <p className="text-muted">No uploads yet.</p> : (
          <div className="song-list">
            {myFiltered.map(song => <SongRow key={song.id} song={song} queue={mySongs} favoriteIds={favoriteIds} onFavToggle={onFavToggle} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateTab({ onUploaded, mySongs, search, favoriteIds, onFavToggle, onDelete, deletingId }) {
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
        // file_url intentionally omitted – bucket is private, signed URLs used at play-time
      }).select().single();
      if (insErr) { await supabase.storage.from(BUCKET).remove([filePath]); throw insErr; }

      setStatus('success'); setTitle(''); setArtist(''); setFile(null); if (fileInputRef.current) fileInputRef.current.value = '';
      onUploaded(newSong);
    } catch (err) { setErrorMsg(err.message); setStatus('error'); }
  };

  const myFiltered = mySongs.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.artist.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="tab-pane active" aria-labelledby="tab-create">
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
        <h2 className="dash-section-title">⚙️ Manage My Songs</h2>
        {myFiltered.length === 0 ? <p className="text-muted">No uploads to manage.</p> : (
          <div className="song-list">
            {myFiltered.map(song => (
              <SongRow key={song.id} song={song} queue={mySongs} favoriteIds={favoriteIds} onFavToggle={onFavToggle} onDelete={onDelete} isDeleting={deletingId === song.id} showDelete={true} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProfileTab({ totalSongs, favCount, myUploadsCount }) {
  const { user, logout } = useAuth();
  const joinDate = user?.createdAt ? formatDate(user.createdAt, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

  return (
    <div className="tab-pane active" aria-labelledby="tab-profile">
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
        <h2 className="dash-section-title">⚙️ Settings</h2>
        <div style={{ display: 'grid', gap: '1rem' }}>
          <p>Email: {user?.email}</p>
          <p>Member Since: {joinDate}</p>
          <button className="logout-btn" onClick={logout} style={{ width: 'fit-content' }}>🚪 Logout</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  UserHome (root)
// ─────────────────────────────────────────────

export default function UserHome() {
  const { user } = useAuth();

  const [activeTab,   setActiveTab]   = useState('home');
  const [adminSongs,  setAdminSongs]  = useState([]);
  const [mySongs,     setMySongs]     = useState([]);
  const [favoriteIds, setFavoriteIds] = useState([]);
  const [deletingId,  setDeletingId]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [showSearch,  setShowSearch]  = useState(false);

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

  return (
    <div className="dashboard-layout user-layout-with-nav">
      
      {/* ── Top Header with Search Toggle ── */}
      <header className="dashboard-topbar" role="banner">
        <div className="topbar-logo">SPIDEY</div>
        <div className="topbar-right">
          <button className="topbar-icon-btn" onClick={() => setShowSearch(!showSearch)}>
            🔍
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
        {activeTab === 'home'    && <HomeTab allSongs={allSongs} search={search} favoriteIds={favoriteIds} onFavToggle={handleFavToggle} />}
        {activeTab === 'connect' && <ConnectTab />}
        {activeTab === 'library' && <LibraryTab favorites={favoriteSongs} mySongs={mySongs} search={search} favoriteIds={favoriteIds} onFavToggle={handleFavToggle} />}
        {activeTab === 'create'  && <CreateTab onUploaded={s => setMySongs(p => [s,...p])} mySongs={mySongs} search={search} favoriteIds={favoriteIds} onFavToggle={handleFavToggle} onDelete={handleDelete} deletingId={deletingId} />}
        {activeTab === 'profile' && <ProfileTab totalSongs={allSongs.length} favCount={favoriteIds.length} myUploadsCount={mySongs.length} />}
      </main>

      {/* ── Spotify-like Bottom Nav ── */}
      <nav className="bottom-nav">
        <button className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <span className="nav-icon">🏠</span><span className="nav-label">Home</span>
        </button>
        <button className={`nav-item ${activeTab === 'connect' ? 'active' : ''}`} onClick={() => setActiveTab('connect')}>
          <span className="nav-icon">🤝</span><span className="nav-label">Connect</span>
        </button>
        <button className={`nav-item ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>
          <span className="nav-icon">📚</span><span className="nav-label">Library</span>
        </button>
        <button className={`nav-item ${activeTab === 'create' ? 'active' : ''}`} onClick={() => setActiveTab('create')}>
          <span className="nav-icon">➕</span><span className="nav-label">Create</span>
        </button>
        <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
          <span className="nav-icon">👤</span><span className="nav-label">Profile</span>
        </button>
      </nav>

    </div>
  );
}
