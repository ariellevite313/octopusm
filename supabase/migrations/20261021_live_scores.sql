-- Scores en direct agrégés depuis plusieurs fournisseurs (bascule automatique si l'un tombe).
create table if not exists live_matches (
  key         text primary key,            -- date + équipes normalisées
  league      text,
  league_logo text,
  home        text not null,
  home_logo   text,
  away        text not null,
  away_logo   text,
  score_home  int,
  score_away  int,
  status      text not null check (status in ('scheduled', 'live', 'halftime', 'finished', 'postponed', 'cancelled')),
  minute      int,
  kickoff     timestamptz not null,
  source      text not null,
  updated_at  timestamptz not null default now()
);
create index if not exists idx_live_matches_kickoff on live_matches (kickoff);
create index if not exists idx_live_matches_status on live_matches (status);

-- Suivi des appels par fournisseur (quota quotidien, pannes)
create table if not exists sports_providers (
  provider    text primary key,
  day         date not null default current_date,
  calls       int not null default 0,
  last_call   timestamptz,
  down_until  timestamptz,
  last_error  text
);

alter table live_matches     enable row level security;
alter table sports_providers enable row level security;
