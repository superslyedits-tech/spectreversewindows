const DB_NAME = 'spectreverse-simulator-deck';
const DB_VERSION = 1;
const STORE = 'saves';
const META_KEY = '__meta__';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is not available in this browser context.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open IndexedDB.'));
  });
}

function tx(db, mode = 'readonly') {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

export async function saveSlot(slot, snapshot, meta = {}) {
  const db = await openDb();
  const record = {
    slot,
    snapshot,
    meta: {
      ...meta,
      savedAt: Date.now(),
      version: snapshot?.version || 'unknown',
      tick: snapshot?.engine?.tick || 0,
      bytes: roughBytes(snapshot)
    }
  };
  await requestToPromise(tx(db, 'readwrite').put(record));
  return record.meta;
}

export async function loadSlot(slot) {
  const db = await openDb();
  const record = await requestToPromise(tx(db).get(slot));
  return record || null;
}

export async function listSlots() {
  const db = await openDb();
  const records = await requestToPromise(tx(db).getAll());
  return records.filter(r => r.slot !== META_KEY).map(r => ({ slot: r.slot, meta: r.meta }));
}

export async function rememberActiveSlot(slot) {
  const db = await openDb();
  await requestToPromise(tx(db, 'readwrite').put({ slot: META_KEY, snapshot: null, meta: { activeSlot: slot, savedAt: Date.now() } }));
}

export async function getActiveSlot() {
  const db = await openDb();
  const record = await requestToPromise(tx(db).get(META_KEY));
  return record?.meta?.activeSlot || 'autosave';
}

export async function loadBestSave() {
  try {
    const active = await getActiveSlot();
    const activeRecord = await loadSlot(active);
    if (activeRecord?.snapshot) return activeRecord;
    const auto = await loadSlot('autosave');
    return auto?.snapshot ? auto : null;
  } catch {
    return null;
  }
}

export async function deleteSlot(slot) {
  const db = await openDb();
  await requestToPromise(tx(db, 'readwrite').delete(slot));
}

export function roughBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return 0;
  }
}

export function formatBytes(bytes = 0) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = Number(bytes) || 0;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}
