-- Durcissement sécurité (audit du 2026-10-28)
-- À appliquer APRÈS le déploiement de la fonction wallet-auth mise à jour.

-- 1. Identité de confiance : app_metadata.wallet_address (modifiable seulement côté serveur).
--    Rattrapage des comptes existants : uniquement si l'email (posé par le serveur) correspond au wallet.
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('wallet_address', raw_user_meta_data->>'wallet_address')
WHERE raw_user_meta_data->>'wallet_address' IS NOT NULL
  AND email = lower(raw_user_meta_data->>'wallet_address') || '@octopus-market.wallet'
  AND coalesce(raw_app_meta_data->>'wallet_address', '') = '';

-- 2. Les politiques RLS ne doivent plus lire user_metadata.
DROP POLICY IF EXISTS "referrer can read own commissions" ON public.referral_commissions;
CREATE POLICY "referrer can read own commissions"
  ON public.referral_commissions
  FOR SELECT
  USING (
    referrer_wallet = (SELECT (auth.jwt() -> 'app_metadata' ->> 'wallet_address'))
  );

DO $$
BEGIN
  IF to_regclass('public.token_launches') IS NOT NULL THEN
    DROP POLICY IF EXISTS "admins_all_launches" ON public.token_launches;
    CREATE POLICY "admins_all_launches"
      ON public.token_launches FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.admins
          WHERE wallet_address = (SELECT (raw_app_meta_data->>'wallet_address') FROM auth.users WHERE id = auth.uid())
        )
      );
  END IF;
END $$;

-- 3. Nonces de connexion à usage unique (fonction wallet-auth, service role seulement).
CREATE TABLE IF NOT EXISTS public.wallet_auth_nonces (
  nonce          text PRIMARY KEY,
  wallet_address text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.wallet_auth_nonces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallet_auth_nonces FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS idx_wallet_auth_nonces_created ON public.wallet_auth_nonces (created_at);

-- 4. Clés secrètes de launchpad_tokens illisibles avec la clé publique.
--    Le droit de lecture est retiré sur la table puis redonné colonne par colonne, sauf les secrets.
--    Une colonne ajoutée plus tard doit être accordée explicitement (GRANT SELECT (col) ...).
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'launchpad_tokens'
    AND column_name NOT IN ('vanity_secret_key', 'dbc_config_secret');
  EXECUTE 'REVOKE SELECT ON public.launchpad_tokens FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.launchpad_tokens TO anon, authenticated', cols);
END $$;

-- 5. Récompenses de swap : une seule par transaction, total incrémenté de façon atomique.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_octo_swap_label ON public.octo_transactions (label) WHERE type = 'swap';
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'uq_octo_swap_label not created: duplicate swap rewards exist, clean them then re-run.';
END $$;

CREATE OR REPLACE FUNCTION public.add_leaderboard_octo(p_wallet text, p_amount numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.leaderboard_octo (wallet_address, total_octo) VALUES (p_wallet, p_amount)
  ON CONFLICT (wallet_address) DO UPDATE SET total_octo = public.leaderboard_octo.total_octo + p_amount;
$$;
REVOKE ALL ON FUNCTION public.add_leaderboard_octo(text, numeric) FROM public, anon, authenticated;

-- 6. Frais de création : colonnes de preuve de paiement.
ALTER TABLE public.launchpad_tokens ADD COLUMN IF NOT EXISTS fee_paid_at timestamptz;
ALTER TABLE public.launchpad_tokens ADD COLUMN IF NOT EXISTS fee_tx_sig text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_launchpad_fee_tx_sig ON public.launchpad_tokens (fee_tx_sig) WHERE fee_tx_sig IS NOT NULL;
-- (Les colonnes ajoutées ci-dessus après le GRANT du point 4 restent illisibles pour anon : voulu.)

-- 7. Fonctions d'identité : is_admin() et get_wallet_address() lisaient user_metadata (modifiable par l'utilisateur).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet TEXT;
BEGIN
  v_wallet := (auth.jwt() -> 'app_metadata' ->> 'wallet_address');
  IF v_wallet IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.wallets
    WHERE address = v_wallet
      AND role = 'admin'
  );
END;
$$;

DO $$
BEGIN
  CREATE OR REPLACE FUNCTION public.get_wallet_address()
  RETURNS text LANGUAGE sql STABLE AS $f$
    SELECT (auth.jwt() -> 'app_metadata' ->> 'wallet_address')
  $f$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'get_wallet_address() not replaced (%): update it by hand to read app_metadata.', SQLERRM;
END $$;
