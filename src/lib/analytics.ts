import type {
  AppViewMode,
  SongProject,
  ThaiEmotionalResolution,
  ThaiLyricDialect,
  ThaiLyricEra,
  ThaiSongGenre,
  ThaiSongwriterStyle,
} from '@/types/song';
import { getAuthAccessToken } from './cloudSync';

export type AnalyticsCategory =
  | 'session'
  | 'feature'
  | 'style'
  | 'ai'
  | 'export'
  | 'vocal'
  | 'billing';

export interface AnalyticsEventInput {
  eventName: string;
  category?: AnalyticsCategory;
  anonId?: string;
  songwriterStyle?: ThaiSongwriterStyle | string;
  thaiGenre?: ThaiSongGenre | string;
  lyricDialect?: ThaiLyricDialect | string;
  lyricEra?: ThaiLyricEra | string;
  emotionalResolution?: ThaiEmotionalResolution | string;
  viewMode?: AppViewMode | string;
  featureVariant?: string;
  isSimulated?: boolean;
  creditsCost?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface SanitizedAnalyticsEvent {
  eventName: string;
  category: AnalyticsCategory;
  anonId?: string;
  songwriterStyle?: string;
  thaiGenre?: string;
  lyricDialect?: string;
  lyricEra?: string;
  emotionalResolution?: string;
  viewMode?: string;
  featureVariant?: string;
  isSimulated?: boolean;
  creditsCost: number;
  metadata: Record<string, string | number | boolean>;
}

export const ANALYTICS_HEADER_ANON_ID = 'x-dme-anon-id';
export const ANON_ID_STORAGE_KEY = 'demo_maker_anon_id_v1';
const SESSION_TRACKED_KEY = 'demo_maker_analytics_session_v1';

const VALID_CATEGORIES = new Set<AnalyticsCategory>([
  'session',
  'feature',
  'style',
  'ai',
  'export',
  'vocal',
  'billing',
]);

const BANNED_METADATA_KEYS = new Set([
  'email',
  'phone',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'secret',
  'lyrics',
  'prompt',
  'slip',
  'audiodataurl',
]);

const EVENT_NAME_REGEX = /^[a-z0-9_:-]{2,64}$/;

function cleanShortSlug(value: unknown, maxLen = 64): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, maxLen);
  return trimmed.length > 0 ? trimmed : undefined;
}

function scrubMetadata(raw: unknown): Record<string, string | number | boolean> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string | number | boolean> = {};
  let keyCount = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (keyCount >= 8) break;
    const cleanKey = k.trim().slice(0, 40);
    if (!cleanKey || BANNED_METADATA_KEYS.has(cleanKey.toLowerCase())) continue;
    if (typeof v === 'string') {
      out[cleanKey] = v.trim().slice(0, 120);
      keyCount++;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[cleanKey] = v;
      keyCount++;
    } else if (typeof v === 'boolean') {
      out[cleanKey] = v;
      keyCount++;
    }
  }
  return out;
}

/** ตรวจสอบและทำความสะอาดข้อมูล Event ก่อนบันทึก (ตัด PII และจำกัดขนาด) */
export function sanitizeAnalyticsEvent(raw: unknown): SanitizedAnalyticsEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const rawEvent =
    typeof obj.eventName === 'string'
      ? obj.eventName.trim().toLowerCase()
      : typeof obj.event_name === 'string'
        ? obj.event_name.trim().toLowerCase()
        : '';
  if (!EVENT_NAME_REGEX.test(rawEvent)) return null;

  const category: AnalyticsCategory =
    typeof obj.category === 'string' && VALID_CATEGORIES.has(obj.category as AnalyticsCategory)
      ? (obj.category as AnalyticsCategory)
      : 'feature';

  const rawCost = typeof obj.creditsCost === 'number' ? obj.creditsCost : Number(obj.credits_cost ?? 0);
  const creditsCost = Number.isFinite(rawCost) && rawCost >= 0 ? Math.min(1000, Math.round(rawCost)) : 0;

  return {
    eventName: rawEvent,
    category,
    anonId: cleanShortSlug(obj.anonId ?? obj.anon_id, 64),
    songwriterStyle: cleanShortSlug(obj.songwriterStyle ?? obj.songwriter_style, 48),
    thaiGenre: cleanShortSlug(obj.thaiGenre ?? obj.thai_genre, 48),
    lyricDialect: cleanShortSlug(obj.lyricDialect ?? obj.lyric_dialect, 48),
    lyricEra: cleanShortSlug(obj.lyricEra ?? obj.lyric_era, 48),
    emotionalResolution: cleanShortSlug(obj.emotionalResolution ?? obj.emotional_resolution, 48),
    viewMode: cleanShortSlug(obj.viewMode ?? obj.view_mode, 32),
    featureVariant: cleanShortSlug(obj.featureVariant ?? obj.feature_variant, 80),
    isSimulated: typeof obj.isSimulated === 'boolean' ? obj.isSimulated : undefined,
    creditsCost,
    metadata: scrubMetadata(obj.metadata),
  };
}

/** สร้างหรือดึง Anonymous Device ID ประจำเบราว์เซอร์ (ไม่ระบุตัวตน) */
export function getOrCreateAnonId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const existing = window.localStorage?.getItem(ANON_ID_STORAGE_KEY)?.trim();
    if (existing && existing.length >= 6 && existing.length <= 64) {
      return existing;
    }
    const rand =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const nextId = `dme_${rand}`;
    window.localStorage?.setItem(ANON_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch {
    return undefined;
  }
}

/** Header สำหรับแนบ Anonymous Session ID ไปกับคำขอ API ฝั่ง Server */
export function getAnalyticsHeaders(): Record<string, string> {
  const anonId = getOrCreateAnonId();
  return anonId ? { [ANALYTICS_HEADER_ANON_ID]: anonId } : {};
}

/** ส่ง Event สถิติแบบ Non-Blocking Fire-and-Forget (ไม่หน่วงหน้าจอหรือเสียงดนตรี) */
export function trackUsageEvent(input: AnalyticsEventInput): void {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  try {
    const anonId = input.anonId ?? getOrCreateAnonId();
    const clean = sanitizeAnalyticsEvent({ ...input, anonId });
    if (!clean) return;

    const accessToken = getAuthAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(anonId ? { [ANALYTICS_HEADER_ANON_ID]: anonId } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    };

    void fetch('/api/analytics/track', {
      method: 'POST',
      headers,
      body: JSON.stringify(clean),
      keepalive: true,
    }).catch(() => {
      // Never block UI or surface background telemetry errors
    });
  } catch {
    // Ignore telemetry errors cleanly
  }
}

/** บันทึกการเปิดใช้งานแอปครั้งละ 1 ครั้งต่อแท็บเบราว์เซอร์ */
export function trackSessionStartOnce(song?: Partial<SongProject>, viewMode: AppViewMode = 'songwriter'): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.sessionStorage?.getItem(SESSION_TRACKED_KEY) === '1') return;
    window.sessionStorage?.setItem(SESSION_TRACKED_KEY, '1');
    trackUsageEvent({
      eventName: 'app_session_start',
      category: 'session',
      viewMode,
      songwriterStyle: song?.songwriterStyle,
      thaiGenre: song?.thaiGenre,
      lyricDialect: song?.lyricDialect,
      lyricEra: song?.lyricEra,
      emotionalResolution: song?.emotionalResolution,
    });
  } catch {
    // Ignore storage/telemetry errors
  }
}
