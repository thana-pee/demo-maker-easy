import {
  SONGWRITER_STYLE_PROFILES,
  THAI_DIALECT_PROFILES,
  THAI_GENRE_PROFILES,
} from './aiPrompts';

export const ADMIN_ANALYTICS_KEY_SESSION_KEY = 'demo_maker_admin_analytics_key_v1';
export const ADMIN_ANALYTICS_KEY_LOCAL_KEY = 'demo_maker_admin_analytics_key_persist_v1';
export const ADMIN_ANALYTICS_UNLOCKED_KEY = 'demo_maker_admin_analytics_unlocked_v1';

export interface ReadableFeatureInfo {
  titleTh: string;
  titleEn: string;
  icon: string;
  badgeTh: string;
  badgeEn: string;
}

const FEATURE_LABELS: Record<string, ReadableFeatureInfo> = {
  ai_easy_mode_architect: {
    titleTh: 'Easy Mode — สร้างทั้งเพลงด้วย AI',
    titleEn: 'Easy Mode AI Architect',
    icon: '🪄',
    badgeTh: 'AI สร้างเพลง',
    badgeEn: 'AI Gen',
  },
  ai_hum_to_song: {
    titleTh: 'Hum-to-Song — ฮัมเสียงเป็นเพลง',
    titleEn: 'Hum-to-Song AI',
    icon: '🎙️',
    badgeTh: 'AI ฮัมทำนอง',
    badgeEn: 'AI Hum',
  },
  ai_lyrics_quick: {
    titleTh: 'แต่งเนื้อเพลง AI (Quick)',
    titleEn: 'AI Lyrics (Quick)',
    icon: '✍️',
    badgeTh: 'AI เนื้อเพลง',
    badgeEn: 'AI Lyrics',
  },
  ai_lyrics_deep: {
    titleTh: 'แต่งเนื้อเพลง + เมโลดี้ AI (Deep)',
    titleEn: 'AI Lyrics + Melody (Deep)',
    icon: '🎼',
    badgeTh: 'AI ลึก',
    badgeEn: 'AI Deep',
  },
  ai_lyrics_single_bar: {
    titleTh: 'สุ่ม 3 ตัวเลือกแก้เนื้อรายห้อง',
    titleEn: 'Single-Bar 3 Variations',
    icon: '🎲',
    badgeTh: 'AI รายห้อง',
    badgeEn: 'AI Bar',
  },
  ai_tts_vocal_cue: {
    titleTh: 'ร้องไกด์ด้วย AI (TTS Vocals)',
    titleEn: 'AI Guide Vocals (TTS)',
    icon: '🎤',
    badgeTh: 'AI เสียงร้อง',
    badgeEn: 'AI Vocals',
  },
  ai_studio_director: {
    titleTh: 'AI Studio Director (สั่งแก้ทั้งวง)',
    titleEn: 'AI Studio Director',
    icon: '🎚️',
    badgeTh: 'AI ปรับวง',
    badgeEn: 'AI Director',
  },
  ai_reference_track_lyria: {
    titleTh: 'AI Studio Master (Lyria 3.5)',
    titleEn: 'AI Studio Master (Lyria 3.5)',
    icon: '✨',
    badgeTh: 'AI Master',
    badgeEn: 'AI Master',
  },
  select_songwriter_style: {
    titleTh: 'กดเลือกสไตล์นักแต่งเพลง',
    titleEn: 'Select Songwriter Style',
    icon: '🖋️',
    badgeTh: 'เลือกสไตล์',
    badgeEn: 'Style Picker',
  },
  arranger_auto_arrange: {
    titleTh: 'จัดวงอัตโนมัติตามสไตล์ (0 Cr)',
    titleEn: 'Auto-Arrange Band (0 Cr)',
    icon: '🎸',
    badgeTh: 'เครื่องมือฟรี',
    badgeEn: 'Free Tool',
  },
  vocal_booth_record: {
    titleTh: 'อัดเสียงร้องจริง (Vocal Booth)',
    titleEn: 'Vocal Booth Recording',
    icon: '🎧',
    badgeTh: 'อัดร้อง',
    badgeEn: 'Vocal',
  },
  vocal_mic_save: {
    titleTh: 'อัดเสียงร้องรายห้อง (ไมค์)',
    titleEn: 'Single-Bar Mic Save',
    icon: '🎙️',
    badgeTh: 'อัดร้อง',
    badgeEn: 'Vocal',
  },
  switch_view_mode: {
    titleTh: 'สลับโหมดหน้าจอ (แต่ง/เรียบเรียง/คาราโอเกะ)',
    titleEn: 'Switch Studio View Mode',
    icon: '🖥️',
    badgeTh: 'การนำทาง',
    badgeEn: 'Navigation',
  },
  export_mp3: {
    titleTh: 'Export ไฟล์เสียง MP3 (192 kbps)',
    titleEn: 'Export MP3 Mixdown',
    icon: '💿',
    badgeTh: 'Export',
    badgeEn: 'Export',
  },
  export_midi: {
    titleTh: 'Export MIDI เข้า DAW',
    titleEn: 'Export MIDI',
    icon: '🎹',
    badgeTh: 'Export',
    badgeEn: 'Export',
  },
  export_lrc: {
    titleTh: 'Export เนื้อร้องคาราโอเกะ (.lrc)',
    titleEn: 'Export .LRC Lyrics',
    icon: '📝',
    badgeTh: 'Export',
    badgeEn: 'Export',
  },
  export_lyrics_txt: {
    titleTh: 'Export เนื้อเพลง+คอร์ด (.txt)',
    titleEn: 'Export Lyrics .TXT',
    icon: '📄',
    badgeTh: 'Export',
    badgeEn: 'Export',
  },
  export_json_backup: {
    titleTh: 'สำรองไฟล์โปรเจกต์ (.json)',
    titleEn: 'Backup Project JSON',
    icon: '💾',
    badgeTh: 'Export',
    badgeEn: 'Export',
  },
  suno_prompt_copied: {
    titleTh: 'คัดลอก Prompt + เนื้อเพลงไป Suno',
    titleEn: 'Copy Suno Full Prompt',
    icon: '📋',
    badgeTh: 'Suno Share',
    badgeEn: 'Share',
  },
  suno_tags_copied: {
    titleTh: 'คัดลอก Style Tags ไป Suno',
    titleEn: 'Copy Suno Style Tags',
    icon: '🏷️',
    badgeTh: 'Suno Share',
    badgeEn: 'Share',
  },
  share_link_copied: {
    titleTh: 'คัดลอกลิงก์แชร์เพลง',
    titleEn: 'Copy Song Share Link',
    icon: '🔗',
    badgeTh: 'Share Link',
    badgeEn: 'Share',
  },
  billing_topup_verified: {
    titleTh: 'เติมเครดิต PromptPay สำเร็จ',
    titleEn: 'PromptPay Top-up Verified',
    icon: '💳',
    badgeTh: 'Billing',
    badgeEn: 'Billing',
  },
  app_session_start: {
    titleTh: 'เปิดเข้าใช้งานสตูดิโอ (Session)',
    titleEn: 'Studio Session Started',
    icon: '🚀',
    badgeTh: 'Session',
    badgeEn: 'Session',
  },
};

const CATEGORY_FALLBACK_BADGE: Record<string, { badgeTh: string; badgeEn: string; icon: string }> = {
  ai: { badgeTh: 'AI', badgeEn: 'AI', icon: '✨' },
  style: { badgeTh: 'สไตล์', badgeEn: 'Style', icon: '🎨' },
  export: { badgeTh: 'Export', badgeEn: 'Export', icon: '📤' },
  vocal: { badgeTh: 'อัดร้อง', badgeEn: 'Vocal', icon: '🎤' },
  billing: { badgeTh: 'เครดิต', badgeEn: 'Billing', icon: '💳' },
  session: { badgeTh: 'Session', badgeEn: 'Session', icon: '🚀' },
  feature: { badgeTh: 'ฟีเจอร์', badgeEn: 'Feature', icon: '🎛️' },
};

const GENRE_MAP = new Map<string, string>(THAI_GENRE_PROFILES.map((g) => [g.id, g.label]));
const DIALECT_MAP = new Map<string, string>(THAI_DIALECT_PROFILES.map((d) => [d.id, d.label]));
const SONGWRITER_MAP = new Map<string, string>(SONGWRITER_STYLE_PROFILES.map((s) => [s.id, s.label]));

const VIEW_MODE_LABELS: Record<string, string> = {
  songwriter: '✍️ โหมดแต่งเพลง (Songwriter)',
  arranger: '🎛️ โหมดเรียบเรียงวง (Arranger)',
  karaoke: '🎤 โหมดคาราโอเกะ (Teleprompter)',
};

export function getReadableFeatureInfo(eventName: string, category = 'feature'): ReadableFeatureInfo {
  const clean = eventName.trim().toLowerCase();
  if (FEATURE_LABELS[clean]) {
    return FEATURE_LABELS[clean];
  }
  const cat = CATEGORY_FALLBACK_BADGE[category] ?? CATEGORY_FALLBACK_BADGE.feature;
  return {
    titleTh: eventName,
    titleEn: eventName,
    icon: cat.icon,
    badgeTh: cat.badgeTh,
    badgeEn: cat.badgeEn,
  };
}

export function getReadableSongwriterLabel(songwriterId: string, fallbackLabel?: string): string {
  const raw = SONGWRITER_MAP.get(songwriterId) ?? fallbackLabel ?? songwriterId;
  return raw.replace(/^แรงบันดาลใจ:\s*/u, '');
}

export function getReadableGenreLabel(genreId: string): string {
  return GENRE_MAP.get(genreId) ?? genreId;
}

export function getReadableDialectLabel(dialectId: string): string {
  return DIALECT_MAP.get(dialectId) ?? dialectId;
}

export function getReadableViewModeLabel(viewMode: string): string {
  return VIEW_MODE_LABELS[viewMode] ?? viewMode;
}

export function isAdminAnalyticsUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem(ADMIN_ANALYTICS_UNLOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

export const ANALYTICS_MIGRATION_SQL = `CREATE TABLE IF NOT EXISTS public.app_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  category text NOT NULL DEFAULT 'feature',
  anon_id text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_authenticated boolean NOT NULL DEFAULT false,
  songwriter_style text,
  thai_genre text,
  lyric_dialect text,
  lyric_era text,
  emotional_resolution text,
  view_mode text,
  feature_variant text,
  is_simulated boolean,
  credits_cost integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_usage_events_created_at
  ON public.app_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_usage_events_name_created
  ON public.app_usage_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_usage_events_songwriter_created
  ON public.app_usage_events (songwriter_style, created_at DESC)
  WHERE songwriter_style IS NOT NULL AND songwriter_style <> 'none';
CREATE INDEX IF NOT EXISTS idx_app_usage_events_genre_created
  ON public.app_usage_events (thai_genre, created_at DESC)
  WHERE thai_genre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_app_usage_events_anon_created
  ON public.app_usage_events (anon_id, created_at DESC);

ALTER TABLE public.app_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_usage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_usage_events TO service_role;

CREATE OR REPLACE VIEW public.analytics_top_features AS
SELECT
  event_name,
  category,
  count(*)::bigint AS total_events,
  count(DISTINCT COALESCE(user_id::text, anon_id, id::text))::bigint AS unique_users,
  count(*) FILTER (WHERE is_authenticated)::bigint AS logged_in_events,
  count(*) FILTER (WHERE NOT is_authenticated)::bigint AS guest_events,
  count(*) FILTER (WHERE created_at >= now() - interval '7 days')::bigint AS events_last_7d,
  count(*) FILTER (WHERE created_at >= now() - interval '30 days')::bigint AS events_last_30d,
  max(created_at) AS last_seen_at
FROM public.app_usage_events
GROUP BY event_name, category
ORDER BY total_events DESC;

CREATE OR REPLACE VIEW public.analytics_top_songwriters AS
SELECT
  songwriter_style,
  count(*)::bigint AS total_uses,
  count(*) FILTER (WHERE category = 'ai')::bigint AS ai_generation_uses,
  count(*) FILTER (WHERE event_name = 'select_songwriter_style')::bigint AS ui_picker_selects,
  count(DISTINCT COALESCE(user_id::text, anon_id, id::text))::bigint AS unique_users,
  count(*) FILTER (WHERE created_at >= now() - interval '30 days')::bigint AS uses_last_30d,
  max(created_at) AS last_used_at
FROM public.app_usage_events
WHERE songwriter_style IS NOT NULL AND songwriter_style <> '' AND songwriter_style <> 'none'
GROUP BY songwriter_style
ORDER BY total_uses DESC;

CREATE OR REPLACE VIEW public.analytics_top_genres_dialects AS
SELECT
  COALESCE(NULLIF(thai_genre, ''), 'unspecified') AS thai_genre,
  COALESCE(NULLIF(lyric_dialect, ''), 'standard') AS lyric_dialect,
  count(*)::bigint AS total_uses,
  count(DISTINCT COALESCE(user_id::text, anon_id, id::text))::bigint AS unique_users,
  max(created_at) AS last_used_at
FROM public.app_usage_events
WHERE thai_genre IS NOT NULL OR lyric_dialect IS NOT NULL
GROUP BY 1, 2
ORDER BY total_uses DESC;

REVOKE ALL ON public.analytics_top_features FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.analytics_top_songwriters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.analytics_top_genres_dialects FROM PUBLIC, anon, authenticated;`;
