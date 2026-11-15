-- Wallets d'IA : le propriétaire fixe librement ses plafonds (plus de maximum imposé par la plateforme).
-- Les plafonds restent obligatoires et positifs ; agent_wallet_reserve les applique toujours.
ALTER TABLE public.agent_wallets DROP CONSTRAINT IF EXISTS agent_wallets_max_action_usd_check;
ALTER TABLE public.agent_wallets DROP CONSTRAINT IF EXISTS agent_wallets_max_day_usd_check;
ALTER TABLE public.agent_wallets ADD CONSTRAINT agent_wallets_max_action_usd_check CHECK (max_action_usd > 0);
ALTER TABLE public.agent_wallets ADD CONSTRAINT agent_wallets_max_day_usd_check CHECK (max_day_usd > 0);
