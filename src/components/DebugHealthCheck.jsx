import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
  getPrivateKey,
  savePrivateKey,
  generateKeyPair,
  exportPublicKey,
  decryptMessage
} from '../utils/crypto';

// Reusable styling for the panel
const panelStyle = {
  position: 'absolute',
  top: 0,
  right: 0,
  width: '380px',
  height: '100vh',
  backgroundColor: '#1e1e2e',
  color: '#cdd6f4',
  zIndex: 999999,
  overflowY: 'auto',
  padding: '16px',
  boxShadow: '-4px 0 15px rgba(0,0,0,0.5)',
  fontFamily: 'monospace',
  fontSize: '12px',
  borderLeft: '1px solid #45475a',
  boxSizing: 'border-box'
};

const sectionStyle = {
  marginBottom: '16px',
  borderBottom: '1px solid #45475a',
  paddingBottom: '8px'
};

const btnStyle = {
  backgroundColor: '#89b4fa',
  color: '#11111b',
  border: 'none',
  padding: '6px 10px',
  borderRadius: '4px',
  cursor: 'pointer',
  marginTop: '6px',
  display: 'block',
  width: '100%',
  fontWeight: 'bold',
  fontFamily: 'inherit'
};

export default function DebugHealthCheck({ selectedFriend = null }) {
  const { user } = useAuth();
  const [results, setResults] = useState({});
  const [debugFriends, setDebugFriends] = useState([]);
  const [debugSelectedFriendId, setDebugSelectedFriendId] = useState('');

  // Load friends list for the debug friend picker
  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      const { data: friendRows } = await supabase.from('friends').select('friend_id').eq('user_id', user.id);
      if (friendRows?.length) {
        const ids = friendRows.map(f => f.friend_id);
        const { data: profiles } = await supabase.from('profiles').select('id, username, display_name').in('id', ids);
        setDebugFriends(profiles || []);
      }
    };
    load();
  }, [user?.id]);

  // Active friend = prop (from ChatTab) or manually selected in debug panel
  const activeFriend = selectedFriend || debugFriends.find(f => f.id === debugSelectedFriendId) || null;

  const logResult = (module, key, result, error = null) => {
    console.log(`[HealthCheck][${module}] ${key}:`, result, error ? error : '');
    setResults(prev => ({
      ...prev,
      [module]: {
        ...prev[module],
        [key]: { result, error }
      }
    }));
  };

  const getRLSError = (err, table, op) => {
    if (!err) return null;
    return `[${table} - ${op}] ${err.code}: ${err.message}. Likely cause: RLS / missing row / missing realtime / storage access`;
  };

  const checkCache = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations();
      const cachesList = await caches?.keys();
      logResult('Cache', 'Status', 'PASS', {
        url: window.location.href,
        swActive: regs && regs.length > 0,
        caches: cachesList
      });
    } catch (err) {
      logResult('Cache', 'Status', 'FAIL', err.message);
    }
  };

  const clearCacheAndReload = async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations();
      if (regs) {
        for (let reg of regs) {
          await reg.unregister();
        }
      }
      const cachesList = await caches?.keys();
      if (cachesList) {
        for (let key of cachesList) {
          await caches.delete(key);
        }
      }
      window.location.reload();
    } catch (err) {
      console.error('[HealthCheck][Cache] Error clearing cache', err);
    }
  };

  const checkAuth = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      logResult('Auth', 'Status', 'FAIL', error?.message || 'No user');
    } else {
      logResult('Auth', 'Status', 'PASS', `ID: ${data.user.id}, Email: ${data.user.email}`);
    }
  };

  const checkProfile = async () => {
    if (!user?.id) {
      logResult('Profile', 'Status', 'FAIL', 'No auth user id');
      return;
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error || !data) {
      logResult('Profile', 'Status', 'FAIL', getRLSError(error, 'profiles', 'select') || 'Missing profile');
    } else {
      logResult('Profile', 'Status', 'PASS', `Username: ${data.username}, Name: ${data.display_name}, Role: ${data.role}`);
      if (!data.role) {
        logResult('Profile', 'Role', 'WARNING', 'Role missing');
      }
      if (data.role === 'admin') {
        logResult('Auth', 'Admin Access', 'PASS', 'User is admin');
      } else {
        logResult('Auth', 'Admin Access', 'WARNING', 'User is not admin');
      }
    }
  };

  const checkSongs = async () => {
    const { data, error } = await supabase.from('songs').select('*').limit(10);
    if (error) {
      logResult('Songs', 'Status', 'FAIL', getRLSError(error, 'songs', 'select'));
    } else {
      if (data.length === 0) {
        logResult('Songs', 'Status', 'WARNING', 'Songs not visible to this user. Check songs RLS/access filter.');
      } else {
        logResult('Songs', 'Status', 'PASS', `Count: ${data.length}, Titles: ${data.slice(0, 3).map(s => s.title).join(', ')}`);
        
        const song = data[0];
        const path = song.storage_path || song.file_path;
        
        if (path) {
          const bucket = song.bucket_id || 'spidey';
          logResult('Storage', 'bucket', 'INFO', bucket);
          logResult('Storage', 'path', 'INFO', path);
          
          const { data: signedData, error: signedError } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
          
          if (signedError || !signedData?.signedUrl) {
            logResult('Storage', 'signed url created', 'FAIL', signedError?.message || 'No URL returned');
          } else {
            logResult('Storage', 'signed url created', 'PASS', 'true');
            try {
              const res = await fetch(signedData.signedUrl, { method: 'HEAD' });
              if (res.ok) {
                logResult('Storage', 'fetch status', 'PASS', `HTTP ${res.status}`);
              } else {
                logResult('Storage', 'fetch status', 'FAIL', `HTTP ${res.status}`);
              }
            } catch(err) {
              logResult('Storage', 'fetch status', 'FAIL', err.message);
            }
          }
        } else {
          logResult('Storage', 'Status', 'FAIL', 'No file_path or storage_path found on first song');
        }
      }
    }
  };

  const checkPlaylists = async () => {
    const { count, error } = await supabase.from('playlists').select('*', { count: 'exact', head: true });
    if (error) {
      logResult('Playlist', 'Status', 'FAIL', getRLSError(error, 'playlists', 'select'));
    } else {
      logResult('Playlist', 'Status', 'PASS', `Playlists count: ${count || 0}`);
    }
  };

  const checkFavorites = async () => {
    if (!user?.id) return;
    const { count, error } = await supabase.from('favorites').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    if (error) {
      logResult('Playlist', 'Favorites', 'FAIL', getRLSError(error, 'favorites', 'select'));
    } else {
      logResult('Playlist', 'Favorites', 'PASS', `Favorites count: ${count || 0}`);
    }
  };

  const checkE2EEKeys = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('user_keys').select('public_key').eq('user_id', user.id).maybeSingle();
    let hasPriv = false;
    try {
      const priv = await getPrivateKey();
      hasPriv = !!priv;
    } catch(err) {}
    
    if (error) {
      logResult('E2EE', 'Public Key', 'FAIL', getRLSError(error, 'user_keys', 'select'));
    } else {
      logResult('E2EE', 'Public Key', data ? 'PASS' : 'FAIL', data ? 'Exists' : 'Missing row');
    }
    logResult('E2EE', 'Private Key', hasPriv ? 'PASS' : 'FAIL', hasPriv ? 'Exists locally' : 'Missing locally');
  };

  const regenerateKeys = async () => {
    if (!user?.id) return;
    try {
      await supabase.from('user_keys').delete().eq('user_id', user.id);
      
      const keyPair = await generateKeyPair();
      await savePrivateKey(keyPair.privateKey);
      
      const pubKeyJwk = await exportPublicKey(keyPair.publicKey);
      await supabase.from('user_keys').upsert({
        user_id: user.id,
        public_key: pubKeyJwk,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      
      alert('WARNING: Keys regenerated. Old messages may not decrypt.');
      checkE2EEKeys();
    } catch (err) {
      console.error('[HealthCheck][E2EE] Regenerate error', err);
      alert('Regenerate failed: ' + err.message);
    }
  };

  const checkFriendKey = async () => {
    if (!activeFriend?.id) {
      logResult('E2EE', 'Friend Key', 'WARNING', 'No friend selected');
      return;
    }
    const { data, error } = await supabase.from('user_keys').select('public_key').eq('user_id', activeFriend.id).maybeSingle();
    if (error || !data) {
      logResult('E2EE', 'Friend Key', 'FAIL', `Friend ${activeFriend.username || activeFriend.id} missing public key`);
    } else {
      logResult('E2EE', 'Friend Key', 'PASS', `Friend ${activeFriend.username || activeFriend.id} public key exists`);
    }
  };

  const checkChatDB = async () => {
    if (!user?.id) return;
    const { data, error } = await supabase.from('chat_messages')
      .select('id')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .limit(5);
    if (error) {
      logResult('Chat', 'DB Read', 'FAIL', getRLSError(error, 'chat_messages', 'select'));
    } else {
      logResult('Chat', 'DB Read', 'PASS', `Can read chat_messages. Sample count: ${data.length}`);
    }
  };

  const testChatInsert = async () => {
    if (!user?.id || !selectedFriend?.id) {
      alert('No user or selected friend');
      return;
    }
    const { data, error } = await supabase.from('chat_messages').insert({
      sender_id: user.id,
      receiver_id: selectedFriend.id,
      message: '[DEBUG TEST MESSAGE]',
      is_event: true,
      event_type: 'test_event'
    }).select();
    if (error) {
      logResult('Chat', 'Insert Test', 'FAIL', getRLSError(error, 'chat_messages', 'insert'));
    } else {
      logResult('Chat', 'Insert Test', 'PASS', `Inserted ID: ${data?.[0]?.id}`);
    }
  };

  // Fix realtime subscription — use postgres_changes not 'postgres'
  const [realtimeStatus, setRealtimeStatus] = useState('UNINITIALIZED');
  const [lastRealtimeEvent, setLastRealtimeEvent] = useState(null);
  useEffect(() => {
    const ch = supabase.channel('debug_chat_messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, payload => {
        console.log('[HealthCheck][Realtime] Chat event:', payload);
        setLastRealtimeEvent(payload.eventType);
      })
      .subscribe(status => {
        console.log('[HealthCheck][Realtime] status:', status);
        setRealtimeStatus(status);
      });
    return () => { supabase.removeChannel(ch); };
  }, []);

  const checkChatDecrypt = async () => {
    if (!user?.id || !activeFriend?.id) {
      logResult('Chat', 'Decrypt', 'WARNING', 'No friend selected — use the Debug Friend picker below');
      return;
    }
    const { data: messages } = await supabase.from('chat_messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeFriend.id}),and(sender_id.eq.${activeFriend.id},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: false })
      .limit(5);
      
    if (!messages || messages.length === 0) {
      logResult('Chat', 'Decrypt', 'WARNING', 'No recent messages to decrypt');
      return;
    }

    let privKey;
    try { privKey = await getPrivateKey(); } catch(e) {}
    if (!privKey) {
      logResult('Chat', 'Decrypt', 'FAIL', 'Missing local private key');
      return;
    }

    const { data: friendKeyData } = await supabase.from('user_keys').select('public_key').eq('user_id', activeFriend.id).maybeSingle();
    if (!friendKeyData) {
      logResult('Chat', 'Decrypt', 'FAIL', 'Missing friend public key');
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let lastError = null;

    for (const msg of messages) {
      if (msg.is_event) continue;
      try {
        await decryptMessage(msg.message, privKey, friendKeyData.public_key);
        successCount++;
      } catch (err) {
        failCount++;
        lastError = err.message || 'Decryption failed';
      }
    }

    if (failCount > 0) {
      logResult('Chat', 'Decrypt', 'FAIL', `Success: ${successCount}, Fail: ${failCount}, Error: ${lastError}`);
    } else {
      logResult('Chat', 'Decrypt', 'PASS', `Success: ${successCount}, Fail: ${failCount}`);
    }
  };

  const checkListenTogether = async () => {
    const { error } = await supabase.from('listening_rooms').select('id').limit(1);
    if (error) {
      logResult('ListenTogether', 'listening_rooms', 'FAIL', getRLSError(error, 'listening_rooms', 'select'));
    } else {
      logResult('ListenTogether', 'listening_rooms', 'PASS', 'Read successful');
    }

    const { error: err2 } = await supabase.from('room_members').select('id').limit(1);
    if (err2) {
      logResult('ListenTogether', 'room_members', 'FAIL', getRLSError(err2, 'room_members', 'select'));
    } else {
      logResult('ListenTogether', 'room_members', 'PASS', 'Read successful');
    }
  };

  const checkMedia = async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.getTracks().forEach(t => t.stop());
      logResult('WebRTC', 'Mic', 'PASS', 'Granted');
    } catch (err) {
      logResult('WebRTC', 'Mic', 'FAIL', `${err.name}: ${err.message}`);
    }
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      videoStream.getTracks().forEach(t => t.stop());
      logResult('WebRTC', 'Camera', 'PASS', 'Granted');
    } catch (err) {
      logResult('WebRTC', 'Camera', 'FAIL', `${err.name}: ${err.message}`);
    }
  };

  const [signalingStatus, setSignalingStatus] = useState('UNINITIALIZED');
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`calls:${user.id}`);
    ch.subscribe((status) => {
      setSignalingStatus(status);
    });
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  const testSignaling = () => {
    if (!activeFriend?.id) return;
    const ch = supabase.channel(`calls:${activeFriend.id}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'debug-signal', payload: { test: true } })
          .then(() => {
            logResult('WebRTC', 'Signaling Test', 'PASS', `Sent broadcast to ${activeFriend.id}`);
            setTimeout(() => supabase.removeChannel(ch), 1000);
          })
          .catch(err => {
            logResult('WebRTC', 'Signaling Test', 'FAIL', err.message);
          });
      }
    });
  };

  const checkMobileUI = () => {
    const composer = document.querySelector('.chat-input-area');
    const menuBtn = document.querySelector('.chat-more-btn');
    const bottomNav = document.querySelector('.bottom-nav');
    
    logResult('MobileUI', 'Viewport', 'INFO', `${window.innerWidth}x${window.innerHeight}`);
    logResult('MobileUI', 'Composer Exists', composer ? 'PASS' : 'FAIL');
    logResult('MobileUI', 'Menu Btn Exists', menuBtn ? 'PASS' : 'FAIL');
    
    if (composer && bottomNav) {
      const compRect = composer.getBoundingClientRect();
      const navRect = bottomNav.getBoundingClientRect();
      const overlaps = !(compRect.right < navRect.left || 
                         compRect.left > navRect.right || 
                         compRect.bottom < navRect.top || 
                         compRect.top > navRect.bottom);
      if (overlaps) {
        logResult('MobileUI', 'Overlap Warning', 'WARNING', 'Composer overlaps Bottom Nav');
      } else {
        logResult('MobileUI', 'Overlap Warning', 'PASS', 'No overlap detected');
      }
    }
  };

  const runAllChecks = () => {
    checkCache();
    checkAuth();
    checkProfile();
    checkSongs();
    checkPlaylists();
    checkFavorites();
    checkE2EEKeys();
    checkFriendKey();
    checkChatDB();
    checkChatDecrypt();
    checkListenTogether();
    checkMedia();
    checkMobileUI();
  };

  return (
    <div style={panelStyle} className="debug-health-check">
      <h2 style={{marginTop: 0, color: '#f38ba8', fontSize: '18px'}}>Spidey Health Check</h2>
      <button onClick={runAllChecks} style={{...btnStyle, backgroundColor: '#a6e3a1', color: '#11111b'}}>Run All Standard Checks</button>
      <button onClick={clearCacheAndReload} style={{...btnStyle, backgroundColor: '#f38ba8'}}>Clear App Cache & Reload</button>
      {user?.id && <button onClick={regenerateKeys} style={{...btnStyle, backgroundColor: '#fab387'}}>Regenerate My Chat Keys</button>}
      {activeFriend?.id && <button onClick={() => testChatInsert()} style={btnStyle}>Test Chat Insert ({activeFriend.username || 'Friend'})</button>}
      {activeFriend?.id && <button onClick={testSignaling} style={btnStyle}>Test WebRTC Signaling ({activeFriend.username || 'Friend'})</button>}

      {/* Debug friend picker */}
      <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#313244', borderRadius: '4px' }}>
        <label style={{ display: 'block', marginBottom: '4px', color: '#cba6f7', fontWeight: 'bold' }}>Debug Friend:</label>
        {selectedFriend ? (
          <div style={{ color: '#a6e3a1' }}>✅ {selectedFriend.display_name || selectedFriend.username} (from chat)</div>
        ) : (
          <select
            value={debugSelectedFriendId}
            onChange={e => setDebugSelectedFriendId(e.target.value)}
            style={{ width: '100%', padding: '4px', backgroundColor: '#1e1e2e', color: '#cdd6f4', border: '1px solid #45475a', borderRadius: '4px' }}
          >
            <option value=''>-- Select friend --</option>
            {debugFriends.map(f => (
              <option key={f.id} value={f.id}>{f.display_name || f.username} (@{f.username})</option>
            ))}
          </select>
        )}
        {activeFriend && <div style={{ color: '#f9e2af', marginTop: '4px', fontSize: '11px' }}>Active: {activeFriend.username} ({activeFriend.id})</div>}
      </div>

      <div style={{ marginTop: '16px', padding: '8px', backgroundColor: '#313244', borderRadius: '4px' }}>
        <p style={{ margin: '4px 0' }}><strong>Chat Realtime:</strong> {realtimeStatus}</p>
        {lastRealtimeEvent && <p style={{ margin: '4px 0', color: '#f9e2af' }}>Last Event: {lastRealtimeEvent}</p>}
        <p style={{ margin: '4px 0' }}><strong>Signaling:</strong> {signalingStatus}</p>
      </div>

      <div style={{ marginTop: '16px' }}>
        {Object.keys(results).map(module => (
          <div key={module} style={sectionStyle}>
            <h3 style={{ margin: '0 0 8px 0', color: '#cba6f7', fontSize: '14px' }}>[{module}]</h3>
            {Object.keys(results[module]).map(key => {
              const item = results[module][key];
              const color = item.result === 'PASS' ? '#a6e3a1' : item.result === 'FAIL' ? '#f38ba8' : item.result === 'WARNING' ? '#fab387' : '#bac2de';
              return (
                <div key={key} style={{ marginBottom: '6px', lineHeight: '1.4' }}>
                  <span style={{ color, fontWeight: 'bold' }}>{item.result}</span> | <strong>{key}</strong>
                  <div style={{ color: '#bac2de', paddingLeft: '8px', fontSize: '11px', wordBreak: 'break-word' }}>
                    {typeof item.error === 'object' ? JSON.stringify(item.error) : item.error}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
