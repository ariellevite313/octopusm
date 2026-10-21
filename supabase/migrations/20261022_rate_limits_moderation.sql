-- Limites de requêtes partagées (survivent aux redémarrages et fonctionnent avec plusieurs processus)
create table if not exists rate_limits (
  key      text primary key,
  count    int not null default 0,
  reset_at timestamptz not null
);
alter table rate_limits enable row level security;

create or replace function rl_hit(p_key text, p_max int, p_window_ms int) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into rate_limits (key, count, reset_at) values (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  on conflict (key) do update set
    count    = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
    reset_at = case when rate_limits.reset_at < now() then now() + make_interval(secs => p_window_ms / 1000.0) else rate_limits.reset_at end
  returning count into c;
  if random() < 0.01 then delete from rate_limits where reset_at < now() - interval '1 day'; end if;
  return c <= p_max;
end $$;
revoke all on function rl_hit(text, int, int) from public, anon, authenticated;
grant execute on function rl_hit(text, int, int) to service_role;

-- Comptes bannis : ne peuvent plus publier, répondre, aimer, suivre ni toucher aux récompenses
create table if not exists banned_wallets (
  wallet     text primary key,
  reason     text,
  banned_by  text,
  created_at timestamptz not null default now()
);
alter table banned_wallets enable row level security;

-- Images en attente de contrôle (modération a posteriori) : les admins voient les dernières images publiées
alter table posts add column if not exists images_checked boolean not null default false;
