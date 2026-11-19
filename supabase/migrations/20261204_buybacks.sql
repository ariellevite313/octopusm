-- Rachats et destructions (buyback & burn) des tokens OM, déclenchés par l'admin.
CREATE TABLE IF NOT EXISTS public.token_buybacks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id    uuid REFERENCES launchpad_tokens (id) ON DELETE SET NULL,
  mint        text NOT NULL,
  sol_spent   numeric NOT NULL,
  burned_raw  text NOT NULL,
  decimals    int NOT NULL,
  swap_sig    text NOT NULL,
  burn_sig    text NOT NULL,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_token_buybacks_mint ON public.token_buybacks (mint, created_at DESC);
ALTER TABLE public.token_buybacks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.token_buybacks FROM PUBLIC, anon, authenticated;
