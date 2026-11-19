import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createDefaultSong } from '../src/lib/defaultSong';
import {
  DELETED_SONGS_KEY,
  clearDeletedSongTombstone,
  deleteSong,
  getDeletedSongTombstones,
  getSavedSongs,
  recordDeletedSongTombstone,
  saveSong,
} from '../src/lib/storage';
import {
  fetchSongsFromCloudDetailed,
  fetchSupabaseWithRefresh,
  getAuthAccessToken,
  getCurrentUser,
  getLastSyncedAt,
  mergeSongLists,
  sanitizeCloudSongProject,
  saveCloudConfig,
  signOutUser,
  syncLibraryNow,
  syncSongToCloud,
} from '../src/lib/cloudSync';
import type { SongProject } from '../src/types/song';

function installMockStorage(): {
  store: Map<string, string>;
  restore: () => void;
} {
  const store = new Map<string, string>();
  const g = globalThis as { localStorage?: Storage; window?: unknown };
  const prevLs = g.localStorage;
  const prevWin = g.window;

  const mockStorage: Storage = {
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

  g.localStorage = mockStorage;
  g.window = { localStorage: mockStorage };

  return {
    store,
    restore: () => {
      g.localStorage = prevLs;
      g.window = prevWin;
    },
  };
}

function seedAuthenticatedUser(
  store: Map<string, string>,
  opts: {
    userId?: string;
    accessToken?: string;
    refreshToken?: string;
    autoSyncEnabled?: boolean;
  } = {}
) {
  saveCloudConfig({
    supabaseUrl: 'https://phase8d-project.supabase.co',
    supabaseAnonKey: 'phase8d-anon-key',
    autoSyncEnabled: opts.autoSyncEnabled ?? true,
  });
  store.set(
    'demo_maker_cloud_auth_v1',
    JSON.stringify({
      accessToken: opts.accessToken ?? 'jwt-valid-8d',
      refreshToken: opts.refreshToken ?? 'refresh-8d',
      user: {
        id: opts.userId ?? 'user-8d-1',
        email: 'artist8d@studio.th',
        displayName: 'Artist 8D',
        mode: 'authenticated',
      },
    })
  );
}

// ───────── 1. Tombstone Deletion Propagation & Last-Song Delete Recovery ─────────

test('Phase 8D.1: deleteSong records tombstone, recovers last-song delete cleanly, and syncLibraryNow sends DELETE without resurrection', async () => {
  const env = installMockStorage();
  const origFetch = globalThis.fetch;

  try {
    seedAuthenticatedUser(env.store);

    const songKeep: SongProject = {
      ...createDefaultSong(),
      id: 'song-keep-8d',
      title: 'Keep Song',
      updatedAt: '2026-11-18T10:00:00.000Z',
    };
    const songDelete: SongProject = {
      ...createDefaultSong(),
      id: 'song-del-8d',
      title: 'To Be Deleted',
      updatedAt: '2026-11-18T09:00:00.000Z',
    };

    saveSong(songKeep, { preserveUpdatedAt: true });
    saveSong(songDelete, { preserveUpdatedAt: true });

    const deletedOk = deleteSong(songDelete.id);
    assert.equal(deletedOk, true);
    const tombstones = getDeletedSongTombstones();
    assert.ok(tombstones[songDelete.id], 'deleteSong must record tombstone timestamp');
    assert.ok(env.store.get(DELETED_SONGS_KEY)?.includes(songDelete.id));

    // Delete the remaining song -> must succeed and seed a fresh clean default song
    const lastDeletedOk = deleteSong(songKeep.id);
    assert.equal(lastDeletedOk, true);
    const afterLast = getSavedSongs();
    assert.equal(afterLast.length, 1);
    assert.notEqual(afterLast[0].id, songKeep.id);

    // Re-save songKeep (clears its tombstone) and verify tombstone cleanup
    saveSong(songKeep, { preserveUpdatedAt: true });
    assert.equal(getDeletedSongTombstones()[songKeep.id], undefined);

    // Prepare cloud state that STILL holds songDelete with an older timestamp -> must DELETE on cloud and NOT resurrect
    const deleteCalls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'GET' && url.includes('/rest/v1/songs')) {
        return new Response(
          JSON.stringify([
            { project_data: songKeep },
            { project_data: songDelete },
          ]),
          { status: 200 }
        );
      }
      if (method === 'DELETE' && url.includes('/rest/v1/songs')) {
        deleteCalls.push(url);
        return new Response(null, { status: 204 });
      }
      if (method === 'POST' && url.includes('/rest/v1/songs')) {
        return new Response('', { status: 201 });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    const syncRes = await syncLibraryNow();
    assert.equal(syncRes.success, true);
    assert.equal(syncRes.status, 'synced');
    assert.equal(deleteCalls.length, 1);
    assert.ok(deleteCalls[0].includes(`id=eq.${encodeURIComponent(songDelete.id)}`));
    assert.ok(
      !syncRes.mergedSongs.some((s) => s.id === songDelete.id),
      'Tombstoned song must NOT resurrect from Cloud'
    );
    assert.equal(
      getDeletedSongTombstones()[songDelete.id],
      undefined,
      'Tombstone should be cleared after Cloud DELETE succeeds'
    );

    // Manual tombstone helpers also behave cleanly
    recordDeletedSongTombstone('manual-tomb-1', '2026-11-18T12:00:00.000Z');
    assert.equal(getDeletedSongTombstones()['manual-tomb-1'], '2026-11-18T12:00:00.000Z');
    clearDeletedSongTombstone('manual-tomb-1');
    assert.equal(getDeletedSongTombstones()['manual-tomb-1'], undefined);
  } finally {
    globalThis.fetch = origFetch;
    env.restore();
  }
});

// ───────── 2. Non-Destructive Conflict Snapshot ─────────

test('Phase 8D.2: mergeSongLists creates non-destructive Sync Conflict snapshot when local and cloud versions differ', () => {
  const localOlder: SongProject = {
    ...createDefaultSong(),
    id: 'conflict-song-1',
    title: 'Desktop Draft',
    bpm: 78,
    updatedAt: '2026-11-18T08:00:00.000Z',
  };
  localOlder.sections[0].bars[0].lyrics = 'เนื้อร้องฝั่งคอมพิวเตอร์';

  const cloudNewer: SongProject = {
    ...createDefaultSong(),
    id: 'conflict-song-1',
    title: 'iPad Revised',
    bpm: 92,
    updatedAt: '2026-11-18T10:30:00.000Z',
  };
  cloudNewer.sections[0].bars[0].lyrics = 'เนื้อร้องฝั่ง iPad ล่าสุด';

  const merged = mergeSongLists([localOlder], [cloudNewer], {});
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, 'iPad Revised');
  assert.equal(merged[0].bpm, 92);

  const conflictSnap = (merged[0].snapshots || []).find((s) =>
    s.name.startsWith('Auto-backup: Sync Conflict')
  );
  assert.ok(conflictSnap, 'Older conflicting version must be preserved in winner.snapshots');
  const parsedSnap = JSON.parse(conflictSnap.songData) as SongProject;
  assert.equal(parsedSnap.title, 'Desktop Draft');
  assert.equal(parsedSnap.sections[0].bars[0].lyrics, 'เนื้อร้องฝั่งคอมพิวเตอร์');

  // Re-merging the winning song with the same older cloud/local copy must NOT duplicate identical conflict snapshot
  const mergedAgain = mergeSongLists([localOlder], [merged[0]], {});
  const conflictCount = (mergedAgain[0].snapshots || []).filter((s) =>
    s.name.startsWith('Auto-backup: Sync Conflict')
  ).length;
  assert.equal(conflictCount, 1);
});

// ───────── 3. HTTP 401 Auto-Refresh, Explicit Fetch Error & Guest RLS Guard ─────────

test('Phase 8D.3: HTTP 401 auto-refreshes token once (single-flight), HTTP 500 blocks destructive push, and Guest skips RLS', async () => {
  const env = installMockStorage();
  const origFetch = globalThis.fetch;

  try {
    // 3a. Guest mode with cloud configured must NOT hit Supabase REST endpoints (avoids RLS errors)
    saveCloudConfig({
      supabaseUrl: 'https://phase8d-project.supabase.co',
      supabaseAnonKey: 'phase8d-anon-key',
      autoSyncEnabled: false,
    });
    let guestNetworkCalls = 0;
    globalThis.fetch = (async () => {
      guestNetworkCalls += 1;
      return new Response('Should not be called for guest', { status: 401 });
    }) as typeof fetch;

    assert.equal(getCurrentUser().mode, 'guest');
    const guestSync = await syncLibraryNow();
    assert.equal(guestSync.success, true);
    assert.equal(guestSync.status, 'local-only');
    assert.equal(guestNetworkCalls, 0);

    // 3b. Authenticated user with expired JWT -> single-flight 401 refresh & retry
    seedAuthenticatedUser(env.store, {
      accessToken: 'expired-jwt-8d',
      refreshToken: 'refresh-token-8d',
    });

    let refreshCallCount = 0;
    const mock401Fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const hdrs = (init?.headers || {}) as Record<string, string>;

      if (url.endsWith('/auth/v1/token?grant_type=refresh_token')) {
        refreshCallCount += 1;
        await new Promise((r) => setTimeout(r, 15));
        return new Response(
          JSON.stringify({
            access_token: 'fresh-jwt-8d',
            refresh_token: 'refresh-token-8d-2',
            user: { id: 'user-8d-1', email: 'artist8d@studio.th' },
          }),
          { status: 200 }
        );
      }

      if (url.includes('/rest/v1/songs')) {
        if (hdrs.Authorization === 'Bearer expired-jwt-8d') {
          return new Response(JSON.stringify({ message: 'JWT expired' }), { status: 401 });
        }
        if (hdrs.Authorization === 'Bearer fresh-jwt-8d') {
          return new Response(JSON.stringify([]), { status: 200 });
        }
      }
      return new Response('Unhandled', { status: 404 });
    }) as typeof fetch;

    // Concurrent calls should share one refresh request
    const [r1, r2] = await Promise.all([
      fetchSupabaseWithRefresh(
        'https://phase8d-project.supabase.co/rest/v1/songs',
        { headers: { Authorization: 'Bearer expired-jwt-8d' } },
        mock401Fetch
      ),
      fetchSupabaseWithRefresh(
        'https://phase8d-project.supabase.co/rest/v1/songs',
        { headers: { Authorization: 'Bearer expired-jwt-8d' } },
        mock401Fetch
      ),
    ]);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(refreshCallCount, 1, 'Concurrent 401 calls must perform single-flight token refresh');
    assert.equal(getAuthAccessToken(), 'fresh-jwt-8d');

    // Reset token to expired and verify fetchSongsFromCloudDetailed + syncSongToCloud auto-refresh
    seedAuthenticatedUser(env.store, {
      accessToken: 'expired-jwt-8d',
      refreshToken: 'refresh-token-8d',
    });
    const fetchDetailedRes = await fetchSongsFromCloudDetailed(mock401Fetch);
    assert.equal(fetchDetailedRes.ok, true);
    assert.deepEqual(fetchDetailedRes.songs, []);

    seedAuthenticatedUser(env.store, {
      accessToken: 'expired-jwt-8d',
      refreshToken: 'refresh-token-8d',
    });
    const pushRes = await syncSongToCloud(createDefaultSong(), mock401Fetch);
    assert.equal(pushRes.success, true);

    // 3c. Explicit HTTP 500 on pull aborts syncLibraryNow cleanly without pushing
    let pushAttempted = false;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method || 'GET').toUpperCase() === 'POST') {
        pushAttempted = true;
      }
      return new Response('Internal Server Error', { status: 500 });
    }) as typeof fetch;

    const failedSync = await syncLibraryNow([createDefaultSong()]);
    assert.equal(failedSync.success, false);
    assert.equal(failedSync.status, 'error');
    assert.equal(pushAttempted, false, 'Must not push when cloud fetch failed');

    // 3d. Partial push failure preserves pulled cloud songs locally before returning error
    const cloudSong: SongProject = {
      ...createDefaultSong(),
      id: 'cloud-pulled-ok',
      title: 'Pulled Before Failure',
      updatedAt: '2026-11-18T11:00:00.000Z',
    };
    const localNewSong: SongProject = {
      ...createDefaultSong(),
      id: 'local-push-fail',
      title: 'Local Fails Upload',
      updatedAt: '2026-11-18T11:05:00.000Z',
    };
    saveSong(localNewSong, { preserveUpdatedAt: true });

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'GET' && url.includes('/rest/v1/songs')) {
        return new Response(JSON.stringify([{ project_data: cloudSong }]), { status: 200 });
      }
      if (method === 'POST' && url.includes('/rest/v1/songs')) {
        return new Response('Write quota error', { status: 500 });
      }
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const partialFailRes = await syncLibraryNow();
    assert.equal(partialFailRes.success, false);
    assert.ok(
      getSavedSongs().some((s) => s.id === 'cloud-pulled-ok'),
      'Downloaded cloud songs must still be saved locally when a push fails'
    );

    // 3e. signOutUser clears last sync timestamp cleanly
    env.store.set('demo_maker_cloud_last_sync', '2026-11-18T12:00:00.000Z');
    assert.ok(getLastSyncedAt());
    await signOutUser();
    assert.equal(getLastSyncedAt(), null);
  } finally {
    globalThis.fetch = origFetch;
    env.restore();
  }
});

// ───────── 4. Schema Sanitization ─────────

test('Phase 8D.4: sanitizeCloudSongProject fills missing fields/mixer/sections safely and rejects invalid records', () => {
  assert.equal(sanitizeCloudSongProject(null), null);
  assert.equal(sanitizeCloudSongProject({ title: 'No ID' }), null);

  const sanitized = sanitizeCloudSongProject({
    id: 'cloud-partial-1',
    title: 'Partial Cloud Song',
    bpm: 999, // out of range -> clamped
    timeSignature: '9/8', // invalid -> fallback 4/4
    guitarModel: 'unknown-axe', // invalid -> fallback
    sections: [
      {
        id: 'sec-1',
        name: 'Verse',
        type: 'verse',
        intensity: 'extreme',
        bars: [{ id: 'b-1', chords: [], lyrics: 'สวัสดี' }],
      },
    ],
  });

  assert.ok(sanitized);
  assert.equal(sanitized.id, 'cloud-partial-1');
  assert.equal(sanitized.bpm, 240);
  assert.equal(sanitized.timeSignature, '4/4');
  assert.ok(sanitized.mixer.guitarRhythm && sanitized.mixer.vocal);
  assert.equal(sanitized.sections[0].intensity, 'low');
  assert.deepEqual(sanitized.sections[0].bars[0].chords, ['C']);
  assert.equal(sanitized.sections[0].bars[0].lyrics, 'สวัสดี');
  assert.ok(Array.isArray(sanitized.sections[0].bars[0].melodyNotes));
});

// ───────── 5. Phase 8D UI & Page Contracts ─────────

test('Phase 8D.5: page.tsx, AccountSyncModal, and SongLibraryModal wire autoSync, honest status, vocal note & last-song delete', () => {
  const root = process.cwd();
  const pageSrc = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8');
  const accountSrc = fs.readFileSync(path.join(root, 'src/components/AccountSyncModal.tsx'), 'utf8');
  const librarySrc = fs.readFileSync(path.join(root, 'src/components/SongLibraryModal.tsx'), 'utf8');
  const storageSrc = fs.readFileSync(path.join(root, 'src/lib/storage.ts'), 'utf8');

  assert.match(storageSrc, /DELETED_SONGS_TOMBSTONE_KEY/);
  assert.match(pageSrc, /getCloudConfig\(\)\.autoSyncEnabled/);
  assert.match(pageSrc, /setSyncStatus\(savedLastSync \? 'synced' : 'local-only'\)/);
  assert.match(accountSrc, /autoSyncEnabled/);
  assert.match(accountSrc, /IndexedDB/);
  assert.match(accountSrc, /bg-surface-1/);
  assert.match(librarySrc, /isLastSong/);
});
