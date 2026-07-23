-- OCTO transaction log: one row per credit/debit
CREATE TABLE IF NOT EXISTS public.octo_transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text        NOT NULL,
  type           text        NOT NULL CHECK (type IN ('bet', 'task', 'referral')),
  amount         numeric     NOT NULL DEFAULT 0,
  label          text        NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS octo_transactions_wallet_idx
  ON public.octo_transactions (wallet_address, created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.octo_transactions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own rows; inserts done via service role (admin client)
CREATE POLICY IF NOT EXISTS "octo_transactions_select_own"
  ON public.octo_transactions FOR SELECT
  USING (wallet_address = (SELECT get_wallet_address()));

-- Leaderboard: one row per wallet, running total
CREATE TABLE IF NOT EXISTS public.leaderboard_octo (
  wallet_address text    PRIMARY KEY,
  total_octo     numeric NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leaderboard_octo ENABLE ROW LEVEL SECURITY;

-- Everyone can read the leaderboard; writes via service role only
CREATE POLICY IF NOT EXISTS "leaderboard_octo_select_all"
  ON public.leaderboard_octo FOR SELECT
  USING (true);

-- Enable Realtime on octo_transactions so token-balances.tsx subscription fires
ALTER PUBLICATION supabase_realtime ADD TABLE public.octo_transactions;
