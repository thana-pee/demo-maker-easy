import { SONGWRITER_STYLE_PROFILES } from './aiPrompts';
import {
  ANALYTICS_HEADER_ANON_ID,
  sanitizeAnalyticsEvent,
  type AnalyticsEventInput,
  type SanitizedAnalyticsEvent,
} from './analytics';
import {
  extractBearerToken,
  getServerBillingConfig,
  getServiceRoleHeaders,
  verifySupabaseUserFromRequest,
  type FetchLike,
  type ServerBillingConfig,
} from './serverWallet';

export interface StoredUsageRowInput {
  event_name: string;
  category: string;
  anon_id?: string | null;
  user_id?: string | null;
  is_authenticated: boolean;
  songwriter_style?: string | null;
  thai_genre?: string | null;
  lyric_dialect?: string | null;
  lyric_era?: string | null;
  emotional_resolution?: string | null;
  view_mode?: string | null;
  feature_variant?: string | null;
  is_simulated?: boolean | null;
  credits_cost: number;
  metadata: Record<string, string | number | boolean>;
}

export interface StoredUsageRow extends StoredUsageRowInput {
  id?: string;
  created_at?: string;
}

export interface RecordAnalyticsResult {
  ok: boolean;
  stored: boolean;
  count: number;
  reason?: string;
}

export interface FeatureRankingItem {
  eventName: string;
  category: string;
  count: number;
  uniqueActors: number;
  guestCount: number;
  authenticatedCount: number;
  lastSeenAt?: string;
}

export interface SongwriterRankingItem {
  songwriterStyle: string;
  label: string;
  totalCount: number;
  aiGenerationCount: number;
  pickerSelectCount: number;
  uniqueActors: number;
}

export interface AnalyticsSummaryReport {
  totalEvents: number;
  uniqueActors: number;
  guestEvents: number;
  authenticatedEvents: number;
  topFeatures: FeatureRankingItem[];
  topSongwriters: SongwriterRankingItem[];
  topGenres: Array<{ thaiGenre: string; count: number; uniqueActors: number }>;
  topDialects: Array<{ lyricDialect: string; count: number; uniqueActors: number }>;
  topViewModes: Array<{ viewMode: string; count: number; uniqueActors: number }>;
}

const SONGWRITER_LABEL_BY_ID = new Map(
  SONGWRITER_STYLE_PROFILES.map((profile) => [profile.id as string, profile.label])
);

function isMissingTableError(status: number, bodyText: string): boolean {
  if (status === 404) return true;
  const lower = bodyText.toLowerCase();
  return (
    lower.includes('pgrst205') ||
    lower.includes('42p01') ||
    lower.includes('could not find the table') ||
    (lower.includes('app_usage_events') && lower.includes('does not exist'))
  );
}

export function toStoredUsageRow(
  event: SanitizedAnalyticsEvent,
  context?: { userId?: string; anonIdFallback?: string }
): StoredUsageRowInput {
  const effectiveUserId = context?.userId?.trim() || undefined;
  const effectiveAnonId = event.anonId || context?.anonIdFallback?.trim() || undefined;
  return {
    event_name: event.eventName,
    category: event.category,
    anon_id: effectiveAnonId ?? null,
    user_id: effectiveUserId ?? null,
    is_authenticated: Boolean(effectiveUserId),
    songwriter_style: event.songwriterStyle ?? null,
    thai_genre: event.thaiGenre ?? null,
    lyric_dialect: event.lyricDialect ?? null,
    lyric_era: event.lyricEra ?? null,
    emotional_resolution: event.emotionalResolution ?? null,
    view_mode: event.viewMode ?? null,
    feature_variant: event.featureVariant ?? null,
    is_simulated: typeof event.isSimulated === 'boolean' ? event.isSimulated : null,
    credits_cost: event.creditsCost,
    metadata: event.metadata,
  };
}

/** บันทึก Event ลงตาราง Postgres app_usage_events ฝั่ง Server (เสถียรและไม่ Crash หากยังไม่รัน SQL) */
export async function recordUsageEventsServer(
  events: Array<{ event: SanitizedAnalyticsEvent; userId?: string; anonIdFallback?: string }>,
  options?: { fetchFn?: FetchLike; config?: ServerBillingConfig }
): Promise<RecordAnalyticsResult> {
  if (events.length === 0) {
    return { ok: true, stored: false, count: 0, reason: 'empty' };
  }

  const config = options?.config ?? getServerBillingConfig();
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    return { ok: true, stored: false, count: 0, reason: 'supabase-not-configured' };
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const rows = events.map(({ event, userId, anonIdFallback }) =>
    toStoredUsageRow(event, { userId, anonIdFallback })
  );

  try {
    const headers: Record<string, string> = {
      ...getServiceRoleHeaders(config),
      Prefer: 'return=minimal',
    };
    const res = await fetchFn(`${config.supabaseUrl}/rest/v1/app_usage_events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    });

    if (res.ok) {
      return { ok: true, stored: true, count: rows.length };
    }

    const errText = await res.text().catch(() => '');
    if (isMissingTableError(res.status, errText)) {
      return { ok: true, stored: false, count: 0, reason: 'table-not-ready' };
    }

    return {
      ok: false,
      stored: false,
      count: 0,
      reason: `supabase-http-${res.status}`,
    };
  } catch {
    return { ok: true, stored: false, count: 0, reason: 'network-error' };
  }
}

/** บันทึก Event การใช้งานจาก API Route (รันแบบจำกัดเวลาไม่เกิน 1.2s เพื่อไม่หน่วง API) */
export async function recordServerFeatureEvent(
  request: Request,
  input: AnalyticsEventInput,
  options?: {
    userId?: string;
    skipAuthLookup?: boolean;
    fetchFn?: FetchLike;
    config?: ServerBillingConfig;
    timeoutMs?: number;
  }
): Promise<RecordAnalyticsResult> {
  const clean = sanitizeAnalyticsEvent(input);
  if (!clean) {
    return { ok: true, stored: false, count: 0, reason: 'invalid-event' };
  }

  const config = options?.config ?? getServerBillingConfig();
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    return { ok: true, stored: false, count: 0, reason: 'supabase-not-configured' };
  }

  const timeoutMs = options?.timeoutMs ?? 1200;
  const run = async (): Promise<RecordAnalyticsResult> => {
    const anonHeader = request.headers.get(ANALYTICS_HEADER_ANON_ID)?.trim() || undefined;
    let userId = options?.userId?.trim() || undefined;

    if (!userId && !options?.skipAuthLookup && extractBearerToken(request)) {
      const auth = await verifySupabaseUserFromRequest(request, {
        config,
        fetchFn: options?.fetchFn,
      });
      if (auth.ok) {
        userId = auth.user.id;
      }
    }

    return recordUsageEventsServer(
      [{ event: clean, userId, anonIdFallback: anonHeader }],
      { config, fetchFn: options?.fetchFn }
    );
  };

  try {
    if (timeoutMs <= 0) {
      return await run();
    }
    return await Promise.race([
      run(),
      new Promise<RecordAnalyticsResult>((resolve) =>
        setTimeout(
          () => resolve({ ok: true, stored: false, count: 0, reason: 'timeout' }),
          timeoutMs
        )
      ),
    ]);
  } catch {
    return { ok: true, stored: false, count: 0, reason: 'error' };
  }
}

function actorKeyOf(row: StoredUsageRow, fallbackIdx: number): string {
  if (row.user_id) return `u:${row.user_id}`;
  if (row.anon_id) return `a:${row.anon_id}`;
  if (row.id) return `r:${row.id}`;
  return `idx:${fallbackIdx}`;
}

/** รวมผลจัดอันดับฟังก์ชันยอดนิยม & สไตล์นักแต่งเพลงยอดนิยมจากแถว Event (Pure Function) */
export function summarizeUsageRows(rows: StoredUsageRow[]): AnalyticsSummaryReport {
  const uniqueActorSet = new Set<string>();
  let guestEvents = 0;
  let authenticatedEvents = 0;

  const featureMap = new Map<
    string,
    {
      eventName: string;
      category: string;
      count: number;
      actors: Set<string>;
      guestCount: number;
      authenticatedCount: number;
      lastSeenAt?: string;
    }
  >();

  const songwriterMap = new Map<
    string,
    {
      songwriterStyle: string;
      totalCount: number;
      aiGenerationCount: number;
      pickerSelectCount: number;
      actors: Set<string>;
    }
  >();

  const genreMap = new Map<string, { thaiGenre: string; count: number; actors: Set<string> }>();
  const dialectMap = new Map<string, { lyricDialect: string; count: number; actors: Set<string> }>();
  const viewModeMap = new Map<string, { viewMode: string; count: number; actors: Set<string> }>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const actor = actorKeyOf(row, i);
    uniqueActorSet.add(actor);

    if (row.is_authenticated) {
      authenticatedEvents++;
    } else {
      guestEvents++;
    }

    const featKey = `${row.event_name}::${row.category || 'feature'}`;
    const featEntry = featureMap.get(featKey) ?? {
      eventName: row.event_name,
      category: row.category || 'feature',
      count: 0,
      actors: new Set<string>(),
      guestCount: 0,
      authenticatedCount: 0,
      lastSeenAt: row.created_at,
    };
    featEntry.count++;
    featEntry.actors.add(actor);
    if (row.is_authenticated) featEntry.authenticatedCount++;
    else featEntry.guestCount++;
    if (row.created_at && (!featEntry.lastSeenAt || row.created_at > featEntry.lastSeenAt)) {
      featEntry.lastSeenAt = row.created_at;
    }
    featureMap.set(featKey, featEntry);

    if (
      row.songwriter_style &&
      row.songwriter_style.trim() &&
      row.songwriter_style !== 'none'
    ) {
      const styleId = row.songwriter_style.trim();
      const sw = songwriterMap.get(styleId) ?? {
        songwriterStyle: styleId,
        totalCount: 0,
        aiGenerationCount: 0,
        pickerSelectCount: 0,
        actors: new Set<string>(),
      };
      sw.totalCount++;
      if (row.category === 'ai') sw.aiGenerationCount++;
      if (row.event_name === 'select_songwriter_style') sw.pickerSelectCount++;
      sw.actors.add(actor);
      songwriterMap.set(styleId, sw);
    }

    if (row.thai_genre && row.thai_genre.trim()) {
      const gId = row.thai_genre.trim();
      const g = genreMap.get(gId) ?? { thaiGenre: gId, count: 0, actors: new Set<string>() };
      g.count++;
      g.actors.add(actor);
      genreMap.set(gId, g);
    }

    if (row.lyric_dialect && row.lyric_dialect.trim()) {
      const dId = row.lyric_dialect.trim();
      const d = dialectMap.get(dId) ?? { lyricDialect: dId, count: 0, actors: new Set<string>() };
      d.count++;
      d.actors.add(actor);
      dialectMap.set(dId, d);
    }

    if (row.view_mode && row.view_mode.trim()) {
      const vm = row.view_mode.trim();
      const entry = viewModeMap.get(vm) ?? { viewMode: vm, count: 0, actors: new Set<string>() };
      entry.count++;
      entry.actors.add(actor);
      viewModeMap.set(vm, entry);
    }
  }

  const topFeatures = Array.from(featureMap.values())
    .map((item) => ({
      eventName: item.eventName,
      category: item.category,
      count: item.count,
      uniqueActors: item.actors.size,
      guestCount: item.guestCount,
      authenticatedCount: item.authenticatedCount,
      ...(item.lastSeenAt ? { lastSeenAt: item.lastSeenAt } : {}),
    }))
    .sort((a, b) => b.count - a.count);

  const topSongwriters = Array.from(songwriterMap.values())
    .map((item) => ({
      songwriterStyle: item.songwriterStyle,
      label: SONGWRITER_LABEL_BY_ID.get(item.songwriterStyle) ?? item.songwriterStyle,
      totalCount: item.totalCount,
      aiGenerationCount: item.aiGenerationCount,
      pickerSelectCount: item.pickerSelectCount,
      uniqueActors: item.actors.size,
    }))
    .sort((a, b) => b.totalCount - a.totalCount);

  const topGenres = Array.from(genreMap.values())
    .map((item) => ({
      thaiGenre: item.thaiGenre,
      count: item.count,
      uniqueActors: item.actors.size,
    }))
    .sort((a, b) => b.count - a.count);

  const topDialects = Array.from(dialectMap.values())
    .map((item) => ({
      lyricDialect: item.lyricDialect,
      count: item.count,
      uniqueActors: item.actors.size,
    }))
    .sort((a, b) => b.count - a.count);

  const topViewModes = Array.from(viewModeMap.values())
    .map((item) => ({
      viewMode: item.viewMode,
      count: item.count,
      uniqueActors: item.actors.size,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalEvents: rows.length,
    uniqueActors: uniqueActorSet.size,
    guestEvents,
    authenticatedEvents,
    topFeatures,
    topSongwriters,
    topGenres,
    topDialects,
    topViewModes,
  };
}

/** ดึงข้อมูลสรุป Analytics ย้อนหลัง N วันจาก Postgres */
export async function fetchAnalyticsSummaryServer(options?: {
  days?: number;
  nowMs?: number;
  fetchFn?: FetchLike;
  config?: ServerBillingConfig;
}): Promise<{
  tableReady: boolean;
  windowDays: number;
  summary: AnalyticsSummaryReport;
}> {
  const days = Math.max(1, Math.min(90, Math.round(options?.days ?? 30)));
  const config = options?.config ?? getServerBillingConfig();
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    return {
      tableReady: false,
      windowDays: days,
      summary: summarizeUsageRows([]),
    };
  }

  const nowMs = options?.nowMs ?? Date.now();
  const sinceIso = new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
  const fetchFn = options?.fetchFn ?? fetch;
  const headers = getServiceRoleHeaders(config);

  const url =
    `${config.supabaseUrl}/rest/v1/app_usage_events` +
    `?select=id,event_name,category,anon_id,user_id,is_authenticated,songwriter_style,thai_genre,lyric_dialect,view_mode,created_at` +
    `&created_at=gte.${encodeURIComponent(sinceIso)}` +
    `&order=created_at.desc&limit=5000`;

  const res = await fetchFn(url, { headers });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (isMissingTableError(res.status, errText)) {
      return {
        tableReady: false,
        windowDays: days,
        summary: summarizeUsageRows([]),
      };
    }
    throw new Error(`Analytics query failed (${res.status}): ${errText}`);
  }

  const rows = (await res.json()) as StoredUsageRow[];
  return {
    tableReady: true,
    windowDays: days,
    summary: summarizeUsageRows(Array.isArray(rows) ? rows : []),
  };
}
