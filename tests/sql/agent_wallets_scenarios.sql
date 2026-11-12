-- Scénarios de agent_wallet_reserve :
--   psql -d test -f tests/sql/agent_wallets_base.sql -f supabase/migrations/20261116_agent_wallets.sql -f tests/sql/agent_wallets_scenarios.sql
\set ON_ERROR_STOP 1
do $$
declare w uuid; r jsonb;
begin
  insert into agent_wallets (owner, client_id, name, sol_address, sol_secret, evm_address, evm_secret, max_action_usd, max_day_usd)
  values ('Owner1', 'client1', 'Claude', 'SolAddr1', 'x', '0xevm1', 'x', 50, 100) returning id into w;

  r := agent_wallet_reserve(w, 'swap', 40, 'buy');           assert r ? 'id', 'first action ok';
  r := agent_wallet_reserve(w, 'swap', 60, 'too big');       assert r->>'error' = 'over_action_limit', 'per action limit';
  r := agent_wallet_reserve(w, 'bet', 50, 'bet');            assert r ? 'id', 'second action ok (90 today)';
  r := agent_wallet_reserve(w, 'trade', 20, 'over day');     assert r->>'error' = 'over_day_limit', 'daily limit';
  -- une action échouée ne compte pas
  update agent_wallet_actions set status = 'failed' where wallet_id = w and kind = 'bet';
  r := agent_wallet_reserve(w, 'trade', 20, 'after failure'); assert r ? 'id', 'failed action freed the budget';
  -- une vente (0 $) passe toujours
  r := agent_wallet_reserve(w, 'swap', 0, 'sell');           assert r ? 'id', 'sells are free';
  -- permissions et pause
  update agent_wallets set allow_launch = false where id = w;
  r := agent_wallet_reserve(w, 'launch', 1, 'launch');       assert r->>'error' = 'not_allowed', 'launch not allowed';
  update agent_wallets set paused = true where id = w;
  r := agent_wallet_reserve(w, 'swap', 0, 'paused');         assert r->>'error' = 'paused', 'paused';
  r := agent_wallet_reserve(gen_random_uuid(), 'swap', 0, 'x'); assert r->>'error' = 'not_found', 'unknown wallet';
  raise notice 'agent wallets: all scenarios passed';
end $$;
