-- ─── GRANT SELECT TO anon ────────────────────────────────────────────────────
-- Les tables créées via migration ne reçoivent pas automatiquement les GRANT
-- nécessaires au rôle anon (utilisé par le client JS public).
-- Sans ces GRANT, la RLS policy "USING (true)" est ignorée et les SELECT
-- retournent [] silencieusement.

GRANT SELECT ON public.referral_codes              TO anon, authenticated;
GRANT SELECT ON public.referrals                   TO anon, authenticated;
GRANT SELECT ON public.octo_transactions           TO anon, authenticated;
GRANT SELECT ON public.referral_commissions        TO anon, authenticated;
GRANT SELECT ON public.referral_commission_claims  TO anon, authenticated;
