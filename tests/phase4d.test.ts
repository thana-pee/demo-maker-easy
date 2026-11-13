/**
 * phase4d.test.ts — Automated Unit Tests for Phase 4D
 *
 * Tests:
 *   1. cloudSync Auth — getCurrentUser Guest fallback & safe unconfigured signInWithEmailOtp
 *   2. cloudSync Auth REST — Supabase /auth/v1/otp, /auth/v1/verify, /auth/v1/logout & session persistence
 *   3. mergeSongLists — updatedAt timestamp conflict resolution (local vs cloud) + preserving unique songs from both sides
 *   4. syncLibraryNow — 1-click Pull + Merge + Push workflow + offline handling
 *   5. UI Contract — AccountSyncModal.tsx & TransportBar.tsx cloud sync wiring
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { SongProject } from '../src/types/song';
import { createDefaultSong } from '../src/lib/defaultSong';
import {
  GUEST_USER,
  getCurrentUser,
  saveCloudConfig,
  isCloudConfigured,
  signInWithEmailOtp,
  verifyEmailOtp,
  signOutUser,
  mergeSongLists,
  syncLibraryNow,
  getLastSyncedAt,
  type CloudSyncStatus,
} from '../src/lib/cloudSync';

function installMockLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  const g = globalThis as { localStorage?: Storage };
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
  return store;
}

// ───────────────────────── 1. Auth Guest Fallback ─────────────────────────

test('cloudSync Auth: คืนค่า Guest profile อย่างปลอดภัยเมื่อยังไม่ตั้งค่า Cloud หรือยังไม่ได้ล็อกอิน', async () => {
  installMockLocalStorage();

  const user = getCurrentUser();
  assert.deepEqual(user, GUEST_USER);
  assert.equal(user.mode, 'guest');
  assert.equal(isCloudConfigured(), false);

  // อีเมลผิดรูปแบบต้องแจ้ง error ชัดเจน
  const invalidRes = await signInWithEmailOtp('not-an-email');
  assert.equal(invalidRes.success, false);
  assert.equal(invalidRes.status, 'error');

  // อีเมลถูกต้องเมื่อยังไม่ตั้งค่า Cloud ต้อง fallback ไป Guest / local-only อย่างปลอดภัย
  const fallbackRes = await signInWithEmailOtp('songwriter@example.com');
  assert.equal(fallbackRes.success, true);
  assert.equal(fallbackRes.status, 'local-only');
  assert.equal(fallbackRes.user.mode, 'guest');
});

// ───────────────────────── 2. Supabase Auth REST Flow ─────────────────────────

test('cloudSync Auth REST: ส่ง Magic Link OTP, Verify OTP และ Sign Out ผ่าน Supabase Auth REST สำเร็จ', async () => {
  installMockLocalStorage();
  saveCloudConfig({
    supabaseUrl: 'https://demo-project.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    autoSyncEnabled: true,
  });
  assert.equal(isCloudConfigured(), true);

  const calls: Array<{ url: string; method: string; headers?: Record<string, string>; body?: string }> = [];
  const origFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({
      url,
      method: init?.method || 'GET',
      headers: (init?.headers as Record<string, string>) || {},
      body: typeof init?.body === 'string' ? init.body : undefined,
    });

    if (url.endsWith('/auth/v1/otp')) {
      return new Response('{}', { status: 200 });
    }
    if (url.endsWith('/auth/v1/verify')) {
      return new Response(
        JSON.stringify({
          access_token: 'jwt-token-123',
          refresh_token: 'refresh-456',
          user: { id: 'user-uuid-1', email: 'singer@studio.th' },
        }),
        { status: 200 }
      );
    }
    if (url.endsWith('/auth/v1/logout')) {
      return new Response('', { status: 204 });
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    // Step A: Send Magic Link OTP
    const otpRes = await signInWithEmailOtp('singer@studio.th');
    assert.equal(otpRes.success, true);
    assert.equal(otpRes.otpSent, true);
    assert.equal(calls[0].url, 'https://demo-project.supabase.co/auth/v1/otp');
    assert.equal(calls[0].headers?.apikey, 'test-anon-key');

    // Step B: Verify OTP -> Authenticated CloudUser persisted
    const verifyRes = await verifyEmailOtp('singer@studio.th', '654321');
    assert.equal(verifyRes.success, true);
    assert.equal(verifyRes.status, 'synced');
    assert.equal(verifyRes.user.mode, 'authenticated');
    assert.equal(verifyRes.user.id, 'user-uuid-1');
    assert.equal(verifyRes.user.email, 'singer@studio.th');
    assert.equal(getCurrentUser().mode, 'authenticated');

    // Step C: Sign Out -> Resets back to Guest
    const outRes = await signOutUser();
    assert.equal(outRes.user.mode, 'guest');
    assert.equal(outRes.status, 'local-only');
    assert.equal(getCurrentUser().mode, 'guest');
    assert.equal(calls[2].url, 'https://demo-project.supabase.co/auth/v1/logout');
    assert.equal(calls[2].headers?.Authorization, 'Bearer jwt-token-123');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ───────────────────────── 3. Timestamp Conflict Merge ─────────────────────────

test('mergeSongLists: เลือกเวอร์ชันที่ updatedAt ใหม่กว่าต่อ song.id และรักษาเพลงจากทั้งสองฝั่งครบถ้วน', () => {
  const localShared: SongProject = {
    ...createDefaultSong(),
    id: 'shared-1',
    title: 'Shared Song (Old Local)',
    updatedAt: '2026-11-12T10:00:00.000Z',
    folder: 'Drafts',
  };
  const cloudShared: SongProject = {
    ...createDefaultSong(),
    id: 'shared-1',
    title: 'Shared Song (Newer Cloud iPad)',
    updatedAt: '2026-11-13T08:00:00.000Z',
    folder: 'Album 1',
    statusTag: 'vocal-recorded',
  };

  const localSharedNewer: SongProject = {
    ...createDefaultSong(),
    id: 'shared-2',
    title: 'Local Desktop Newer',
    updatedAt: '2026-11-13T09:00:00.000Z',
    statusTag: 'arranged',
  };
  const cloudSharedOlder: SongProject = {
    ...createDefaultSong(),
    id: 'shared-2',
    title: 'Cloud Older',
    updatedAt: '2026-11-11T09:00:00.000Z',
  };

  const localOnly: SongProject = {
    ...createDefaultSong(),
    id: 'local-only-3',
    title: 'Only Local',
    updatedAt: '2026-11-13T07:00:00.000Z',
  };
  const cloudOnly: SongProject = {
    ...createDefaultSong(),
    id: 'cloud-only-4',
    title: 'Only Cloud',
    updatedAt: '2026-11-13T06:00:00.000Z',
  };

  const merged = mergeSongLists(
    [localShared, localSharedNewer, localOnly],
    [cloudShared, cloudSharedOlder, cloudOnly]
  );

  assert.equal(merged.length, 4);
  const byId = new Map(merged.map((s) => [s.id, s]));

  assert.equal(byId.get('shared-1')?.title, 'Shared Song (Newer Cloud iPad)');
  assert.equal(byId.get('shared-1')?.folder, 'Album 1');
  assert.equal(byId.get('shared-1')?.statusTag, 'vocal-recorded');

  assert.equal(byId.get('shared-2')?.title, 'Local Desktop Newer');
  assert.equal(byId.get('shared-2')?.statusTag, 'arranged');

  assert.equal(byId.get('local-only-3')?.title, 'Only Local');
  assert.equal(byId.get('cloud-only-4')?.title, 'Only Cloud');
});

// ───────────────────────── 4. Pull + Merge + Push Sync Now ─────────────────────────

test('syncLibraryNow: Pull + Merge + Push ซิงค์เพลงสองทางระหว่าง Local กับ Cloud ได้สมบูรณ์', async () => {
  installMockLocalStorage();
  saveCloudConfig({
    supabaseUrl: 'https://demo-project.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    autoSyncEnabled: true,
  });

  const localSong: SongProject = {
    ...createDefaultSong(),
    id: 'sync-local-1',
    title: 'New Idea On Desktop',
    updatedAt: '2026-11-13T08:30:00.000Z',
  };
  const cloudSong: SongProject = {
    ...createDefaultSong(),
    id: 'sync-cloud-2',
    title: 'Idea From iPad',
    updatedAt: '2026-11-13T08:35:00.000Z',
  };

  const pushedIds: string[] = [];
  const origFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if ((!init?.method || init.method === 'GET') && url.includes('/rest/v1/songs')) {
      return new Response(JSON.stringify([{ project_data: cloudSong }]), { status: 200 });
    }
    if (init?.method === 'POST' && url.includes('/rest/v1/songs')) {
      const payload = JSON.parse(String(init.body || '{}')) as { id: string };
      pushedIds.push(payload.id);
      return new Response('', { status: 201 });
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const result = await syncLibraryNow([localSong]);
    assert.equal(result.success, true);
    assert.equal(result.status, 'synced');
    assert.equal(result.mergedSongs.length, 2);
    assert.equal(result.downloadedCount, 1, 'ต้องดึง sync-cloud-2 จาก cloud');
    assert.equal(result.uploadedCount, 1, 'ต้องอัปโหลด sync-local-1 ขึ้น cloud');
    assert.deepEqual(pushedIds, ['sync-local-1']);
    assert.ok(getLastSyncedAt(), 'ต้องบันทึกเวลาซิงค์ล่าสุดไว้');
  } finally {
    globalThis.fetch = origFetch;
  }
});

// ───────────────────────── 5. UI Contract ─────────────────────────

test('Phase 4D UI: AccountSyncModal และ TransportBar มีองค์ประกอบ Auth + Cloud Sync Status ครบถ้วน', () => {
  const modalSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'AccountSyncModal.tsx'),
    'utf-8'
  );
  for (const status of ['local-only', 'synced', 'syncing', 'offline', 'error'] as CloudSyncStatus[]) {
    assert.ok(modalSrc.includes(status), `AccountSyncModal ต้องรองรับสถานะ ${status}`);
  }
  assert.ok(modalSrc.includes('Sync Now'), 'AccountSyncModal ต้องมีปุ่ม Sync Now');
  assert.ok(modalSrc.includes('Sign Out'), 'AccountSyncModal ต้องมีปุ่ม Sign Out');
  assert.ok(modalSrc.includes('signInWithEmailOtp'), 'AccountSyncModal ต้องเรียก signInWithEmailOtp');

  const barSrc = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'TransportBar.tsx'),
    'utf-8'
  );
  assert.ok(barSrc.includes('onOpenAccountModal'), 'TransportBar ต้องมีปุ่มเปิด AccountSyncModal');
  assert.ok(barSrc.includes('syncStatus'), 'TransportBar ต้องแสดงสถานะ syncStatus');
});
