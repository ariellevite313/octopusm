-- Discover : réseaux sociaux du projet (facultatifs)
alter table public.discover_apps add column if not exists x_url text;
alter table public.discover_apps add column if not exists telegram_url text;
alter table public.discover_apps add column if not exists discord_url text;
