-- OM Store : puce bleue donnée par l'admin à un projet.
alter table public.discover_apps add column if not exists verified boolean not null default false;
