-- Social: banner, follows, posts (text + up to 2 images/GIF), likes, replies, views, reports, hides.
-- Run once in the Supabase SQL editor. All tables are written through the service role (RLS on, no policies).

alter table wallets add column if not exists banner_src text;

create table if not exists follows (
  follower   text not null,
  following  text not null,
  created_at timestamptz not null default now(),
  primary key (follower, following),
  check (follower <> following)
);
create index if not exists idx_follows_following on follows (following);

create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  author      text not null,
  body        text not null default '' check (char_length(body) <= 2000),
  images      text[] not null default '{}' check (array_length(images, 1) is null or array_length(images, 1) <= 2),
  ticker      text,
  token_id    uuid references launchpad_tokens (id) on delete set null,
  like_count  int not null default 0,
  reply_count int not null default 0,
  view_count  int not null default 0,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  check (char_length(body) > 0 or array_length(images, 1) > 0)
);
create index if not exists idx_posts_author_created on posts (author, created_at desc);
create index if not exists idx_posts_created on posts (created_at desc) where not hidden;

create table if not exists post_likes (
  post_id    uuid not null references posts (id) on delete cascade,
  wallet     text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, wallet)
);

create table if not exists post_replies (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts (id) on delete cascade,
  author     text not null,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_post_replies_post on post_replies (post_id, created_at);

create table if not exists post_views (
  post_id    uuid not null references posts (id) on delete cascade,
  viewer     text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, viewer)
);

create table if not exists post_reports (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts (id) on delete cascade,
  reporter   text not null,
  reason     text,
  status     text not null default 'open' check (status in ('open', 'hidden', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (post_id, reporter)
);

create table if not exists post_hides (
  wallet     text not null,
  post_id    uuid not null references posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (wallet, post_id)
);

alter table follows       enable row level security;
alter table posts         enable row level security;
alter table post_likes    enable row level security;
alter table post_replies  enable row level security;
alter table post_views    enable row level security;
alter table post_reports  enable row level security;
alter table post_hides    enable row level security;

-- Public bucket for post images / GIFs
insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true)
on conflict (id) do nothing;
