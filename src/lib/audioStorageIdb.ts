/**
 * audioStorageIdb.ts — IndexedDB Audio Store สำหรับเก็บไฟล์เสียงร้องประจำห้อง
 *
 * เหตุผลที่แยกจาก localStorage:
 *   - ปลดล็อกข้อจำกัด ~5MB ของ localStorage สำหรับบันทึกเสียงร้องหลายห้อง/หลายเพลงบน iPad & Desktop
 *   - ใช้ database `demo_maker_audio_db` (version 1) และ object store `vocals`
 *   - Key format: `${songId}_${barId}`
 *   - มี safe in-memory Map fallback เมื่อรันในสภาพแวดล้อมที่ไม่มี `indexedDB` (เช่น SSR / Node.js tests)
 */

import type { SongProject } from '../types/song';

export const AUDIO_DB_NAME = 'demo_maker_audio_db';
export const AUDIO_DB_VERSION = 1;
export const VOCAL_STORE_NAME = 'vocals';

const memoryVocalStore = new Map<string, string>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

/** สร้าง key มาตรฐานสำหรับจัดเก็บเสียงร้องของแต่ละห้อง */
export function makeVocalBlobKey(songId: string, barId: string): string {
  return `${songId}_${barId}`;
}

/** รีเซ็ต cache connection (ใช้ใน test หรือเมื่อปิด DB) */
export function resetAudioDbForTests(): void {
  dbPromise = null;
  memoryVocalStore.clear();
}

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openAudioDb(): Promise<IDBDatabase | null> {
  if (!hasIndexedDb()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VOCAL_STORE_NAME)) {
          db.createObjectStore(VOCAL_STORE_NAME);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
      req.onblocked = () => {
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

/** บันทึก Data URL เสียงร้องลง IndexedDB (key format: `${songId}_${barId}`) */
export async function saveVocalBlob(key: string, dataUrl: string): Promise<void> {
  if (!key || !dataUrl) return;
  memoryVocalStore.set(key, dataUrl);

  const db = await openAudioDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(VOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VOCAL_STORE_NAME);
      store.put(dataUrl, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** ดึง Data URL เสียงร้องตาม key จาก IndexedDB (หรือ memory fallback) */
export async function getVocalBlob(key: string): Promise<string | null> {
  if (!key) return null;

  const db = await openAudioDb();
  if (!db) {
    return memoryVocalStore.get(key) ?? null;
  }

  return new Promise<string | null>((resolve) => {
    try {
      const tx = db.transaction(VOCAL_STORE_NAME, 'readonly');
      const store = tx.objectStore(VOCAL_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const val = typeof req.result === 'string' ? req.result : null;
        resolve(val ?? memoryVocalStore.get(key) ?? null);
      };
      req.onerror = () => resolve(memoryVocalStore.get(key) ?? null);
    } catch {
      resolve(memoryVocalStore.get(key) ?? null);
    }
  });
}

/** ลบข้อมูลเสียงร้อง 1 key ออกจาก IndexedDB */
export async function deleteVocalBlob(key: string): Promise<void> {
  if (!key) return;
  memoryVocalStore.delete(key);

  const db = await openAudioDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(VOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VOCAL_STORE_NAME);
      store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** ล้างข้อมูลเสียงร้องทั้งหมดที่ผูกกับ songId ออกจาก IndexedDB */
export async function clearSongVocals(songId: string): Promise<void> {
  if (!songId) return;
  const prefix = `${songId}_`;

  for (const k of Array.from(memoryVocalStore.keys())) {
    if (k.startsWith(prefix)) {
      memoryVocalStore.delete(k);
    }
  }

  const db = await openAudioDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(VOCAL_STORE_NAME, 'readwrite');
      const store = tx.objectStore(VOCAL_STORE_NAME);
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (typeof cursor.key === 'string' && cursor.key.startsWith(prefix)) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** บันทึกเสียงร้องทั้งหมดที่มีใน SongProject ลง IndexedDB */
export async function persistSongVocalsToIdb(song: SongProject): Promise<void> {
  const tasks: Promise<void>[] = [];
  for (const sec of song.sections || []) {
    for (const bar of sec.bars || []) {
      if (bar.vocalAudio) {
        tasks.push(saveVocalBlob(makeVocalBlobKey(song.id, bar.id), bar.vocalAudio));
      }
    }
  }
  await Promise.all(tasks);
}

/** ดึงเสียงร้องจาก IndexedDB กลับมาใส่ใน SongProject (สำหรับเพลงที่ถูก offload ออกจาก localStorage) */
export async function hydrateSongVocalsFromIdb(song: SongProject): Promise<SongProject> {
  let changed = false;
  const sections = await Promise.all(
    (song.sections || []).map(async (sec) => {
      const bars = await Promise.all(
        (sec.bars || []).map(async (bar) => {
          if (bar.vocalAudio) return bar;
          const stored = await getVocalBlob(makeVocalBlobKey(song.id, bar.id));
          if (stored) {
            changed = true;
            return { ...bar, vocalAudio: stored };
          }
          return bar;
        })
      );
      return { ...sec, bars };
    })
  );
  return changed ? { ...song, sections } : song;
}
