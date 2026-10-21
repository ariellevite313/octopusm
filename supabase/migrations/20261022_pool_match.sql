-- Pool lié à un match : le score en direct s'affiche, les paris se ferment au coup d'envoi
alter table mutuel_markets add column if not exists match_key text;
create index if not exists idx_mutuel_markets_match on mutuel_markets (match_key) where match_key is not null;
