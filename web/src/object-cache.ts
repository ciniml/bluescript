// Persists the object cache (dist/build directories: *.o, *.a and their *.sig
// stamps) in IndexedDB so a page reload starts with warm builds. Entries are
// validated by the compiler's content signatures, so stale files only cost a
// cache miss. Every operation degrades to a no-op when IndexedDB is missing
// or fails (private browsing, storage pressure).
import { Buffer } from 'buffer';
import type { MemoryFileSystem } from '../../lang/src/compiler/file-system';

const DB_NAME = 'bs-object-cache';
const STORE = 'files';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const isCached = (p: string) => p.includes('/dist/build/');

// Loads every stored file into the memory filesystem; returns the count.
export async function restoreObjectCache(fs: MemoryFileSystem): Promise<number> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const [keys, values] = await new Promise<[IDBValidKey[], Uint8Array[]]>((resolve, reject) => {
      const kReq = store.getAllKeys();
      const vReq = store.getAll();
      let k: IDBValidKey[] | undefined, v: Uint8Array[] | undefined;
      kReq.onsuccess = () => { k = kReq.result; if (v) resolve([k, v]); };
      vReq.onsuccess = () => { v = vReq.result; if (k) resolve([k, v]); };
      kReq.onerror = () => reject(kReq.error);
      vReq.onerror = () => reject(vReq.error);
    });
    db.close();
    let n = 0;
    for (let i = 0; i < keys.length; i++) {
      const p = String(keys[i]);
      if (!isCached(p)) continue;
      fs.writeFile(p, Buffer.from(values[i]));
      n++;
    }
    return n;
  } catch {
    return 0;
  }
}

// Replaces the store with the current dist/build contents.
export async function persistObjectCache(fs: MemoryFileSystem): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    for (const [p, data] of fs.entries('/')) {
      if (isCached(p)) store.put(new Uint8Array(data), p);
    }
    await done(tx);
    db.close();
  } catch {
    // Best effort only.
  }
}
