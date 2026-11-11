-- Schéma minimal pour tester supabase/migrations/20261111_post_tips.sql sur un Postgres vide :
--   psql -d test -f tests/sql/post_tips_base.sql -f supabase/migrations/20261111_post_tips.sql -f tests/sql/post_tips_scenarios.sql
do $$ begin create role anon; exception when others then null; end $$; do $$ begin create role authenticated; exception when others then null; end $$;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_app_meta_data jsonb default '{}', created_at timestamptz default now());
create table posts (id uuid primary key default gen_random_uuid(), author text not null, body text default 'x', hidden boolean not null default false, created_at timestamptz not null default now());
create table octo_transactions (id uuid primary key default gen_random_uuid(), wallet_address text not null, type text not null constraint octo_transactions_type_check check (type in ('bet','task','referral','launch','swap')), amount numeric not null default 0, label text not null default '', created_at timestamptz not null default now());
create table leaderboard_octo (wallet_address text primary key, total_octo numeric not null default 0, updated_at timestamptz not null default now());
create table notifications (id uuid primary key default gen_random_uuid(), wallet text, kind text constraint notifications_kind_check check (kind in ('like')), actor text, post_id uuid);
create type mutuel_market_status as enum ('pending','active','closed','resolved','rejected');
create table mutuel_markets (id uuid primary key default gen_random_uuid(), creator_wallet text not null, status mutuel_market_status not null default 'pending');
create table launchpad_tokens (id uuid primary key default gen_random_uuid(), creator_wallet text not null, status text not null default 'pending');
