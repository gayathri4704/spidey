const DB_NAME = 'spidey_crypto';
const STORE_NAME = 'keys';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

// ── Legacy global key (kept for backward-compat migration) ──────────────────

export async function savePrivateKey(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(key, 'privateKey');
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getPrivateKey() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('privateKey');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

// ── User-scoped key storage (multi-device safe) ─────────────────────────────

export async function savePrivateKeyForUser(userId, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(key, `privateKey_${userId}`);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getPrivateKeyForUser(userId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(`privateKey_${userId}`);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

// ── Key generation & export ──────────────────────────────────────────────────

export async function generateKeyPair() {
  return await window.crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"]
  );
}

export async function exportPublicKey(key) {
  return await window.crypto.subtle.exportKey("jwk", key);
}

export async function importPublicKey(jwk) {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );
}

// ── ECDH shared secret ───────────────────────────────────────────────────────

async function deriveSecretKey(privateKey, publicKey) {
  return await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ── Base64 helpers ───────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── Chat message encrypt / decrypt ──────────────────────────────────────────

export async function encryptMessage(text, privateKey, receiverPublicKeyJwk) {
  if (!privateKey || !receiverPublicKeyJwk) return null;
  try {
    const receiverPubKey = await importPublicKey(receiverPublicKeyJwk);
    const aesKey = await deriveSecretKey(privateKey, receiverPubKey);

    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      data
    );

    return JSON.stringify({
      v: 1,
      iv: arrayBufferToBase64(iv),
      data: arrayBufferToBase64(ciphertextBuffer)
    });
  } catch (err) {
    console.error("Encryption failed:", err);
    return null;
  }
}

export async function decryptMessage(encryptedJsonString, privateKey, otherPartyPublicKeyJwk) {
  try {
    const parsed = JSON.parse(encryptedJsonString);
    if (parsed.v !== 1 || !parsed.iv || !parsed.data) {
      return "🔒 Unsupported old message";
    }

    if (!privateKey || !otherPartyPublicKeyJwk) {
      return "🔒 Encrypted message cannot be decrypted";
    }

    const otherPubKey = await importPublicKey(otherPartyPublicKeyJwk);
    const aesKey = await deriveSecretKey(privateKey, otherPubKey);

    const ivBuffer = base64ToArrayBuffer(parsed.iv);
    const dataBuffer = base64ToArrayBuffer(parsed.data);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(ivBuffer) },
      aesKey,
      dataBuffer
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return "🔒 Unsupported old message";
    }
    return "🔒 Encrypted message cannot be decrypted";
  }
}

// ── Passphrase-based private key backup (multi-device E2EE) ─────────────────

/**
 * Derive an AES-GCM key from a user passphrase using PBKDF2-SHA-256.
 * @param {string} passphrase
 * @param {string} saltBase64 - base64-encoded 16-byte random salt
 * @param {number} iterations - PBKDF2 iterations (min 250 000)
 */
export async function deriveKeyFromPassphrase(passphrase, saltBase64, iterations = 250000) {
  const encoder = new TextEncoder();
  const salt = base64ToArrayBuffer(saltBase64);
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt an ECDH private key with passphrase for Supabase backup.
 * Returns columns ready to upsert into user_keys.
 */
export async function encryptPrivateKeyForBackup(privateKey, passphrase) {
  const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', privateKey);
  const privateKeyBytes = new TextEncoder().encode(JSON.stringify(privateKeyJwk));

  const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
  const iv        = window.crypto.getRandomValues(new Uint8Array(12));
  const iterations = 250000;
  const saltBase64 = arrayBufferToBase64(saltBytes);

  const aesKey = await deriveKeyFromPassphrase(passphrase, saltBase64, iterations);
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    privateKeyBytes
  );

  return {
    encrypted_private_key: arrayBufferToBase64(encryptedBuffer),
    private_key_iv:        arrayBufferToBase64(iv),
    private_key_salt:      saltBase64,
    kdf_iterations:        iterations,
  };
}

/**
 * Decrypt an ECDH private key from Supabase backup using passphrase.
 * Throws if passphrase is wrong (AES-GCM auth tag mismatch).
 */
export async function decryptPrivateKeyFromBackup(
  encryptedPrivateKey, passphrase, saltBase64, ivBase64, iterations = 250000
) {
  const aesKey          = await deriveKeyFromPassphrase(passphrase, saltBase64, iterations);
  const encryptedBuffer = base64ToArrayBuffer(encryptedPrivateKey);
  const iv              = base64ToArrayBuffer(ivBase64);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    aesKey,
    encryptedBuffer
  );

  const privateKeyJwk = JSON.parse(new TextDecoder().decode(decryptedBuffer));
  return window.crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// ── Safety number ────────────────────────────────────────────────────────────

export async function generateSafetyNumber(pubKey1, pubKey2) {
  if (!pubKey1 || !pubKey2) return null;

  const stringifyDeterministic = (obj) => {
    return JSON.stringify(Object.keys(obj).sort().reduce((acc, key) => {
      acc[key] = obj[key];
      return acc;
    }, {}));
  };

  const k1 = stringifyDeterministic(pubKey1);
  const k2 = stringifyDeterministic(pubKey2);
  const sortedKeys = [k1, k2].sort();
  const inputString = sortedKeys.join('|');

  const encoder = new TextEncoder();
  const data = encoder.encode(inputString);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);

  const hashArray = Array.from(new Uint16Array(hashBuffer));
  const chunks = hashArray.slice(0, 6).map(num => num.toString().padStart(5, '0'));
  return chunks.join(' ');
}
