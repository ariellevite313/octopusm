-- Fil : hashtags, mentions (@username) et marché partagé dans un post.
alter table posts add column if not exists tags        text[] not null default '{}';
alter table posts add column if not exists mentions    jsonb  not null default '{}'::jsonb;  -- { "username": "wallet" }
alter table posts add column if not exists market_kind text check (market_kind in ('pool', 'prediction'));
alter table posts add column if not exists market_id   uuid;
create index if not exists idx_posts_tags on posts using gin (tags);
