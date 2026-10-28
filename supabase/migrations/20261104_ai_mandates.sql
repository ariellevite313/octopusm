-- Programme confié à une IA par la personne qui l'a connectée (ex. un mois) : l'IA le suit seule, sans validation à chaque action.
-- Les frais de création de marché sont pris en charge par la plateforme dans la limite max_markets.
create table if not exists ai_mandates (
  id          uuid primary key default gen_random_uuid(),
  wallet      text not null,
  brief       text not null,
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  max_markets integer not null default 0 check (max_markets between 0 and 30),
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ai_mandates_wallet on ai_mandates (wallet, ends_at desc);
alter table ai_mandates enable row level security;
