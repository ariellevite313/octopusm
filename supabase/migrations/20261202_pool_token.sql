-- Prédictions liées à un token : un pool (marché de prédiction) peut porter sur un token du Terminal.
alter table mutuel_markets add column if not exists token_mint text;
create index if not exists idx_mutuel_markets_token on mutuel_markets (token_mint) where token_mint is not null;
