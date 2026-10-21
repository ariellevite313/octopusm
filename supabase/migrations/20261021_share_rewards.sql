-- Récompenses de partage : un pari fait depuis un post du fil est attribué à l'auteur du post.
--  - Marchés créés par les admins (prédictions) : 200 OMERO par parieur venu du post.
--  - Pools : 20 % de la commission de la plateforme, répartis selon les mises venues de chaque post.
create table if not exists share_attributions (
  market_kind  text not null check (market_kind in ('pool', 'prediction')),
  market_id    uuid not null,
  bettor       text not null,
  post_id      uuid not null references posts (id) on delete cascade,
  sharer       text not null,
  created_at   timestamptz not null default now(),
  omero_paid   boolean not null default false,
  primary key (market_kind, market_id, bettor),
  check (sharer <> bettor)
);
create index if not exists idx_share_attr_sharer on share_attributions (sharer);

create table if not exists share_rewards (
  id          uuid primary key default gen_random_uuid(),
  sharer      text not null,
  market_kind text not null,
  market_id   uuid not null,
  amount_usdc numeric not null default 0,
  amount_clt  numeric not null default 0,
  omero       integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_share_rewards_sharer on share_rewards (sharer);

alter table share_attributions enable row level security;
alter table share_rewards      enable row level security;
