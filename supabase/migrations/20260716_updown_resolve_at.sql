-- Migration: ajouter resolve_at sur updown_markets
-- closes_at = fin des paris (début du LIVE)
-- resolve_at = fin du round = résolution effective
--
-- Ratios betting/total par durée :
--   5 min  → 3 min paris  + 2 min live
--   15 min → 10 min paris + 5 min live
--   30 min → 20 min paris + 10 min live

ALTER TABLE updown_markets
  ADD COLUMN IF NOT EXISTS resolve_at timestamptz;

-- Backfill pour les marchés existants :
-- on recalcule resolve_at = opens_at + duration_min
-- (closes_at reste tel quel, il sera recalculé à la prochaine création de round)
UPDATE updown_markets
SET resolve_at = opens_at + (duration_min || ' minutes')::interval
WHERE resolve_at IS NULL;

-- Index pour que le cron resolve-updown-markets soit rapide
CREATE INDEX IF NOT EXISTS idx_updown_markets_resolve_at
  ON updown_markets (resolve_at)
  WHERE status = 'open';
