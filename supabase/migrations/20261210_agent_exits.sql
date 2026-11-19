-- Sorties automatiques du wallet de l'IA (Janus) : stop loss, take profit, protection des gains (trailing).
-- Le cron les surveille chaque minute et vend avec le wallet de l'IA, dans ses limites (pause et permissions respectées).
create table if not exists public.agent_exit_rules (
  id              uuid primary key default gen_random_uuid(),
  wallet_id       uuid not null references public.agent_wallets (id) on delete cascade,
  mint            text not null,
  symbol          text,
  entry_price     numeric not null check (entry_price > 0),
  peak_price      numeric not null check (peak_price > 0),
  sl_pct          numeric check (sl_pct >= 1 and sl_pct <= 90),
  tp_x            numeric check (tp_x >= 1.1 and tp_x <= 1000),
  tp_sell_pct     numeric not null default 50 check (tp_sell_pct >= 1 and tp_sell_pct <= 100),
  trail_pct       numeric check (trail_pct >= 1 and trail_pct <= 90),
  tp_done         boolean not null default false,
  trigger_hits    int not null default 0,
  fail_count      int not null default 0,
  last_attempt_at timestamptz,
  last_error      text,
  status          text not null default 'active' check (status in ('active', 'done', 'cancelled', 'failed')),
  close_reason    text,
  created_at      timestamptz not null default now(),
  closed_at       timestamptz,
  check (sl_pct is not null or tp_x is not null or trail_pct is not null)
);
create index if not exists agent_exit_rules_active_idx on public.agent_exit_rules (status, mint);
create index if not exists agent_exit_rules_wallet_idx on public.agent_exit_rules (wallet_id, status);
alter table public.agent_exit_rules enable row level security;
