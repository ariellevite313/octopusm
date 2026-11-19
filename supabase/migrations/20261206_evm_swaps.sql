-- Swaps EVM du Terminal (Base, BNB, Ethereum…) enregistrés comme ceux de Solana : historique, cashback, alertes.
alter table public.swaps drop constraint if exists swaps_chain_check;
alter table public.swaps add constraint swaps_chain_check check (chain in ('solana', 'arc', 'base', 'bnb', 'hyperliquid', 'ethereum', 'arbitrum', 'polygon', 'avalanche'));
