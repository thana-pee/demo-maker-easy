import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createDefaultSong } from '../src/lib/defaultSong';
import {
  getVocalBlob,
  hasUnpersistedVocals,
  hydrateSongVocalsFromIdb,
  makeVocalBlobKey,
  makeVocalTakeBlobKey,
  persistSongVocalsToIdb,
  resetAudioDbForTests,
  saveVocalBlob,
} from '../src/lib/audioStorageIdb';
import {
  STORAGE_KEY,
  duplicateSongWithVocals,
  getActiveSongId,
  getSavedSongs,
  getSongById,
  resolveSafeSharedSong,
  saveSong,
  setActiveSongId,
} from '../src/lib/storage';
import { translations } from '../src/lib/i18n';
import type { SongProject } from '../src/types/song';

function installMockStorageAndIdb(): {
  lsMap: Map<string, string>;
  idbMap: Map<string, string>;
  getPutCount: () => number;
  resetPutCount: () => void;
  restore: () => void;
} {
  const lsMap = new Map<string, string>();
  const idbMap = new Map<string, string>();
  const createdStores = new Set<string>();
  let putCount = 0;

  const g = globalThis as {
    localStorage?: Storage;
    window?: { localStorage: Storage };
    indexedDB?: unknown;
  };
  const prevLs = g.localStorage;
  const prevWin = g.window;
  const prevIdb = g.indexedDB;

  const mockStorage: Storage = {
    get length() {
      return lsMap.size;
    },
    clear: () => lsMap.clear(),
    getItem: (k: string) => lsMap.get(k) ?? null,
    key: (i: number) => Array.from(lsMap.keys())[i] ?? null,
    removeItem: (k: string) => {
      lsMap.delete(k);
    },
    setItem: (k: string, v: string) => {
      lsMap.set(k, v);
    },
  };

  g.localStorage = mockStorage;
  g.window = { localStorage: mockStorage };
  g.indexedDB = {
    open() {
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
                putCount += 1;
                idbMap.set(key, val);
                queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
              },
              get: (key: string) => {
                const r: Record<string, unknown> = { result: idbMap.get(key) };
                queueMicrotask(() => (r.onsuccess as (() => void) | undefined)?.());
                return r;
              },
              delete: (key: string) => {
                idbMap.delete(key);
                queueMicrotask(() => (tx.oncomplete as (() => void) | undefined)?.());
              },
              openCursor: () => {
                const r: Record<string, unknown> = {};
                queueMicrotask(() => {
                  r.result = null;
                  (r.onsuccess as (() => void) | undefined)?.();
                  (tx.oncomplete as (() => void) | undefined)?.();
                });
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

  return {
    lsMap,
    idbMap,
    getPutCount: () => putCount,
    resetPutCount: () => {
      putCount = 0;
    },
    restore: () => {
      g.localStorage = prevLs;
      g.window = prevWin;
      g.indexedDB = prevIdb;
      resetAudioDbForTests();
    },
  };
}

// ───────── 1. duplicateSongWithVocals Copies bar.vocalAudio & vocalTakes 100% ─────────

test('Phase 8C.1: duplicateSongWithVocals copies both bar.vocalAudio and vocalTakes to IDB under new unique IDs', async () => {
  resetAudioDbForTests();
  const env = installMockStorageAndIdb();
  try {
    const activeSong: SongProject = {
      ...createDefaultSong(),
      id: 'song-active-keep',
      title: 'Currently Active',
    };
    const origSong: SongProject = {
      ...createDefaultSong(),
      id: 'song-src-vocals',
      title: 'Original With Vocals',
      snapshots: [
        {
          id: 'snap-old',
          name: 'Old Snapshot',
          createdAt: '2026-11-18T00:00:00.000Z',
          songData: '{}',
        },
      ],
      vocalTakes: [
        {
          id: 'take-orig-1',
          name: 'Take 1 — Full Song',
          scope: 'full-song',
          sectionId: undefined,
          startGlobalBarIndex: 0,
          endGlobalBarIndex: 3,
          source: 'mic',
          createdAt: '2026-11-18T01:00:00.000Z',
          isActive: true,
          audioDataUrl: 'data:audio/webm;base64,FULL_TAKE_PAYLOAD_1',
          fxPreset: 'studio-warm',
          preRollOffsetSec: 0,
          latencyOffsetMs: 0,
        },
      ],
    };
    const barAudio = 'data:audio/webm;base64,BAR_VOCAL_PAYLOAD_1';
    origSong.sections[0].bars[0].vocalAudio = barAudio;
    origSong.vocalTakes![0].sectionId = origSong.sections[1].id;

    // Persist original song (offloads vocals to IDB and strips localStorage)
    await persistSongVocalsToIdb(origSong);
    saveSong(origSong, { setActive: false, skipIdbPersist: true });
    saveSong(activeSong, { setActive: true });
    setActiveSongId(activeSong.id);

    // Confirm localStorage stripped origSong vocals cleanly
    const rawOrigFromLs = getSongById(origSong.id);
    assert.ok(rawOrigFromLs);
    assert.equal(rawOrigFromLs.sections[0].bars[0].vocalAudio, undefined);
    assert.equal(rawOrigFromLs.vocalTakes?.[0]?.audioDataUrl, undefined);

    // Duplicate WITHOUT passing liveSong -> must hydrate from IDB and copy all vocals to new song IDs
    const copy = await duplicateSongWithVocals(origSong.id);
    assert.ok(copy);
    assert.notEqual(copy.id, origSong.id);
    assert.equal(copy.title, 'Original With Vocals (สำเนา)');
    assert.deepEqual(copy.snapshots, []);
    assert.equal(getActiveSongId(), activeSong.id, 'Must not hijack active song ID');

    const newBarId = copy.sections[0].bars[0].id;
    const newTakeId = copy.vocalTakes?.[0]?.id ?? '';
    assert.notEqual(newBarId, origSong.sections[0].bars[0].id);
    assert.notEqual(newTakeId, 'take-orig-1');
    assert.equal(copy.vocalTakes?.[0]?.sectionId, copy.sections[1].id);

    // Verify copied audio blobs exist in IDB under the new song's keys
    const copiedBarBlob = await getVocalBlob(makeVocalBlobKey(copy.id, newBarId));
    const copiedTakeBlob = await getVocalBlob(makeVocalTakeBlobKey(copy.id, newTakeId));
    assert.equal(copiedBarBlob, barAudio);
    assert.equal(copiedTakeBlob, 'data:audio/webm;base64,FULL_TAKE_PAYLOAD_1');

    // Verify hydrating the saved copy from localStorage recovers both vocal tracks
    const copyFromLs = getSongById(copy.id);
    assert.ok(copyFromLs);
    const hydratedCopy = await hydrateSongVocalsFromIdb(copyFromLs);
    assert.equal(hydratedCopy.sections[0].bars[0].vocalAudio, barAudio);
    assert.equal(hydratedCopy.vocalTakes?.[0]?.audioDataUrl, 'data:audio/webm;base64,FULL_TAKE_PAYLOAD_1');
  } finally {
    env.restore();
  }
});

// ───────── 2. IDB Dirty-Check Avoids Redundant Writes on Unchanged Audio ─────────

test('Phase 8C.2: IDB dirty-check skips redundant writes on unchanged vocals and writes when audio changes', async () => {
  resetAudioDbForTests();
  const env = installMockStorageAndIdb();
  try {
    const song = createDefaultSong();
    song.id = 'song-idb-dirty';
    const barId = song.sections[0].bars[0].id;
    song.sections[0].bars[0].vocalAudio = 'data:audio/webm;base64,INITIAL_AUDIO_12345';

    assert.equal(hasUnpersistedVocals(song), true);
    await persistSongVocalsToIdb(song);
    assert.equal(env.getPutCount(), 1, 'First persist must write to IDB once');
    assert.equal(hasUnpersistedVocals(song), false);

    // Simulate typing lyrics and calling saveSong multiple times -> must NOT trigger extra IDB puts
    env.resetPutCount();
    for (let i = 0; i < 5; i += 1) {
      song.sections[0].bars[0].lyrics = `แก้ไขคำร้องครั้งที่ ${i}`;
      saveSong(song);
      await persistSongVocalsToIdb(song);
    }
    assert.equal(env.getPutCount(), 0, 'Unchanged audio must not cause redundant IDB write transactions');

    // Now change the vocal audio -> must detect dirty and write once
    const updatedAudio = 'data:audio/webm;base64,UPDATED_AUDIO_99999';
    song.sections[0].bars[0].vocalAudio = updatedAudio;
    assert.equal(hasUnpersistedVocals(song), true);
    await saveVocalBlob(makeVocalBlobKey(song.id, barId), updatedAudio);
    assert.equal(env.getPutCount(), 1, 'Changed audio must write to IDB once');
    assert.equal(hasUnpersistedVocals(song), false);
  } finally {
    env.restore();
  }
});

// ───────── 3. saveSong preserveUpdatedAt & Quota Error Handling ─────────

test('Phase 8C.3: saveSong preserveUpdatedAt avoids Phantom Auto-Save timestamp churn and reports write errors accurately', () => {
  resetAudioDbForTests();
  const env = installMockStorageAndIdb();
  try {
    const song = createDefaultSong();
    song.id = 'song-preserve-ts';
    song.updatedAt = '2026-11-10T12:34:56.000Z';

    const ok = saveSong(song, { preserveUpdatedAt: true });
    assert.equal(ok, true);
    const loaded = getSongById(song.id);
    assert.equal(loaded?.updatedAt, '2026-11-10T12:34:56.000Z');

    // Default saveSong without preserveUpdatedAt still updates updatedAt cleanly
    const ok2 = saveSong(song);
    assert.equal(ok2, true);
    const loaded2 = getSongById(song.id);
    assert.notEqual(loaded2?.updatedAt, '2026-11-10T12:34:56.000Z');

    // Simulate persistent QuotaExceededError even after pruning -> saveSong returns false
    const origSetItem = globalThis.localStorage!.setItem;
    globalThis.localStorage!.setItem = (k: string) => {
      if (k === STORAGE_KEY) {
        const err = new Error('QuotaExceededError') as Error & { name: string; code: number };
        err.name = 'QuotaExceededError';
        err.code = 22;
        throw err;
      }
    };
    const failedOk = saveSong(song, { preserveUpdatedAt: true });
    assert.equal(failedOk, false);
    globalThis.localStorage!.setItem = origSetItem;
  } finally {
    env.restore();
  }
});

// ───────── 4. Safe ?song= Share Link Collision Guard & Non-Colliding Initial Seed ─────────

test('Phase 8C.4: resolveSafeSharedSong prevents ?song= share link from overwriting colliding library song IDs', () => {
  resetAudioDbForTests();
  const env = installMockStorageAndIdb();
  try {
    const existingSong = createDefaultSong();
    existingSong.id = 'demo-song-1';
    existingSong.title = 'เพลงต้นฉบับของผู้ใช้';

    // Different content with colliding ID -> reassigned new shared-... ID
    const incomingDifferent: SongProject = {
      ...createDefaultSong(),
      id: 'demo-song-1',
      title: 'เพลงจากเพื่อนทาง LINE',
    };
    const guarded = resolveSafeSharedSong(incomingDifferent, [existingSong]);
    assert.equal(guarded.reassignedId, true);
    assert.notEqual(guarded.song.id, 'demo-song-1');
    assert.ok(guarded.song.id.startsWith('shared-'));

    // Same content with same ID -> keeps ID cleanly without creating duplicate
    const incomingSame: SongProject = {
      ...createDefaultSong(),
      id: 'demo-song-1',
      title: 'เพลงต้นฉบับของผู้ใช้',
    };
    const sameRes = resolveSafeSharedSong(incomingSame, [existingSong]);
    assert.equal(sameRes.reassignedId, false);
    assert.equal(sameRes.song.id, 'demo-song-1');

    // Empty localStorage initial seed creates unique demo-song-... ID while createDefaultSong() preserves 'demo-song-1'
    assert.equal(createDefaultSong().id, 'demo-song-1');
    env.lsMap.clear();
    const seeded = getSavedSongs();
    assert.equal(seeded.length, 1);
    assert.notEqual(seeded[0].id, 'demo-song-1');
    assert.ok(seeded[0].id.startsWith('demo-song-'));
  } finally {
    env.restore();
  }
});

// ───────── 5. Studio Save Engine UI & Hook Contracts (page.tsx, TransportBar, SongLibraryModal, i18n) ─────────

test('Phase 8C.5: Studio Save Engine wires real save state, Ctrl+S / Ctrl+Shift+S, flush on hide/switch, auto-checkpoints & i18n symmetry', () => {
  // Check i18n Phase 8C keys
  for (const key of [
    'saveStateSaving',
    'saveStateSaved',
    'saveStateError',
    'manualSaveBtn',
    'saveCheckpointBtn',
  ] as const) {
    assert.ok(translations.th[key].trim().length > 0);
    assert.ok(translations.en[key].trim().length > 0);
  }

  const root = process.cwd();
  const pageSrc = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
  const transportSrc = fs.readFileSync(path.join(root, 'src/components/TransportBar.tsx'), 'utf8');
  const librarySrc = fs.readFileSync(path.join(root, 'src/components/SongLibraryModal.tsx'), 'utf8');
  const sectionSrc = fs.readFileSync(path.join(root, 'src/components/SectionBuilder.tsx'), 'utf8');

  // page.tsx contracts
  assert.match(pageSrc, /localSaveState/);
  assert.match(pageSrc, /lastLocalSavedAt/);
  assert.match(pageSrc, /isHydratingOrLoadingRef/);
  assert.match(pageSrc, /lastPersistedSongKeyRef/);
  assert.match(pageSrc, /flushPendingLocalSave/);
  assert.match(pageSrc, /visibilitychange/);
  assert.match(pageSrc, /pagehide/);
  assert.match(pageSrc, /handleManualSave/);
  assert.match(pageSrc, /handleSaveCheckpoint/);
  assert.match(pageSrc, /createAutoCheckpointBeforeMutation/);
  assert.match(pageSrc, /resolveSafeSharedSong/);
  // Verify same-song selection keeps undoStackRef intact (only clears when !isSameSong)
  assert.match(pageSrc, /const isSameSong = nextSong\.id === songRef\.current\.id;/);
  assert.match(pageSrc, /if \(!isSameSong\)\s*\{[\s\S]*?undoStackRef\.current = \[\];/);

  // TransportBar.tsx contracts
  assert.match(transportSrc, /export type LocalSaveState = 'saved' \| 'dirty' \| 'saving' \| 'error'/);
  assert.match(transportSrc, /onManualSave\?:/);
  assert.match(transportSrc, /onSaveCheckpoint\?:/);
  assert.match(transportSrc, /e\.key\.toLowerCase\(\) === 's'/);
  assert.match(transportSrc, /e\.shiftKey/);
  assert.match(transportSrc, /data-save-state=\{localSaveState\}/);

  // SongLibraryModal.tsx contracts
  assert.match(librarySrc, /duplicateSongWithVocals/);
  assert.match(librarySrc, /generateUniqueId\('demo-song'\)/);
  assert.match(librarySrc, /vocalTakes:\s*currentSong\.vocalTakes/);

  // SectionBuilder.tsx CohesivePolish auto-checkpoint
  assert.match(sectionSrc, /addSnapshotToSong\(/);
  assert.match(sectionSrc, /Auto-backup: ก่อนเกลาทั้งเพลง/);
});
