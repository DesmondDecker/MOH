/**
 * OFFLINE VISIT QUEUE — IndexedDB
 * -----------------------------------------------------------------------
 * The core of "offline-first": a visit a CHW records is written HERE
 * first, always, regardless of network state — never sent directly over
 * fetch(). Sync (chwSync.js) is a separate, best-effort step that runs
 * whenever connectivity happens to be available; recording a visit never
 * blocks on it and never fails because of it.
 *
 * Every visit gets a `clientVisitId` (crypto.randomUUID(), generated HERE
 * on the device) the moment it's recorded — this is what makes it safe to
 * retry a sync after a dropped connection without risking a duplicate
 * server-side record (see backend/models/OutreachVisit.js for the
 * matching idempotency logic on the receiving end).
 *
 * Each stored record has a `status`: 'pending' (not yet synced), 'synced'
 * (confirmed by the server), or 'error' (the server rejected it — kept
 * locally with the error message so the CHW can see and fix it, rather
 * than silently dropped).
 *
 * SANDBOX NOTE FOR REVIEWERS: IndexedDB is a browser-only API with no
 * Node.js equivalent, so this file's actual read/write behavior could not
 * be executed or unit-tested in the sandbox this was built in (no
 * browser available) — only verified for correct syntax and adherence to
 * the standard IndexedDB API surface. Test this for real in an actual
 * browser (open DevTools -> Application -> IndexedDB after recording a
 * visit) before relying on it.
 */

const DB_NAME = 'moh-chw-offline';
const DB_VERSION = 1;
const STORE_NAME = 'visits';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'clientVisitId' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('recordedOfflineAt', 'recordedOfflineAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueVisit(visitData) {
  const db = await openDb();
  const clientVisitId = crypto.randomUUID();
  const record = {
    ...visitData,
    clientVisitId,
    status: 'pending',
    errorMessage: null,
    recordedOfflineAt: visitData.recordedOfflineAt || new Date().toISOString(),
  };

  const tx = db.transaction(STORE_NAME, 'readwrite');
  await promisifyRequest(tx.objectStore(STORE_NAME).add(record));

  return clientVisitId;
}

async function getAllVisits() {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const all = await promisifyRequest(tx.objectStore(STORE_NAME).getAll());
  return all.sort((a, b) => new Date(b.recordedOfflineAt) - new Date(a.recordedOfflineAt));
}

async function getPendingVisits() {
  const all = await getAllVisits();
  return all.filter((v) => v.status === 'pending' || v.status === 'error');
}

async function markSynced(clientVisitId) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const record = await promisifyRequest(store.get(clientVisitId));
  if (!record) return;
  record.status = 'synced';
  record.errorMessage = null;
  await promisifyRequest(store.put(record));
}

async function markError(clientVisitId, errorMessage) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const record = await promisifyRequest(store.get(clientVisitId));
  if (!record) return;
  record.status = 'error';
  record.errorMessage = errorMessage;
  await promisifyRequest(store.put(record));
}

async function deleteVisit(clientVisitId) {
  const db = await openDb();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await promisifyRequest(tx.objectStore(STORE_NAME).delete(clientVisitId));
}

async function countPending() {
  const pending = await getPendingVisits();
  return pending.length;
}

export const offlineQueue = {
  queueVisit,
  getAllVisits,
  getPendingVisits,
  markSynced,
  markError,
  deleteVisit,
  countPending,
};
