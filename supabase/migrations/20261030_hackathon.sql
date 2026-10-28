-- Hackathon OM Builders : historique d'achats/ventes des tokens (base des votes) et candidatures.

-- Chaque achat et vente de token faits depuis OM, relus sur la chaîne par le serveur.
-- Les trades Arc sont déjà dans arc_trades : ils ne sont pas copiés ici.
create table if not exists token_trades (
  tx_id        text        not null,                 -- signature Solana
  token_id     uuid        not null references launchpad_tokens (id) on delete cascade,
  wallet       text        not null,
  side         text        not null check (side in ('buy', 'sell')),
  usd          numeric     not null check (usd > 0),
  token_amount numeric     not null check (token_amount > 0),
  ts           timestamptz not null,
  created_at   timestamptz not null default now(),
  primary key (tx_id, token_id)
);
create index if not exists idx_token_trades_token_ts  on token_trades (token_id, ts);
create index if not exists idx_token_trades_wallet    on token_trades (wallet, token_id, ts);

create table if not exists hackathon_projects (
  id            uuid        primary key default gen_random_uuid(),
  token_id      uuid        not null unique references launchpad_tokens (id) on delete cascade,
  applicant     text        not null,                -- wallet connecté et signataire
  name          text        not null check (char_length(name) between 2 and 60),
  description   text        not null check (char_length(description) between 10 and 600),
  site_url      text        not null,
  github_url    text,
  x_handle      text        not null,
  video_url     text,
  category      text        not null check (category in ('ai_agents', 'defi', 'gaming', 'payments', 'social', 'other')),
  team_wallets  text[]      not null default '{}',   -- max 4 membres, vérifié par l'API
  status        text        not null default 'approved' check (status in ('approved', 'excluded')),
  excluded_reason text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_hackathon_projects_status on hackathon_projects (status, created_at desc);

alter table token_trades        enable row level security;
alter table hackathon_projects  enable row level security;
-- Lecture publique des projets (affichés sur le site) ; écriture uniquement par le serveur.
drop policy if exists hackathon_projects_read on hackathon_projects;
create policy hackathon_projects_read on hackathon_projects for select using (true);
