-- Pools automatiques par token : « $TOKEN atteindra X avant … ? ». Résolus seuls, puis un nouveau palier est proposé.
alter table mutuel_markets add column if not exists token_mint text;
alter table mutuel_markets add column if not exists token_chain text;
alter table mutuel_markets add column if not exists auto_target numeric;
alter table mutuel_markets add column if not exists auto_level int;
create index if not exists idx_mutuel_markets_token on mutuel_markets (token_mint) where token_mint is not null;
create index if not exists idx_mutuel_markets_auto on mutuel_markets (status) where auto_target is not null;
