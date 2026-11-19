-- Classements « Top 10 » publiés par l'admin (Terminal et Launchpad). Une image publiée ne change plus :
-- elle est rendue depuis la photo des chiffres prise au moment de la création.
create table if not exists public.top_lists (
  id         uuid primary key default gen_random_uuid(),
  source     text not null,
  kind       text not null,
  period     text not null,
  rows       jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists top_lists_created_idx on public.top_lists (created_at desc);
alter table public.top_lists enable row level security;
