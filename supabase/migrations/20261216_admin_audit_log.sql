-- Journal des actions des administrateurs (écritures faites par les routes /api/admin).
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  admin_id uuid not null,
  method text not null,
  path text not null,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
-- Réservé au service : aucune lecture ni écriture depuis le navigateur.
alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
