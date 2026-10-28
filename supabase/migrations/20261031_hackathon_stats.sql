-- Chiffres du classement du hackathon, mis à jour par le cron hackathon-stats.
alter table launchpad_tokens add column if not exists hackathon_baseline_volume numeric;

create table if not exists hackathon_stats (
  project_id       uuid primary key references hackathon_projects (id) on delete cascade,
  holders          int          not null default 0,
  top10_pct        numeric      not null default 0,
  biggest_pct      numeric      not null default 0,
  bundle_pct       numeric      not null default 0,
  volume_usd       numeric      not null default 0,   -- volume net dans la fenêtre, hors équipe
  votes            numeric      not null default 0,   -- après plafond par wallet
  platform_rate    numeric      not null default 0.0068,
  had_volume_7d    boolean      not null default false,
  price_ratio      numeric,                           -- prix / prix de graduation, null = non mesuré
  frozen_intact    boolean      not null default true,
  holders_updated_at timestamptz,
  updated_at       timestamptz  not null default now()
);
alter table hackathon_stats enable row level security;
drop policy if exists hackathon_stats_read on hackathon_stats;
create policy hackathon_stats_read on hackathon_stats for select using (true);
