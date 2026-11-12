-- Liaison d'un compte X (verifie via Privy) a un wallet OM. Un compte X = un seul wallet.
create table if not exists x_links (
  x_user_id       text primary key,          -- identifiant numerique X (jamais le @, qui peut changer)
  privy_user_id   text not null unique,
  wallet_address  text not null unique references wallets(address) on delete cascade,
  x_username      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table x_links enable row level security;
-- aucune policy : seul le serveur (service role) lit et ecrit cette table
