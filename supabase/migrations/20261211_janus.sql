-- Janus : chaque IA connectée s'appelle Janus (wallets IA et profils publics existants)
UPDATE public.agent_wallets SET name = 'Janus' WHERE name IS DISTINCT FROM 'Janus';
UPDATE public.wallets SET display_name = 'Janus' WHERE ai_owner IS NOT NULL AND display_name IS DISTINCT FROM 'Janus';
