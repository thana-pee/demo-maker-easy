/**
 * Phase 8 Product Analytics Verification Suite
 * ครอบคลุม:
 * 1) sanitizeAnalyticsEvent (PII scrubbing, validation, songwriter slug preservation)
 * 2) summarizeUsageRows (topFeatures, topSongwriters with Thai labels, genres, dialects, viewModes)
 * 3) recordUsageEventsServer (missing-table graceful fallback PGRST205 + successful insert + sb_secret header guard)
 * 4) /api/analytics/track (Guest anon_id + Authenticated Bearer user_id + batch support + validation)
 * 5) /api/analytics/summary (401 auth guard, 200 ranked summary, tableReady=false fallback, days clamping)
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { SONGWRITER_STYLE_PROFILES } from '../src/lib/aiPrompts';
import {
  ANALYTICS_HEADER_ANON_ID,
  sanitizeAnalyticsEvent,
} from '../src/lib/analytics';
import {
  recordUsageEventsServer,
  summarizeUsageRows,
  type StoredUsageRow,
} from '../src/lib/serverAnalytics';
import { getServerBillingConfig, type FetchLike, type ServerBillingConfig } from '../src/lib/serverWallet';
import { handleTrackAnalyticsRequest } from '../src/app/api/analytics/track/route';
import {
  handleGetAnalyticsSummaryRequest,
  parseAdminEmails,
} from '../src/app/api/analytics/summary/route';
import {
  ANALYTICS_MIGRATION_SQL,
  getReadableDialectLabel,
  getReadableFeatureInfo,
  getReadableGenreLabel,
  getReadableSongwriterLabel,
} from '../src/lib/analyticsLabels';

function makeTestConfig(overrides?: Partial<ServerBillingConfig>): ServerBillingConfig {
  return {
    ...getServerBillingConfig(),
    supabaseUrl: 'https://test-project.supabase.co',
    supabaseAnonKey: 'test-anon-key',
    serviceRoleKey: 'sb_secret_test_service_role_key',
    ...overrides,
  };
}

test('sanitizeAnalyticsEvent: rejects invalid inputs, scrubs PII, preserves songwriter slugs', () => {
  assert.equal(sanitizeAnalyticsEvent(null), null);
  assert.equal(sanitizeAnalyticsEvent({ eventName: '' }), null);
  assert.equal(sanitizeAnalyticsEvent({ eventName: 'INVALID SPACE EVENT!' }), null);

  const sanitized = sanitizeAnalyticsEvent({
    eventName: '  AI_Lyrics_Quick  ',
    category: 'ai',
    anonId: 'dme_guest_1234',
    songwriterStyle: 'kob-bigass',
    thaiGenre: 'thai-rock',
    lyricDialect: 'standard',
    lyricEra: 'era-2000s',
    emotionalResolution: 'empowering-anthem',
    viewMode: 'songwriter',
    featureVariant: 'chorus',
    isSimulated: false,
    creditsCost: 1.4,
    metadata: {
      email: 'secret@example.com',
      phone: '0812345678',
      token: 'jwt-secret',
      accessToken: 'abc',
      authorization: 'Bearer xyz',
      lyrics: 'เนื้อเพลงส่วนตัว',
      prompt: 'raw user prompt',
      slip: 'slip-data',
      audioDataUrl: 'data:audio/webm;base64,AAA',
      k1: 'v1',
      k2: 2,
      k3: true,
      k4: 'v4',
      k5: 'v5',
      k6: 'v6',
      k7: 'v7',
      k8: 'v8',
      k9_over_limit: 'should-drop',
    },
  });

  assert.ok(sanitized);
  assert.equal(sanitized.eventName, 'ai_lyrics_quick');
  assert.equal(sanitized.category, 'ai');
  assert.equal(sanitized.songwriterStyle, 'kob-bigass');
  assert.equal(sanitized.thaiGenre, 'thai-rock');
  assert.equal(sanitized.creditsCost, 1);
  assert.equal(Object.keys(sanitized.metadata).length, 8);
  assert.equal('email' in sanitized.metadata, false);
  assert.equal('lyrics' in sanitized.metadata, false);
  assert.equal('audioDataUrl' in sanitized.metadata, false);
  assert.equal('k9_over_limit' in sanitized.metadata, false);

  const nga = sanitizeAnalyticsEvent({
    eventName: 'select_songwriter_style',
    category: 'style',
    songwriterStyle: 'nga-caravan',
  });
  assert.equal(nga?.songwriterStyle, 'nga-caravan');
});

test('summarizeUsageRows: ranks topFeatures & topSongwriters across Guest + Auth actors', () => {
  const kobExpected = SONGWRITER_STYLE_PROFILES.find((p) => p.id === 'kob-bigass')?.label;
  const ngaExpected = SONGWRITER_STYLE_PROFILES.find((p) => p.id === 'nga-caravan')?.label;
  assert.ok(kobExpected, 'kob-bigass profile label should exist');
  assert.ok(ngaExpected, 'nga-caravan profile label should exist');

  const rows: StoredUsageRow[] = [
    {
      event_name: 'select_songwriter_style',
      category: 'style',
      anon_id: 'dme_g1',
      is_authenticated: false,
      songwriter_style: 'kob-bigass',
      thai_genre: 'thai-rock',
      lyric_dialect: 'standard',
      view_mode: 'songwriter',
      credits_cost: 0,
      metadata: {},
      created_at: '2026-11-15T08:00:00Z',
    },
    {
      event_name: 'ai_lyrics_quick',
      category: 'ai',
      anon_id: 'dme_g1',
      is_authenticated: false,
      songwriter_style: 'kob-bigass',
      thai_genre: 'thai-rock',
      lyric_dialect: 'standard',
      credits_cost: 1,
      metadata: {},
      created_at: '2026-11-15T08:02:00Z',
    },
    {
      event_name: 'ai_lyrics_quick',
      category: 'ai',
      user_id: 'user-uuid-1',
      is_authenticated: true,
      songwriter_style: 'nga-caravan',
      thai_genre: 'phuea-chiwit',
      lyric_dialect: 'isan',
      credits_cost: 1,
      metadata: {},
      created_at: '2026-11-15T09:00:00Z',
    },
    {
      event_name: 'export_mp3',
      category: 'export',
      user_id: 'user-uuid-1',
      is_authenticated: true,
      songwriter_style: 'none',
      thai_genre: 'phuea-chiwit',
      view_mode: 'arranger',
      credits_cost: 0,
      metadata: {},
      created_at: '2026-11-15T09:05:00Z',
    },
    {
      event_name: 'ai_easy_mode_architect',
      category: 'ai',
      anon_id: 'dme_g2',
      is_authenticated: false,
      songwriter_style: 'kob-bigass',
      thai_genre: 'thai-rock',
      credits_cost: 4,
      metadata: {},
      created_at: '2026-11-15T10:00:00Z',
    },
  ];

  const report = summarizeUsageRows(rows);
  assert.equal(report.totalEvents, 5);
  assert.equal(report.uniqueActors, 3); // dme_g1, user-uuid-1, dme_g2
  assert.equal(report.guestEvents, 3);
  assert.equal(report.authenticatedEvents, 2);

  assert.equal(report.topFeatures[0].eventName, 'ai_lyrics_quick');
  assert.equal(report.topFeatures[0].count, 2);
  assert.equal(report.topFeatures[0].guestCount, 1);
  assert.equal(report.topFeatures[0].authenticatedCount, 1);
  assert.equal(report.topFeatures[0].uniqueActors, 2);

  // 'none' must be excluded; kob-bigass (3 hits) precedes nga-caravan (1 hit)
  assert.equal(report.topSongwriters.length, 2);
  assert.equal(report.topSongwriters[0].songwriterStyle, 'kob-bigass');
  assert.equal(report.topSongwriters[0].label, kobExpected);
  assert.equal(report.topSongwriters[0].totalCount, 3);
  assert.equal(report.topSongwriters[0].aiGenerationCount, 2);
  assert.equal(report.topSongwriters[0].pickerSelectCount, 1);
  assert.equal(report.topSongwriters[0].uniqueActors, 2);

  assert.equal(report.topSongwriters[1].songwriterStyle, 'nga-caravan');
  assert.equal(report.topSongwriters[1].label, ngaExpected);
  assert.equal(report.topSongwriters[1].totalCount, 1);

  assert.equal(report.topGenres[0].thaiGenre, 'thai-rock');
  assert.equal(report.topGenres[0].count, 3);
  assert.equal(report.topDialects[0].lyricDialect, 'standard');
  assert.equal(report.topDialects[0].count, 2);
});

test('recordUsageEventsServer: degrades gracefully on missing table (PGRST205/404) and writes cleanly when ready', async () => {
  const event = sanitizeAnalyticsEvent({
    eventName: 'arranger_auto_arrange',
    category: 'feature',
    songwriterStyle: 'kob-bigass',
    thaiGenre: 'thai-rock',
  });
  assert.ok(event);

  const missingTableFetch: FetchLike = async () =>
    new Response(
      JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.app_usage_events'" }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );

  const notReadyRes = await recordUsageEventsServer(
    [{ event, anonIdFallback: 'dme_guest_abc' }],
    { config: makeTestConfig(), fetchFn: missingTableFetch }
  );
  assert.deepEqual(notReadyRes, {
    ok: true,
    stored: false,
    count: 0,
    reason: 'table-not-ready',
  });

  let capturedHeaders: Record<string, string> = {};
  let capturedBody: StoredUsageRow[] = [];
  const okFetch: FetchLike = async (_url, init) => {
    capturedHeaders = (init?.headers as Record<string, string>) ?? {};
    capturedBody = JSON.parse(String(init?.body ?? '[]')) as StoredUsageRow[];
    return new Response('', { status: 201 });
  };

  const okRes = await recordUsageEventsServer(
    [{ event, userId: 'user-123', anonIdFallback: 'dme_guest_abc' }],
    { config: makeTestConfig(), fetchFn: okFetch }
  );
  assert.deepEqual(okRes, { ok: true, stored: true, count: 1 });
  assert.equal(capturedHeaders.apikey, 'sb_secret_test_service_role_key');
  assert.equal(capturedHeaders.Authorization, undefined);
  assert.equal(capturedBody[0].event_name, 'arranger_auto_arrange');
  assert.equal(capturedBody[0].user_id, 'user-123');
  assert.equal(capturedBody[0].is_authenticated, true);
  assert.equal(capturedBody[0].songwriter_style, 'kob-bigass');
});

test('POST /api/analytics/track: validates payload and records Guest + Authenticated batches', async () => {
  const config = makeTestConfig();

  const badJsonReq = new Request('http://localhost/api/analytics/track', {
    method: 'POST',
    body: '{not-json',
  });
  const badJsonRes = await handleTrackAnalyticsRequest(badJsonReq, { config });
  assert.equal(badJsonRes.status, 400);

  const invalidEventsReq = new Request('http://localhost/api/analytics/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: [{ eventName: 'BAD EVENT' }] }),
  });
  const invalidEventsRes = await handleTrackAnalyticsRequest(invalidEventsReq, { config });
  assert.equal(invalidEventsRes.status, 400);

  const insertedPayloads: StoredUsageRow[][] = [];
  const mockFetch: FetchLike = async (url, init) => {
    const urlStr = String(url);
    if (urlStr.endsWith('/auth/v1/user')) {
      return new Response(
        JSON.stringify({ id: 'auth-user-777', email: 'singer@example.com' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.endsWith('/rest/v1/app_usage_events')) {
      insertedPayloads.push(JSON.parse(String(init?.body ?? '[]')) as StoredUsageRow[]);
      return new Response('', { status: 201 });
    }
    return new Response('Not found', { status: 404 });
  };

  // Guest request with x-dme-anon-id
  const guestReq = new Request('http://localhost/api/analytics/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [ANALYTICS_HEADER_ANON_ID]: 'dme_guest_999',
    },
    body: JSON.stringify({
      eventName: 'select_songwriter_style',
      category: 'style',
      songwriterStyle: 'nga-caravan',
      thaiGenre: 'phuea-chiwit',
    }),
  });
  const guestRes = await handleTrackAnalyticsRequest(guestReq, { config, fetchFn: mockFetch });
  assert.equal(guestRes.status, 200);
  const guestJson = (await guestRes.json()) as { ok: boolean; accepted: number; stored: boolean };
  assert.deepEqual(guestJson, { ok: true, accepted: 1, stored: true });
  assert.equal(insertedPayloads[0][0].anon_id, 'dme_guest_999');
  assert.equal(insertedPayloads[0][0].user_id, null);
  assert.equal(insertedPayloads[0][0].is_authenticated, false);

  // Authenticated batch request with Bearer token
  const authReq = new Request('http://localhost/api/analytics/track', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer mock-jwt-token',
      [ANALYTICS_HEADER_ANON_ID]: 'dme_guest_999',
    },
    body: JSON.stringify({
      events: [
        { eventName: 'export_mp3', category: 'export', featureVariant: 'full_mix' },
        { eventName: 'share_link_copied', category: 'export' },
      ],
    }),
  });
  const authRes = await handleTrackAnalyticsRequest(authReq, { config, fetchFn: mockFetch });
  assert.equal(authRes.status, 200);
  const authJson = (await authRes.json()) as { ok: boolean; accepted: number; stored: boolean };
  assert.deepEqual(authJson, { ok: true, accepted: 2, stored: true });
  assert.equal(insertedPayloads[1].length, 2);
  assert.equal(insertedPayloads[1][0].user_id, 'auth-user-777');
  assert.equal(insertedPayloads[1][0].is_authenticated, true);
});

test('GET /api/analytics/summary: enforces key auth, handles missing table, and returns ranked report', async () => {
  const config = makeTestConfig();
  const adminKey = 'my-secret-analytics-key';

  // 1. Unauthorized without key
  const noAuthRes = await handleGetAnalyticsSummaryRequest(
    new Request('https://demo-maker-easy.vercel.app/api/analytics/summary'),
    { adminKey, config }
  );
  assert.equal(noAuthRes.status, 401);

  // 2. Unauthorized with wrong key
  const wrongKeyRes = await handleGetAnalyticsSummaryRequest(
    new Request('https://demo-maker-easy.vercel.app/api/analytics/summary', {
      headers: { 'x-analytics-key': 'wrong-key' },
    }),
    { adminKey, config }
  );
  assert.equal(wrongKeyRes.status, 401);

  // 3. Table not ready returns 200 with tableReady: false
  const notReadyFetch: FetchLike = async () =>
    new Response(JSON.stringify({ code: 'PGRST205', message: 'table missing' }), { status: 404 });
  const notReadyRes = await handleGetAnalyticsSummaryRequest(
    new Request('https://demo-maker-easy.vercel.app/api/analytics/summary?days=14', {
      headers: { 'x-analytics-key': adminKey },
    }),
    { adminKey, config, fetchFn: notReadyFetch }
  );
  assert.equal(notReadyRes.status, 200);
  const notReadyBody = (await notReadyRes.json()) as {
    ok: boolean;
    tableReady: boolean;
    windowDays: number;
    summary: { totalEvents: number };
  };
  assert.equal(notReadyBody.ok, true);
  assert.equal(notReadyBody.tableReady, false);
  assert.equal(notReadyBody.windowDays, 14);
  assert.equal(notReadyBody.summary.totalEvents, 0);

  // 4. Ranked summary via Bearer key + days clamped to max 90
  const rows: StoredUsageRow[] = [
    {
      event_name: 'ai_hum_to_song',
      category: 'ai',
      anon_id: 'dme_1',
      is_authenticated: false,
      songwriter_style: 'kob-bigass',
      thai_genre: 'thai-rock',
      credits_cost: 3,
      metadata: {},
      created_at: '2026-11-15T12:00:00Z',
    },
    {
      event_name: 'ai_hum_to_song',
      category: 'ai',
      user_id: 'u_2',
      is_authenticated: true,
      songwriter_style: 'kob-bigass',
      thai_genre: 'thai-rock',
      credits_cost: 3,
      metadata: {},
      created_at: '2026-11-15T13:00:00Z',
    },
  ];

  const readyFetch: FetchLike = async () =>
    new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  const readyRes = await handleGetAnalyticsSummaryRequest(
    new Request('https://demo-maker-easy.vercel.app/api/analytics/summary?days=365', {
      headers: { Authorization: `Bearer ${adminKey}` },
    }),
    { adminKey, config, fetchFn: readyFetch, nowMs: Date.parse('2026-11-15T14:00:00Z') }
  );
  assert.equal(readyRes.status, 200);
  const readyBody = (await readyRes.json()) as {
    ok: boolean;
    tableReady: boolean;
    windowDays: number;
    summary: {
      totalEvents: number;
      topFeatures: Array<{ eventName: string; count: number }>;
      topSongwriters: Array<{ songwriterStyle: string; totalCount: number }>;
    };
  };
  assert.equal(readyBody.ok, true);
  assert.equal(readyBody.tableReady, true);
  assert.equal(readyBody.windowDays, 90);
  assert.equal(readyBody.summary.totalEvents, 2);
  assert.equal(readyBody.summary.topFeatures[0].eventName, 'ai_hum_to_song');
  assert.equal(readyBody.summary.topFeatures[0].count, 2);
  assert.equal(readyBody.summary.topSongwriters[0].songwriterStyle, 'kob-bigass');
  assert.equal(readyBody.summary.topSongwriters[0].totalCount, 2);
});

test('GET /api/analytics/summary: supports Google JWT admin allowlist and rejects non-admin emails', async () => {
  const config = makeTestConfig();
  const fakeJwt = 'header.payload.signature';

  assert.deepEqual(
    parseAdminEmails('Owner@Example.com, co@example.com ; OWNER@example.com invalid-no-at'),
    ['owner@example.com', 'co@example.com']
  );

  const makeAuthAndDbFetch = (email: string): FetchLike => async (url) => {
    const urlStr = String(url);
    if (urlStr.endsWith('/auth/v1/user')) {
      return new Response(
        JSON.stringify({ id: 'google-admin-1', email }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (urlStr.includes('/rest/v1/app_usage_events')) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Unauthorized', { status: 401 });
  };

  // 1. Admin email list empty -> 403 ADMIN_EMAILS_NOT_CONFIGURED with viewerEmail hint
  const noListRes = await handleGetAnalyticsSummaryRequest(
    new Request('https://demo-maker-easy.vercel.app/api/analytics/summary', {
      headers: { Authorization: `Bearer ${fakeJwt}` },
    }),
    { adminKey: 'secret-key', adminEmails: '', config, fetchFn: makeAuthAndDbFetch('owner@example.com') }
  );
  assert.equal(noListRes.status, 403);
  const noListBody = (await noListRes.json()) as { code: string; viewerEmail?: string };
  assert.equal(noListBody.code, 'ADMIN_EMAILS_NOT_CONFIGURED');
  assert.equal(noListBody.viewerEmail, 'owner@example.com');

  // 2. Non-admin email -> 403 ANALYTICS_FORBIDDEN
  const forbiddenRes = await handleGetAnalyticsSummaryRequest(
    new Request('https://demo-maker-easy.vercel.app/api/analytics/summary', {
      headers: { Authorization: `Bearer ${fakeJwt}` },
    }),
    {
      adminKey: 'secret-key',
      adminEmails: 'owner@example.com',
      config,
      fetchFn: makeAuthAndDbFetch('customer@example.com'),
    }
  );
  assert.equal(forbiddenRes.status, 403);
  const forbiddenBody = (await forbiddenRes.json()) as { code: string };
  assert.equal(forbiddenBody.code, 'ANALYTICS_FORBIDDEN');

  // 3. Allowed Google admin email (case-insensitive) -> 200 google-admin
  const okRes = await handleGetAnalyticsSummaryRequest(
    new Request('https://demo-maker-easy.vercel.app/api/analytics/summary?days=7', {
      headers: { Authorization: `Bearer ${fakeJwt}` },
    }),
    {
      adminKey: 'secret-key',
      adminEmails: 'OWNER@Example.com',
      config,
      fetchFn: makeAuthAndDbFetch('owner@example.com'),
    }
  );
  assert.equal(okRes.status, 200);
  const okBody = (await okRes.json()) as {
    ok: boolean;
    authMethod: string;
    viewerEmail: string;
    windowDays: number;
  };
  assert.equal(okBody.ok, true);
  assert.equal(okBody.authMethod, 'google-admin');
  assert.equal(okBody.viewerEmail, 'owner@example.com');
  assert.equal(okBody.windowDays, 7);
});

test('analyticsLabels: formats readable Thai labels and provides valid SQL snippet', () => {
  const easyInfo = getReadableFeatureInfo('ai_easy_mode_architect', 'ai');
  assert.ok(easyInfo.titleTh.includes('Easy Mode'));

  const unknownInfo = getReadableFeatureInfo('custom_new_button', 'feature');
  assert.equal(unknownInfo.titleTh, 'custom_new_button');

  const kobLabel = getReadableSongwriterLabel('kob-bigass');
  assert.ok(kobLabel.includes('กบ') || kobLabel.includes('Big Ass') || kobLabel.length > 0);
  assert.equal(kobLabel.startsWith('แรงบันดาลใจ:'), false);

  assert.ok(getReadableGenreLabel('thai-rock').includes('ไทยร็อก'));
  assert.ok(getReadableDialectLabel('isan').includes('อีสาน'));

  assert.ok(ANALYTICS_MIGRATION_SQL.includes('CREATE TABLE IF NOT EXISTS public.app_usage_events'));
  assert.ok(ANALYTICS_MIGRATION_SQL.includes('analytics_top_features'));
  assert.ok(ANALYTICS_MIGRATION_SQL.includes('analytics_top_songwriters'));
});
