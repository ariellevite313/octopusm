-- Réponses aux réponses + likes sur les réponses
alter table post_replies add column if not exists parent_id uuid references post_replies (id) on delete cascade;
alter table post_replies add column if not exists like_count int not null default 0;
alter table post_replies add column if not exists reply_count int not null default 0;
create index if not exists idx_post_replies_parent on post_replies (parent_id);

create table if not exists post_reply_likes (
  reply_id   uuid not null references post_replies (id) on delete cascade,
  wallet     text not null,
  created_at timestamptz not null default now(),
  primary key (reply_id, wallet)
);
alter table post_reply_likes enable row level security;

alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('follow', 'mention', 'reply', 'like', 'repost', 'quote', 'reply_like', 'reply_reply'));
