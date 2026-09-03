// src/utils/indexedDbCache.js
//
// IndexedDB-backed offline cache for user-facing Firestore data.
//
// What gets cached:
//   - Daily menus (menus/<date>)
//   - Daily staples / default menu (dailyStaples/config)
//   - Deadline settings (settings/deadline)
//   - The signed-in user's own meal selections and working mode
//   - The signed-in user's role (users/<uid>)
//
// No passwords, Firebase credentials, or tokens are ever stored here.
// The cache is local to the browser only and stores exactly the same
// user-facing data the components already load from Firestore.

import { getDoc } from 'firebase/firestore';

const DB_NAME = 'karmic-canteen-cache';
const DB_VERSION = 1;
const STORE_NAME = 'documents';

// How long to wait for a Firestore read before falling back to the cache.
const NETWORK_TIMEOUT_MS = 10000;

let dbPromise = null;

const openDb = () => {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available in this browser'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Reset the cached promise on failure so a later call can retry.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }

  return dbPromise;
};

const withStore = (mode, operation) =>
  openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        const request = operation(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );

// Build a stable cache key from a Firestore path, e.g.:
//   docCacheKey('menus', '2026-09-04') -> 'menus:2026-09-04'
export const docCacheKey = (...parts) => parts.join(':');

// Store (or refresh) a document's data under the given key.
export const cacheDocument = async (key, data) => {
  try {
    await withStore('readwrite', (store) =>
      store.put({ key, data, cachedAt: Date.now() })
    );
  } catch (error) {
    console.warn('[indexedDbCache] Failed to cache document:', key, error);
  }
};

// Read the latest cached data for a key, or null when nothing is cached.
export const getCachedDocument = async (key) => {
  try {
    const record = await withStore('readonly', (store) => store.get(key));
    return record && record.data !== undefined ? record.data : null;
  } catch (error) {
    console.warn('[indexedDbCache] Failed to read cached document:', key, error);
    return null;
  }
};

// Remove a cached document (e.g. when Firestore no longer has it).
export const deleteCachedDocument = async (key) => {
  try {
    await withStore('readwrite', (store) => store.delete(key));
  } catch (error) {
    console.warn('[indexedDbCache] Failed to delete cached document:', key, error);
  }
};

const withTimeout = (promise, ms) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Firestore read timed out (network unavailable?)')),
      ms
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Read a Firestore document, keeping the IndexedDB cache in sync:
//   - Online: fetch fresh data from Firestore, update the cache, return it.
//   - Offline/unreachable: return the latest cached copy if one exists.
//
// `options.sanitize(data)` can be provided to store a reduced copy in the
// cache (e.g. only the fields the app needs) while the full fresh data is
// still returned to the caller.
//
// Never throws; callers inspect `exists` and `fromCache` on the result:
//   { data, exists, fromCache, error? }
export const getDocWithCache = async (docRef, cacheKey, options = {}) => {
  // Known-offline shortcut: serve the cache directly, no network wait.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const cached = await getCachedDocument(cacheKey);
    return { data: cached, exists: cached !== null, fromCache: true };
  }

  try {
    const snapshot = await withTimeout(getDoc(docRef), NETWORK_TIMEOUT_MS);

    if (snapshot.exists()) {
      const data = snapshot.data();
      const cachedData = options.sanitize ? options.sanitize(data) : data;
      await cacheDocument(cacheKey, cachedData);
      return { data, exists: true, fromCache: false };
    }

    // Document was deleted upstream; drop the stale cached copy.
    await deleteCachedDocument(cacheKey);
    return { data: null, exists: false, fromCache: false };
  } catch (error) {
    const cached = await getCachedDocument(cacheKey);
    return {
      data: cached,
      exists: cached !== null,
      fromCache: true,
      error,
    };
  }
};