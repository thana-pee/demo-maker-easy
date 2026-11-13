/**
 * phase4c.test.ts — Automated Unit Tests for Phase 4C
 *
 * Tests:
 *   1. audioStorageIdb.ts — DB/Store naming, key format, memory fallback CRUD & clearSongVocals
 *   2. audioStorageIdb.ts — Mocked IndexedDB lifecycle + persistSongVocalsToIdb / hydrateSongVocalsFromIdb + localStorage offload
 *   3. types/song.ts — SongStatusTag & SongSnapshot fields on SongProject
 *   4. storage.ts — Search (by title and bar.lyrics), Folder extraction & filtering, Status Tag persistence
 *   5. storage.ts — Version Snapshots (lightweight serialization without vocalAudio/snapshots, 1-click Restore Version & Delete Snapshot)
 *   6. SongLibraryModal.tsx — UI presence of Search, Folders, Status Tags, Save Snapshot, Restore Version, Delete Snapshot
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { SongProject, SongStatusTag } from '../src/types/song';
import { createDefaultSong } from '../src/lib/defaultSong';
import {
  AUDIO_DB_NAME,
  AUDIO_DB_VERSION,
  VOCAL_STORE_NAME,
  makeVocalBlobKey,
  saveVocalBlob,
  getVocalBlob,
  deleteVocalBlob,
  clearSongVocals,
  persistSongVocalsToIdb,
  hydrateSongVocalsFromIdb,
  resetAudioDbForTests,
} from '../src/lib/audioStorageIdb';
import {
  saveSong,
  getSongById,
  deleteSong,
  extractSongFolders,
  filterLibrarySongs,
  createSongSnapshot,
  restoreSongFromSnapshot,
  addSnapshotToSong,
  removeSnapshotFromSong,
  updateSongLibraryMeta,
  stripVocalsFromSong,
} from '../src/lib/storage';

// ติดตั้ง mock localStorage ชั่วคราวสำหรับทดสอบ storage.ts บน Node.js
function ensureMockLocalStorage() {
  const g = globalThis as { localStorage?: Storage };
  if (g.localStorage) return;
  const store = new Map<string, string>();
  g.localStorage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => store.get(k) ?? null,
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => {
      store.delete(k);
    },
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
}

// ───────────────────────── 1. IndexedDB Audio Store (Fallback) ─────────────────────────

test('audioStorageIdb: บันทึก ดึง ลบ และล้างเสียงร้องรายเพลงผ่าน Memory Fallback เมื่อไม่มี indexedDB', async () => {
  resetAudioDbForTests();
  assert.equal(AUDIO_DB_NAME, 'demo_maker_audio_db');
  assert.equal(AUDIO_DB_VERSION, 1);
  assert.equal(VOCAL_STORE_NAME, 'vocals');

  const k1 = makeVocalBlobKey('song-A', 'bar-1');
  const k2 = makeVocalBlobKey('song-A', 'bar-2');
  const kOther = makeVocalBlobKey('song-B', 'bar-1');
  assert.equal(k1, 'song-A_bar-1');

  await saveVocalBlob(k1, 'data:audio/webm;base64,AAA=');
  await saveVocalBlob(k2, 'data:audio/webm;base64,BBB=');
  await saveVocalBlob(kOther, 'data:audio/webm;base64,CCC=');

  assert.equal(await getVocalBlob(k1), 'data:audio/webm;base64,AAA=');
  assert.equal(await getVocalBlob(k2), 'data:audio/webm;base64,BBB=');

  await deleteVocalBlob(k1);
  assert.equal(await getVocalBlob(k1), null);
  assert.equal(await getVocalBlob(k2), 'data:audio/webm;base64,BBB=');

  await clearSongVocals('song-A');
  assert.equal(await getVocalBlob(k2), null, 'clearSongVocals ต้องลบทุกห้องของ song-A');
  assert.equal(
    await getVocalBlob(kOther),
    'data:audio/webm;base64,CCC=',
    'ต้องไม่กระทบเสียงร้องของ song-B'
  );
});

// ───────────────────────── 2. IndexedDB Mock + Offload Integration ─────────────────────────

test('audioStorageIdb: เปิด DB demo_maker_audio_db v1 (store vocals) และ hydrate/offload เสียงร้องได้จริง', async () => {
  ensureMockLocalStorage();
  resetAudioDbForTests();

  const idbData = new Map<string, string>();
  const createdStores = new Set<string>();
  const g = globalThis as { indexedDB?: unknown };
  const prevIdb = g.indexedDB;

  // จำลอง IndexedDB API บน Node เพื่อทดสอบเส้นทาง IndexedDB จริง
  g.indexedDB = {
    open(name: string, version: number) {
      assert.equal(name, 'demo_maker_audio_db');
      assert.equal(version, 1);
      const req: Record<string, unknown> = {};
      const fakeDb = {
        objectStoreNames: { contains: (s: string) => createdStores.has(s) },
        createObjectStore: (s: string) => {
          createdStores.add(s);
          return {};
        },
        close: () => {},
        transaction: () => {
          const tx: Record<string, unknown> = {
            objectStore: () => ({
              put: (val: string, key: string) => {
                idbData.set(key, val);
                queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
              },
              get: (key: string) => {
                const r: Record<string, unknown> = { result: idbData.get(key) };
                queueMicrotask(() => (r.onsuccess as (() => void) | undefined)?.());
                return r;
              },
              delete: (key: string) => {
                idbData.delete(key);
                queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
              },
              openCursor: () => {
                const entries = Array.from(idbData.entries());
                let idx = 0;
                const r: Record<string, unknown> = {};
                const advance = () => {
                  if (idx < entries.length) {
                    const [k] = entries[idx];
                    r.result = {
                      key: k,
                      delete: () => idbData.delete(k),
                      continue: () => {
                        idx++;
                        queueMicrotask(advance);
                      },
                    };
                    (r.onsuccess as (() => void) | undefined)?.();
                  } else {
                    r.result = null;
                    (r.onsuccess as (() => void) | undefined)?.();
                    (tx.oncomplete as (() => void) | undefined)?.();
                  }
                };
                queueMicrotask(advance);
                return r;
              },
            }),
          };
          return tx;
        },
      };

      queueMicrotask(() => {
        req.result = fakeDb;
        (req.onupgradeneeded as (() => void) | undefined)?.();
        (req.onsuccess as (() => void) | undefined)?.();
      });
      return req;
    },
  };

  try {
    const song = createDefaultSong();
    song.id = 'idb-test-song';
    const sampleUrl = 'data:audio/webm;base64,RkFLRV9BVURJT19CTE9C';
    song.sections[0].bars[0].vocalAudio = sampleUrl;

    await persistSongVocalsToIdb(song);
    assert.ok(createdStores.has('vocals'), 'ต้องสร้าง object store vocals');
    assert.equal(idbData.get(makeVocalBlobKey(song.id, song.sections[0].bars[0].id)), sampleUrl);

    // ทดสอบ saveSong offload vocalAudio ออกจาก localStorage JSON เมื่อมี indexedDB
    saveSong(song);
    const inLocal = getSongById(song.id);
    assert.ok(inLocal);
    assert.equal(
      inLocal.sections[0].bars[0].vocalAudio,
      undefined,
      'ในโหมด IndexedDB ต้องไม่เก็บ vocalAudio ขนาดใหญ่ค้างใน localStorage'
    );

    // ทดสอบ hydrate กลับมาจาก IndexedDB
    const hydrated = await hydrateSongVocalsFromIdb(inLocal);
    assert.equal(hydrated.sections[0].bars[0].vocalAudio, sampleUrl);

    // ลบเพลงต้องล้างไฟล์เสียงใน IndexedDB ด้วย
    deleteSong(song.id);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(idbData.has(makeVocalBlobKey(song.id, song.sections[0].bars[0].id)), false);
  } finally {
    g.indexedDB = prevIdb;
    resetAudioDbForTests();
  }
});

// ───────────────────────── 3. Search, Folders & Status Tags ─────────────────────────

test('Song Library Organization: ค้นหาจากชื่อเพลง/เนื้อร้อง กรองตาม Folder และอัปเดต StatusTag', () => {
  ensureMockLocalStorage();

  const song1: SongProject = {
    ...createDefaultSong(),
    id: 'lib-song-1',
    title: 'Acoustic Sunset',
    folder: 'อัลบั้มแรก',
    statusTag: 'vocal-recorded',
  };
  song1.sections[0].bars[0].lyrics = 'มองดูแสงตะวันลับขอบฟ้า';

  const song2: SongProject = {
    ...createDefaultSong(),
    id: 'lib-song-2',
    title: 'Rainy Cafe',
    folder: 'Demo 2026',
    statusTag: 'arranged',
  };
  song2.sections[0].bars[0].lyrics = 'เสียงฝนตกข้างหน้าต่างร้านกาแฟ';

  const song3: SongProject = {
    ...createDefaultSong(),
    id: 'lib-song-3',
    title: 'Untitled Sketch',
  };
  song3.sections[0].bars[0].lyrics = 'ฮัมทำนองเบาๆ';

  const catalog = [song1, song2, song3];

  // Folders extraction
  assert.deepEqual(extractSongFolders(catalog), ['Demo 2026', 'อัลบั้มแรก']);

  // Search by title
  assert.deepEqual(
    filterLibrarySongs(catalog, 'rainy').map((s) => s.id),
    ['lib-song-2']
  );

  // Search by lyrics
  assert.deepEqual(
    filterLibrarySongs(catalog, 'ตะวันลับ').map((s) => s.id),
    ['lib-song-1']
  );

  // Filter by folder
  assert.deepEqual(
    filterLibrarySongs(catalog, '', 'อัลบั้มแรก').map((s) => s.id),
    ['lib-song-1']
  );

  // Filter by statusTag
  const allStatuses: SongStatusTag[] = ['draft', 'arranged', 'vocal-recorded', 'mastered'];
  assert.equal(allStatuses.length, 4);
  assert.deepEqual(
    filterLibrarySongs(catalog, '', 'ALL', 'arranged').map((s) => s.id),
    ['lib-song-2']
  );

  // Save and update metadata in storage
  saveSong(song1);
  const updated = updateSongLibraryMeta(song1, { folder: 'Mastered Hits', statusTag: 'mastered' });
  assert.equal(updated.folder, 'Mastered Hits');
  assert.equal(updated.statusTag, 'mastered');
  const fromDisk = getSongById('lib-song-1');
  assert.equal(fromDisk?.folder, 'Mastered Hits');
  assert.equal(fromDisk?.statusTag, 'mastered');
});

// ───────────────────────── 4. Version Snapshots ─────────────────────────

test('Version Snapshots: createSongSnapshot น้ำหนักเบา ไม่เก็บ vocalAudio/snapshots ซ้ำ และ Restore Version คืนค่าเดิมได้', () => {
  ensureMockLocalStorage();

  const song = createDefaultSong();
  song.id = 'snap-song-1';
  song.title = 'Demo With History';
  song.bpm = 82;
  song.sections[0].bars[0].chords = ['G'];
  song.sections[0].bars[0].lyrics = 'ท่อนแรกเวอร์ชันหนึ่ง';
  song.sections[0].bars[0].vocalAudio = 'data:audio/webm;base64,HEAVY_VOCAL_PAYLOAD';

  // สร้าง snapshot
  const { song: withSnap, snapshot } = addSnapshotToSong(song, 'v1 ก่อนปรับคอร์ด');
  assert.equal(withSnap.snapshots?.length, 1);
  assert.equal(snapshot.name, 'v1 ก่อนปรับคอร์ด');

  // ตรวจว่า songData ใน snapshot ไม่มี snapshots และไม่มี vocalAudio
  const snapParsed = JSON.parse(snapshot.songData) as SongProject;
  assert.equal(snapParsed.snapshots, undefined, 'snapshot.songData ต้องไม่มี snapshots ซ้อนกัน');
  assert.equal(
    snapParsed.sections[0].bars[0].vocalAudio,
    undefined,
    'snapshot.songData ต้องไม่เก็บ vocalAudio เพื่อให้เบา'
  );
  assert.equal(stripVocalsFromSong(song).sections[0].bars[0].vocalAudio, undefined);

  // สมมติผู้ใช้แก้เพลงเป็นเวอร์ชันสอง
  const modified: SongProject = {
    ...withSnap,
    bpm: 110,
    sections: withSnap.sections.map((sec, i) =>
      i === 0
        ? {
            ...sec,
            bars: sec.bars.map((b, bi) =>
              bi === 0 ? { ...b, chords: ['Am7'], lyrics: 'แก้ไขแล้ว' } : b
            ),
          }
        : sec
    ),
  };

  // กู้คืนกลับไปยัง snapshot
  const restored = restoreSongFromSnapshot(modified, snapshot);
  assert.ok(restored);
  assert.equal(restored.bpm, 82, 'ต้องคืนค่า BPM จาก snapshot');
  assert.equal(restored.sections[0].bars[0].chords[0], 'G', 'ต้องคืนค่าคอร์ดจาก snapshot');
  assert.equal(restored.sections[0].bars[0].lyrics, 'ท่อนแรกเวอร์ชันหนึ่ง');
  assert.equal(restored.snapshots?.length, 1, 'ต้องคงรายการ snapshots ของเพลงไว้');
  assert.equal(
    restored.sections[0].bars[0].vocalAudio,
    'data:audio/webm;base64,HEAVY_VOCAL_PAYLOAD',
    'ต้องคง vocalAudio เดิมของห้องไว้ไม่ให้หายหลังย้อนเวอร์ชัน'
  );

  // ทดสอบ createSongSnapshot แบบ auto label และ removeSnapshotFromSong
  const autoSnap = createSongSnapshot(restored);
  assert.ok(autoSnap.name.startsWith('Snapshot #'));

  const afterDelete = removeSnapshotFromSong(restored, snapshot.id);
  assert.equal(afterDelete.snapshots?.length, 0);
});

// ───────────────────────── 5. UI Contract ─────────────────────────

test('SongLibraryModal.tsx: มีองค์ประกอบ Search, Folders, Status Tags และ Version Snapshots ครบถ้วน', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'SongLibraryModal.tsx'),
    'utf-8'
  );
  assert.ok(src.includes('searchQuery'), 'ต้องมี Search bar');
  assert.ok(src.includes('folderFilter') && src.includes('extractSongFolders'), 'ต้องมีตัวกรอง Folder');
  for (const tag of ['draft', 'arranged', 'vocal-recorded', 'mastered']) {
    assert.ok(src.includes(`'${tag}'`) || src.includes(`${tag}:`), `ต้องมีสถานะ ${tag}`);
  }
  assert.ok(src.includes('Save Snapshot'), 'ต้องมีปุ่ม Save Snapshot');
  assert.ok(src.includes('Restore Version'), 'ต้องมีปุ่ม Restore Version');
  assert.ok(src.includes('Delete Snapshot'), 'ต้องมีปุ่ม Delete Snapshot');
});
