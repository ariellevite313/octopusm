-- Wallets d'IA inactifs : après 30 jours sans activité, les fonds reviennent au wallet de l'humain.
-- last_seen_at : dernière fois que l'humain a ouvert ou réglé son wallet d'IA.
alter table public.agent_wallets add column if not exists last_seen_at timestamptz not null default now();
