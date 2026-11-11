-- Swaps passés par le moteur OM (Terminal, pages token) : base des frais 0,3 % et du partage « Chill ton sac ».
create table if not exists public.swaps (
  id           uuid primary key default gen_random_uuid(),
  signature    text not null unique,
  wallet       text not null,
  chain        text not null default 'solana' check (chain in ('solana', 'arc')),
  input_mint   text not null,
  output_mint  text not null,
  in_amount    numeric not null,          -- unités brutes
  out_amount   numeric not null,          -- unités brutes
  traded_mint  text not null,             -- le token échangé contre SOL / USDC
  side         text not null check (side in ('buy', 'sell')),
  om_token     boolean not null default false,
  fee_mint     text,
  fee_amount   numeric not null default 0, -- unités brutes reçues par la plateforme
  fee_usd      numeric,
  volume_usd   numeric,
  created_at   timestamptz not null default now()
);
create index if not exists swaps_traded_idx on public.swaps (traded_mint, created_at desc);
create index if not exists swaps_wallet_idx on public.swaps (wallet, created_at desc);
create index if not exists swaps_created_idx on public.swaps (created_at desc);
alter table public.swaps enable row level security;
-- Aucune politique : lecture et écriture uniquement par le serveur (clé service).
