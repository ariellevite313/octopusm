-- =============================================================================
-- Migration : système de réclamation de gains (claims)
-- À exécuter dans : Supabase dashboard → SQL Editor
--
-- Ajoute payout_status / paid_at / paid_by_wallet à prediction_history,
-- met à jour la vue prediction_history_with_status pour inclure le statut 'paid'.
-- =============================================================================

-- ── 1. Nouvelles colonnes ────────────────────────────────────────────────────

ALTER TABLE prediction_history
  ADD COLUMN IF NOT EXISTS payout_status TEXT NULL
    CHECK (payout_status IN ('claimed', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_at       TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS paid_by_wallet TEXT NULL;

-- ── 2. Backfill : lignes déjà réclamées (claimed_at renseigné) ────────────────

UPDATE prediction_history
SET payout_status = 'claimed'
WHERE claimed_at IS NOT NULL
  AND payout_status IS NULL;

-- ── 3. Vue mise à jour ────────────────────────────────────────────────────────
-- DROP requis : CREATE OR REPLACE ne peut pas modifier l'ordre des colonnes
-- (ph.* inclut maintenant payout_status, ce qui décale result_status).
-- Priorité des statuts (du plus prioritaire au moins prioritaire) :
--   paid → claimed → win → lose → approved_pending_result → rejected → pending_review → open

DROP VIEW IF EXISTS prediction_history_with_status;

CREATE VIEW prediction_history_with_status AS
SELECT
  ph.*,
  CASE
    WHEN ph.payout_status = 'paid'
      THEN 'paid'
    WHEN ph.payout_status = 'claimed' OR ph.claimed_at IS NOT NULL
      THEN 'claimed'
    WHEN ph.resolution_outcome_id IS NOT NULL
         AND ph.selection_id = ph.resolution_outcome_id
      THEN 'win'
    WHEN ph.resolution_outcome_id IS NOT NULL
         AND ph.selection_id <> ph.resolution_outcome_id
      THEN 'lose'
    WHEN ph.admin_decision_status = 'approved'
      THEN 'approved_pending_result'
    WHEN ph.admin_decision_status = 'rejected'
      THEN 'rejected'
    WHEN ph.admin_decision_status = 'pending'
      THEN 'pending_review'
    ELSE 'open'
  END::TEXT AS result_status
FROM prediction_history ph;
