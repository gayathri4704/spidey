/**
 * Spidey – IndexedDB Layer (using idb)
 * Provides a simple, typed interface to the browser's IndexedDB
 * No backend required – all data lives in the client.
 */

import { openDB } from 'idb';

const DB_NAME    = 'spidey-db';
const DB_VERSION = 1;

/** Store names */
export const STORES = {
  MISSIONS:    'missions',
  ALLIES:      'allies',
  SETTINGS:    'settings',
};

/**
 * Opens (and upgrades) the Spidey IndexedDB database.
 * @returns {Promise<IDBPDatabase>}
 */
export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Missions store
      if (!db.objectStoreNames.contains(STORES.MISSIONS)) {
        const missionsStore = db.createObjectStore(STORES.MISSIONS, {
          keyPath: 'id',
          autoIncrement: true,
        });
        missionsStore.createIndex('status', 'status');
        missionsStore.createIndex('createdAt', 'createdAt');
      }

      // Allies store
      if (!db.objectStoreNames.contains(STORES.ALLIES)) {
        const alliesStore = db.createObjectStore(STORES.ALLIES, {
          keyPath: 'id',
          autoIncrement: true,
        });
        alliesStore.createIndex('name', 'name');
      }

      // Settings store (key-value)
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS);
      }
    },
  });
}

/* ── Generic CRUD helpers ── */

/**
 * Gets all records from a store.
 * @param {string} storeName
 * @returns {Promise<Array>}
 */
export async function getAll(storeName) {
  const db = await getDB();
  return db.getAll(storeName);
}

/**
 * Gets a single record by key.
 * @param {string} storeName
 * @param {*} key
 * @returns {Promise<*>}
 */
export async function getOne(storeName, key) {
  const db = await getDB();
  return db.get(storeName, key);
}

/**
 * Adds a record to a store.
 * @param {string} storeName
 * @param {object} data
 * @returns {Promise<IDBValidKey>}
 */
export async function addRecord(storeName, data) {
  const db = await getDB();
  const record = { ...data, createdAt: new Date().toISOString() };
  return db.add(storeName, record);
}

/**
 * Updates an existing record.
 * @param {string} storeName
 * @param {object} data – must include the keyPath field
 * @returns {Promise<IDBValidKey>}
 */
export async function updateRecord(storeName, data) {
  const db = await getDB();
  const record = { ...data, updatedAt: new Date().toISOString() };
  return db.put(storeName, record);
}

/**
 * Deletes a record by key.
 * @param {string} storeName
 * @param {*} key
 * @returns {Promise<void>}
 */
export async function deleteRecord(storeName, key) {
  const db = await getDB();
  return db.delete(storeName, key);
}

/**
 * Clears all records from a store.
 * @param {string} storeName
 * @returns {Promise<void>}
 */
export async function clearStore(storeName) {
  const db = await getDB();
  return db.clear(storeName);
}

/* ── Settings helpers ── */

/**
 * Gets a setting value.
 * @param {string} key
 * @param {*} defaultValue
 * @returns {Promise<*>}
 */
export async function getSetting(key, defaultValue = null) {
  const db = await getDB();
  const value = await db.get(STORES.SETTINGS, key);
  return value !== undefined ? value : defaultValue;
}

/**
 * Sets a setting value.
 * @param {string} key
 * @param {*} value
 * @returns {Promise<IDBValidKey>}
 */
export async function setSetting(key, value) {
  const db = await getDB();
  return db.put(STORES.SETTINGS, value, key);
}
