/**
 * spideyDB.js
 * ─────────────────────────────────────────────────────────────
 * Spidey – IndexedDB layer (idb) — offline audio cache only.
 *
 * Auth / profiles / songs / favorites all live in Supabase now.
 * This module exists solely to cache audio Blobs locally so songs
 * already played can be heard offline.
 *
 * Schema (v2)
 * ───────────
 * audioCache  – keyPath: songId (Supabase UUID string)
 *               value  : { songId, fileBlob, cachedAt }
 *
 * Migration from v1 (old users / songs / favorites stores) happens
 * automatically on first open.
 * ─────────────────────────────────────────────────────────────
 */

import { openDB } from 'idb';

// ── Constants ────────────────────────────────────────────────
const DB_NAME    = 'spidey-app-db';
const DB_VERSION = 2;          // bumped from 1 → drops old stores

export const STORES = {
  AUDIO_CACHE: 'audioCache',
};

// ── Database init ─────────────────────────────────────────────

/**
 * Opens (or upgrades) the Spidey IndexedDB database.
 * Safe to call on every app boot – idb handles concurrency.
 *
 * @returns {Promise<import('idb').IDBPDatabase>}
 */
export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      // ── Drop v1 stores (user auth / songs / favorites) ──────
      if (oldVersion < 2) {
        ['users', 'songs', 'favorites'].forEach((name) => {
          if (db.objectStoreNames.contains(name)) {
            db.deleteObjectStore(name);
          }
        });
      }

      // ── Create audioCache if not present ────────────────────
      if (!db.objectStoreNames.contains(STORES.AUDIO_CACHE)) {
        db.createObjectStore(STORES.AUDIO_CACHE, { keyPath: 'songId' });
      }
    },
  });
}

// ── Audio cache helpers ───────────────────────────────────────

/**
 * Retrieves a cached audio record by Supabase song UUID.
 *
 * @param {string} songId  – Supabase UUID
 * @returns {Promise<{ songId: string, fileBlob: Blob, cachedAt: string } | undefined>}
 */
export async function getAudioCache(songId) {
  const db = await getDB();
  return db.get(STORES.AUDIO_CACHE, String(songId));
}

/**
 * Stores (or replaces) an audio Blob in the offline cache.
 *
 * @param {string} songId   – Supabase UUID
 * @param {Blob}   fileBlob – raw audio data
 * @returns {Promise<void>}
 */
export async function setAudioCache(songId, fileBlob) {
  const db = await getDB();
  await db.put(STORES.AUDIO_CACHE, {
    songId:    String(songId),
    fileBlob,
    cachedAt:  new Date().toISOString(),
  });
}

/**
 * Removes an audio Blob from the offline cache.
 *
 * @param {string} songId – Supabase UUID
 * @returns {Promise<void>}
 */
export async function deleteAudioCache(songId) {
  const db = await getDB();
  await db.delete(STORES.AUDIO_CACHE, String(songId));
}
