-- ============================================================================
-- Phase 8: First-Party Product Analytics (Feature Usage & Songwriter Rankings)
-- ============================================================================
-- วิธีใช้: รันใน Supabase Dashboard -> SQL Editor (ปลอดภัย รันซ้ำได้ Idempotent)
-- ออกแบบมาเพื่อเก็บสถิติการใช้งานแบบ Privacy-First (ไม่เก็บอีเมลหรือเนื้อเพลง)
-- รองรับทั้งผู้ใช้โหมด Guest (anon_id แบบสุ่ม) และผู้ใช้ที่ล็อกอิน Google (user_id)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_usage_events (
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

-- ป้องกันการอ่าน/เขียนตรงจาก Browser (ให้เขียน-อ่านผ่าน Next.js Server service_role เท่านั้น)
REVOKE ALL ON public.app_usage_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_usage_events TO service_role;

-- View 1: ฟังก์ชันที่มีการใช้งานมากที่สุด (Top Features)
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

-- View 2: สไตล์นักแต่งเพลงยอดนิยม (Top Songwriter Styles)
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
WHERE songwriter_style IS NOT NULL
  AND songwriter_style <> ''
  AND songwriter_style <> 'none'
GROUP BY songwriter_style
ORDER BY total_uses DESC;

-- View 3: แนวเพลงและภาษาถิ่นยอดนิยม (Top Genres & Dialects)
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
REVOKE ALL ON public.analytics_top_genres_dialects FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.analytics_top_features TO service_role;
GRANT SELECT ON public.analytics_top_songwriters TO service_role;
GRANT SELECT ON public.analytics_top_genres_dialects TO service_role;
