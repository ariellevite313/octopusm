-- Migration: add cumulative volume tracking columns
-- Run once in Supabase SQL editor or via supabase db push

ALTER TABLE launchpad_tokens
  ADD COLUMN IF NOT EXISTS volume_total_usd       NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volume_24h_snapshot_usd NUMERIC DEFAULT 0;

-- Backfill: seed total from current 24h values so we don't start at zero
UPDATE launchpad_tokens
SET
  volume_total_usd        = COALESCE(volume_24h_usd, 0),
  volume_24h_snapshot_usd = COALESCE(volume_24h_usd, 0)
WHERE volume_24h_usd IS NOT NULL AND volume_24h_usd > 0;
