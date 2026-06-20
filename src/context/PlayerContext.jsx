/**
 * PlayerContext.jsx
 * ─────────────────────────────────────────────────────────────
 * Global music player engine.
 *
 * Audio source priority (per song):
 *   1. In-memory blob URL cache  (blobCache Map – fastest, session only)
 *   2. IndexedDB audioCache      (offline cache – survives page refresh)
 *   3. Supabase Storage signed URL (fetched on demand, then cached above)
 *
 * After a song is streamed from Supabase, its Blob is saved to IndexedDB
 * in the background so subsequent plays / offline use are instant.
 *
 * – One <audio> element lives here. Pages never create their own.
 * – Any component calls usePlayer().playSong(song, queue) to start.
 * – Exposes play/pause/next/prev/seek/volume/queue state.
 * ─────────────────────────────────────────────────────────────
 */

import {
  createContext,
  useContext,
  useReducer,
  useRef,
  useCallback,
  useEffect,
} from 'react';

import { supabase }                      from '../lib/supabaseClient';
import { getAudioCache, setAudioCache }  from '../db/spideyDB';
import { RealtimeChannel }               from '@supabase/supabase-js'; // type-only hint


const BUCKET = 'spidey';

// ── State shape ──────────────────────────────────────────────
const INITIAL = {
  queue:        [],      // ordered list of song meta objects
  currentIndex: -1,      // index inside queue (-1 = nothing loaded)
  isPlaying:    false,
  currentTime:  0,
  duration:     0,
  volume:       1,
  loading:      false,
  error:        null,
  syncState:    { roomId: null, isHost: false },
};

// ── Reducer ──────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true,  error: null, currentTime: 0, duration: 0 };
    case 'LOAD_DONE':
      return { ...state, loading: false };
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.payload, isPlaying: false };
    case 'SET_QUEUE':
      return { ...state, queue: action.payload.queue, currentIndex: action.payload.index };
    case 'SET_INDEX':
      return { ...state, currentIndex: action.payload, currentTime: 0, duration: 0 };
    case 'PLAY':
      return { ...state, isPlaying: true };
    case 'PAUSE':
      return { ...state, isPlaying: false };
    case 'TIME_UPDATE':
      return { ...state, currentTime: action.payload };
    case 'DURATION':
      return { ...state, duration: action.payload };
    case 'VOLUME':
      return { ...state, volume: action.payload };
    case 'ENDED':
      return { ...state, isPlaying: false };
    case 'SET_SYNC_STATE':
      return { ...state, syncState: action.payload };
    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────
const PlayerContext = createContext(null);

/** In-memory session cache: songId (UUID) → blobUrl string */
const blobCache = new Map();

export function PlayerProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const audioRef          = useRef(new Audio());
  const stateRef          = useRef(state);
  /** @type {React.MutableRefObject<import('@supabase/supabase-js').RealtimeChannel|null>} */
  const roomChannelRef    = useRef(null); // persistent Supabase realtime channel for current room

  // Keep stateRef in sync
  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Room channel management ───────────────────────────────────
  /**
   * Join the Supabase realtime channel for a room.
   * Host: subscribes so broadcast.send() works.
   * Guest: subscribes and listens for 'sync' events.
   * @param {string} roomId
   * @param {boolean} isHost
   * @param {function} [onSyncPayload] – guest callback for incoming sync events
   */
  const joinRoomChannel = useCallback((roomId, isHost, onSyncPayload) => {
    // Leave any existing channel first
    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current);
      roomChannelRef.current = null;
    }

    const ch = supabase.channel(`room_${roomId}`, {
      config: { broadcast: { self: false } },
    });

    if (!isHost && typeof onSyncPayload === 'function') {
      ch.on('broadcast', { event: 'sync' }, ({ payload }) => {
        onSyncPayload(payload);
      });
    }

    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Spidey] Room channel subscribed: room_${roomId} (${isHost ? 'host' : 'guest'})`);
      }
    });

    roomChannelRef.current = ch;
    dispatch({ type: 'SET_SYNC_STATE', payload: { roomId, isHost } });
  }, []);

  /**
   * Unsubscribe from the current room channel and clear sync state.
   */
  const leaveRoomChannel = useCallback(() => {
    if (roomChannelRef.current) {
      supabase.removeChannel(roomChannelRef.current);
      roomChannelRef.current = null;
    }
    dispatch({ type: 'SET_SYNC_STATE', payload: { roomId: null, isHost: false } });
  }, []);

  // ── Sync Broadcast helper (host only) ────────────────────────
  const broadcastSyncEvent = useCallback(async (eventType, payloadOverrides = {}) => {
    const { syncState, currentTime, isPlaying, queue, currentIndex } = stateRef.current;
    if (!syncState.roomId || !syncState.isHost) return;

    const currentSong = payloadOverrides.song || (currentIndex >= 0 ? queue[currentIndex] : null);
    if (!currentSong && eventType !== 'stop') return;

    const isPlay = eventType === 'play' || eventType === 'song-change' || eventType === 'next' || eventType === 'previous';
    const isStop = eventType === 'stop';

    const payload = {
      event: eventType,
      roomId: syncState.roomId,
      song: currentSong,
      current_position: payloadOverrides.current_position ?? currentTime,
      is_playing: isStop || eventType === 'pause' ? false : (isPlaying || isPlay),
      timestamp: Date.now(),
      ...payloadOverrides,
    };

    // 1. Broadcast via the persistent subscribed channel
    if (roomChannelRef.current) {
      roomChannelRef.current.send({
        type: 'broadcast',
        event: 'sync',
        payload,
      }).catch((e) => console.warn('[Spidey] broadcast error:', e));
    }

    // 2. Persist state to DB for late joiners
    if (isStop) {
      await supabase.from('listening_rooms').update({
        current_position: 0,
        is_playing: false,
        updated_at: new Date().toISOString(),
      }).eq('id', syncState.roomId);
    } else if (currentSong) {
      await supabase.from('listening_rooms').update({
        current_song_id: currentSong.id,
        current_position: payload.current_position,
        is_playing: payload.is_playing,
        updated_at: new Date().toISOString(),
      }).eq('id', syncState.roomId);
    }
  }, []);

  // ── Wire up audio element listeners once ─────────
  useEffect(() => {
    const audio = audioRef.current;

    const onPlay       = () => dispatch({ type: 'PLAY' });
    const onPause      = () => dispatch({ type: 'PAUSE' });
    const onEnded      = () => {
      dispatch({ type: 'ENDED' });
      const { queue, currentIndex, syncState } = stateRef.current;
      if (currentIndex < queue.length - 1) {
        if (!syncState.roomId || syncState.isHost) {
          loadAndPlay(queue, currentIndex + 1);
        }
      } else {
        if (syncState.isHost) {
          broadcastSyncEvent('stop');
        }
      }
    };
    const onTimeUpdate = () => dispatch({ type: 'TIME_UPDATE', payload: audio.currentTime });
    const onDuration   = () => dispatch({ type: 'DURATION',    payload: audio.duration });
    const onError      = () => dispatch({ type: 'LOAD_ERROR',  payload: 'Failed to load audio.' });

    audio.addEventListener('play',           onPlay);
    audio.addEventListener('pause',          onPause);
    audio.addEventListener('ended',          onEnded);
    audio.addEventListener('timeupdate',     onTimeUpdate);
    audio.addEventListener('loadedmetadata', onDuration);
    audio.addEventListener('error',          onError);

    return () => {
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
      audio.removeEventListener('ended',          onEnded);
      audio.removeEventListener('timeupdate',     onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onDuration);
      audio.removeEventListener('error',          onError);
    };
  }, [broadcastSyncEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core: resolve audio source and play ──────────
  const loadAndPlay = useCallback(async (queue, index) => {
    const song = queue[index];
    if (!song) return;

    dispatch({ type: 'SET_QUEUE',  payload: { queue, index } });
    dispatch({ type: 'LOAD_START' });

    const audio = audioRef.current;
    audio.pause();

    try {
      // ── 1. In-memory blob URL (session cache) ──
      let url = blobCache.get(song.id);

      if (!url) {
        // ── 2. IndexedDB offline cache ─────────────
        const cached = await getAudioCache(song.id);
        if (cached?.fileBlob) {
          url = URL.createObjectURL(cached.fileBlob);
          blobCache.set(song.id, url);
        }
      }

      if (url) {
        // Serve from cache ──────────────────────────
        audio.src    = url;
        audio.volume = stateRef.current.volume;
        dispatch({ type: 'LOAD_DONE' });
        await audio.play();
        if (stateRef.current.syncState.isHost) {
          broadcastSyncEvent('song-change', { song, current_position: 0 });
        }
        return;
      }

      // ── 3. Playable URL or Fetch signed URL from Supabase Storage ─
      let finalUrl = song.playable_url;

      if (!finalUrl) {
        const storagePath = song.storage_path || song.file_path;
        if (!storagePath) {
          throw new Error('No audio source available for this song.');
        }

        const bucket = song.bucket_id || 'spidey';
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUrl(storagePath, 3600); // 1-hour expiry

        if (error) throw new Error(`Storage error: ${error.message}`);
        finalUrl = data.signedUrl;
      }

      // Start playing immediately via signed URL
      audio.src    = finalUrl;
      audio.volume = stateRef.current.volume;
      dispatch({ type: 'LOAD_DONE' });
      await audio.play();
      if (stateRef.current.syncState.isHost) {
        broadcastSyncEvent('song-change', { song, current_position: 0 });
      }

      // ── Background: fetch blob → cache in IDB ────
      fetch(finalUrl)
        .then((r) => r.blob())
        .then((blob) => {
          setAudioCache(song.id, blob).catch(() => {});
          const blobUrl = URL.createObjectURL(blob);
          blobCache.set(song.id, blobUrl);
        })
        .catch(() => {}); // non-fatal

    } catch (err) {
      dispatch({ type: 'LOAD_ERROR', payload: err.message });
    }
  }, [broadcastSyncEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Legacy alias (kept for any external callers) ─────────────
  const setRoomSync = useCallback((roomId, isHost) => {
    dispatch({ type: 'SET_SYNC_STATE', payload: { roomId, isHost } });
  }, []);

  const syncFromHost = useCallback(async (payload) => {
    const { song, current_position, is_playing, timestamp } = payload;
    if (!song) return;

    const audio = audioRef.current;
    const latency = timestamp ? (Date.now() - timestamp) / 1000 : 0;
    const targetTime = current_position + latency;

    const currentSongId = stateRef.current.queue[stateRef.current.currentIndex]?.id;
    if (song.id !== currentSongId) {
      // Force guest into this song
      dispatch({ type: 'SET_QUEUE', payload: { queue: [song], index: 0 } });
      dispatch({ type: 'LOAD_START' });

      try {
        let url = blobCache.get(song.id);
        if (!url) {
          const cached = await getAudioCache(song.id);
          if (cached?.fileBlob) {
            url = URL.createObjectURL(cached.fileBlob);
            blobCache.set(song.id, url);
          }
        }
        
        if (!url) {
          const storagePath = song.storage_path || song.file_path;
          const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
          if (error) throw error;
          url = data.signedUrl;
        }

        audio.src = url;
        audio.currentTime = targetTime;
        audio.volume = stateRef.current.volume;
        dispatch({ type: 'LOAD_DONE' });
        dispatch({ type: 'TIME_UPDATE', payload: targetTime });

        if (is_playing) {
          await audio.play().catch(e => console.warn('Guest autoplay prevented:', e));
        } else {
          audio.pause();
        }
      } catch (err) {
        dispatch({ type: 'LOAD_ERROR', payload: err.message });
      }
    } else {
      // Already on the same song, just update position/state
      if (Math.abs(audio.currentTime - targetTime) > 0.5) {
        audio.currentTime = targetTime;
        dispatch({ type: 'TIME_UPDATE', payload: targetTime });
      }
      if (is_playing && audio.paused) {
        await audio.play().catch(e => console.warn('Guest autoplay prevented:', e));
      } else if (!is_playing && !audio.paused) {
        audio.pause();
      }
    }
  }, []);

  // ── Public API ────────────────────────────────────

  const playSong = useCallback((song, queue) => {
    const idx = queue.findIndex((s) => s.id === song.id);
    loadAndPlay(queue, idx === -1 ? 0 : idx);
  }, [loadAndPlay]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio.src) return;
    const willPlay = !state.isPlaying;
    willPlay ? audio.play() : audio.pause();
    if (stateRef.current.syncState.isHost) {
      broadcastSyncEvent(willPlay ? 'play' : 'pause');
    }
  }, [state.isPlaying, broadcastSyncEvent]);

  const nextSong = useCallback(() => {
    const { queue, currentIndex } = stateRef.current;
    if (currentIndex < queue.length - 1) loadAndPlay(queue, currentIndex + 1);
  }, [loadAndPlay]);

  const prevSong = useCallback(() => {
    const { queue, currentIndex, currentTime } = stateRef.current;
    if (currentTime > 3) { 
      audioRef.current.currentTime = 0; 
      if (stateRef.current.syncState.isHost) broadcastSyncEvent('seek', { current_position: 0 });
      return; 
    }
    if (currentIndex > 0) loadAndPlay(queue, currentIndex - 1);
  }, [loadAndPlay, broadcastSyncEvent]);

  const seek = useCallback((time) => {
    audioRef.current.currentTime = time;
    dispatch({ type: 'TIME_UPDATE', payload: time });
    if (stateRef.current.syncState.isHost) {
      broadcastSyncEvent('seek', { current_position: time });
    }
  }, [broadcastSyncEvent]);
  
  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio.src) {
      audio.pause();
      audio.currentTime = 0;
      dispatch({ type: 'PAUSE' });
      dispatch({ type: 'TIME_UPDATE', payload: 0 });
      if (stateRef.current.syncState.isHost) {
        broadcastSyncEvent('stop', { current_position: 0, is_playing: false });
      }
    }
  }, [broadcastSyncEvent]);

  const setVolume = useCallback((vol) => {
    const clamped = Math.min(1, Math.max(0, vol));
    audioRef.current.volume = clamped;
    dispatch({ type: 'VOLUME', payload: clamped });
  }, []);

  const currentSong = state.currentIndex >= 0 ? state.queue[state.currentIndex] : null;
  const hasNext     = state.currentIndex < state.queue.length - 1;
  const hasPrev     = state.currentIndex > 0;

  const value = {
    ...state,
    currentSong,
    hasNext,
    hasPrev,
    playSong,
    togglePlay,
    nextSong,
    prevSong,
    seek,
    stop,
    setVolume,
    setRoomSync,
    syncFromHost,
    joinRoomChannel,
    leaveRoomChannel,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within <PlayerProvider>');
  return ctx;
}
