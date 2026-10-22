-- Niveau de frais d'un token Solana : 'standard' (config actuelle) ou 'low' (frais 1,25 %, le créateur gagne 0,5 %).
alter table launchpad_tokens add column if not exists sol_fee_tier text not null default 'standard';
do $$ begin
  alter table launchpad_tokens add constraint launchpad_tokens_sol_fee_tier_chk check (sol_fee_tier in ('standard', 'low'));
exception when duplicate_object then null; end $$;
