-- Notifications : nouveau follower, mention, réponse, like
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  wallet     text not null,                 -- destinataire
  kind       text not null check (kind in ('follow', 'mention', 'reply', 'like')),
  actor      text not null,
  post_id    uuid references posts (id) on delete cascade,
  read       boolean not null default false,
  created_at timestamptz not null default now(),
  check (wallet <> actor)
);
create index if not exists idx_notifications_wallet on notifications (wallet, created_at desc);
create index if not exists idx_notifications_unread on notifications (wallet) where not read;
-- Une seule notification par (destinataire, type, auteur, post) : pas de doublons si on aime / suit de nouveau
create unique index if not exists uq_notifications_dedupe on notifications (wallet, kind, actor, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid));
alter table notifications enable row level security;
