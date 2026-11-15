-- Phase 4D (Hardened): Cloud Song Library & Multi-Device Sync Table
-- Run this SQL alongside 20261114_phase5f_wallet_billing.sql in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.songs (
  id text NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  bpm integer NOT NULL DEFAULT 84,
  time_signature text NOT NULL DEFAULT '4/4',
  base_key text NOT NULL DEFAULT 'C',
  project_data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_songs_user_updated
  ON public.songs (user_id, updated_at DESC);

ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own songs" ON public.songs;
CREATE POLICY "Users can select own songs"
  ON public.songs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own songs" ON public.songs;
CREATE POLICY "Users can insert own songs"
  ON public.songs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own songs" ON public.songs;
CREATE POLICY "Users can update own songs"
  ON public.songs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own songs" ON public.songs;
CREATE POLICY "Users can delete own songs"
  ON public.songs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
