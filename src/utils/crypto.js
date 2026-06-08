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
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

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

async function deriveSecretKey(privateKey, publicKey) {
  return await window.crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

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

export async function encryptMessage(text, privateKey, receiverPublicKeyJwk) {
  if (!privateKey || !receiverPublicKeyJwk) return null;
  try {
    const receiverPubKey = await importPublicKey(receiverPublicKeyJwk);
    const aesKey = await deriveSecretKey(privateKey, receiverPubKey);
    
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const ciphertextBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
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

export async function generateSafetyNumber(pubKey1, pubKey2) {
  if (!pubKey1 || !pubKey2) return null;

  // Deterministic JSON stringify
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
  
  const hashArray = Array.from(new Uint16Array(hashBuffer)); // 16 items of 16-bit
  
  // Take first 6 uint16 numbers, pad each to 5 digits
  const chunks = hashArray.slice(0, 6).map(num => num.toString().padStart(5, '0'));
  return chunks.join(' ');
}
