-- Reposts et citations.
--  repost_of : republication sans texte (une seule par personne et par post)
--  quote_of  : citation = nouveau post avec son texte, qui affiche le post cité
alter table posts add column if not exists repost_of uuid references posts (id) on delete cascade;
alter table posts add column if not exists quote_of uuid references posts (id) on delete set null;
alter table posts add column if not exists repost_count int not null default 0;
create unique index if not exists uq_posts_repost on posts (author, repost_of) where repost_of is not null;
create index if not exists idx_posts_repost_of on posts (repost_of) where repost_of is not null;
create index if not exists idx_posts_quote_of on posts (quote_of) where quote_of is not null;

-- Un repost n'a ni texte ni image : on élargit la règle « texte ou image obligatoire »
alter table posts drop constraint if exists posts_check;
alter table posts drop constraint if exists posts_content_check;
alter table posts add constraint posts_content_check
  check (char_length(body) > 0 or coalesce(array_length(images, 1), 0) > 0 or repost_of is not null) not valid;

-- Nouvelles notifications : repost et citation
alter table notifications drop constraint if exists notifications_kind_check;
alter table notifications add constraint notifications_kind_check
  check (kind in ('follow', 'mention', 'reply', 'like', 'repost', 'quote'));
