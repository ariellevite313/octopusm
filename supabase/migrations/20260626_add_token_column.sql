-- ─── Dual-token support : USDC + ClawdTrust ──────────────────────────────────
-- Chaque pari enregistre le token utilisé. Économies indépendantes par token.

ALTER TABLE public.prediction_history
  ADD COLUMN IF NOT EXISTS token TEXT NOT NULL DEFAULT 'usdc'
    CHECK (token IN ('usdc', 'clawdtrust'));

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS token TEXT NOT NULL DEFAULT 'usdc'
    CHECK (token IN ('usdc', 'clawdtrust'));

-- Index pour les calculs de pool par token
CREATE INDEX IF NOT EXISTS idx_pred_history_token
  ON public.prediction_history (market_id, selection_id, token);

-- GRANT (cohérent avec les autres tables)
GRANT SELECT ON public.prediction_history TO anon, authenticated;
GRANT SELECT ON public.payments TO anon, authenticated;
