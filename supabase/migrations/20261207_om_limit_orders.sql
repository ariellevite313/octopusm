-- Ordres limités placés depuis OM (Jupiter Trigger). Servent au carnet d'ordres du Terminal :
-- on y montre le niveau et le montant, jamais le wallet.
create table if not exists public.om_limit_orders (
  order_key   text primary key,
  maker       text not null,
  mint        text not null,
  side        text not null check (side in ('buy', 'sell')),
  amount_sol  numeric not null,
  target_mcap numeric not null,
  status      text not null default 'pending' check (status in ('pending', 'open', 'closed')),
  checked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists om_limit_orders_mint_idx on public.om_limit_orders (mint, status);
alter table public.om_limit_orders enable row level security;
