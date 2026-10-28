-- Annonces envoyées à tous les utilisateurs (hackathon). Une seule ligne par annonce, pas une par utilisateur.
-- Dans une même "series", seule la plus récente est affichée : le rappel du jour remplace celui de la veille.
create table if not exists announcements (
  id         uuid        primary key default gen_random_uuid(),
  series     text        not null,
  key        text        not null,                 -- identifiant de l'envoi (ex. date) : évite les doublons
  template   text        not null,
  vars       jsonb       not null default '{}'::jsonb,
  href       text,
  publish_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (series, key)
);
create index if not exists idx_announcements_series on announcements (series, publish_at desc);

create table if not exists announcement_reads (
  wallet          text not null,
  announcement_id uuid not null references announcements (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (wallet, announcement_id)
);
alter table announcements      enable row level security;
alter table announcement_reads enable row level security;
