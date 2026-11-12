-- Schéma minimal pour tester supabase/migrations/20261116_agent_wallets.sql sur un Postgres vide.
do $$ begin create role anon; exception when others then null; end $$; do $$ begin create role authenticated; exception when others then null; end $$;
create table wallets (address text primary key, display_name text);
