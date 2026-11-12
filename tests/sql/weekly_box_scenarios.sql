-- Scénarios de settle_weekly_box / claim_weekly_box :
--   psql -d test -f tests/sql/post_tips_base.sql -f supabase/migrations/20261111_post_tips.sql \
--        -f supabase/migrations/20261115_weekly_box.sql -f tests/sql/weekly_box_scenarios.sql
\set ON_ERROR_STOP 1
do $$
declare ok boolean; s text; n int; bal numeric;
begin
  -- 1. Règlement d'une semaine terminée : top 2, OMERO crédités, box au premier
  ok := settle_weekly_box('2026-11-02', '[{"wallet":"WinnerAAA","points":300},{"wallet":"0xAbC0000000000000000000000000000000000001","points":120}]', 0.05);
  assert ok, 'first settle should write';
  select count(*) into n from weekly_box_results where week_start = '2026-11-02';
  assert n = 2, 'two results';
  select coalesce(sum(amount),0) into bal from octo_transactions where wallet_address = 'WinnerAAA' and type = 'weekly_box';
  assert bal = 300, 'winner credited 300 OMERO';
  select total_octo into bal from leaderboard_octo where wallet_address = 'WinnerAAA';
  assert bal = 300, 'leaderboard updated';
  select count(*) into n from notifications where kind = 'weekly_box';
  assert n = 2, 'two notifications';
  select prize_status into s from weekly_box_weeks where week_start = '2026-11-02';
  assert s = 'won', 'box won';

  -- 2. Pas de double règlement
  ok := settle_weekly_box('2026-11-02', '[{"wallet":"Other","points":999}]', 0.05);
  assert not ok, 'second settle must be a no-op';
  select coalesce(sum(amount),0) into bal from octo_transactions where type = 'weekly_box';
  assert bal = 420, 'no double credit';

  -- 3. Semaine pas finie / pas un lundi : refusé
  begin perform settle_weekly_box(date_trunc('week', now())::date, '[]', 0.05); assert false, 'current week must fail';
  exception when others then if sqlerrm not like '%not finished%' then raise; end if; end;
  begin perform settle_weekly_box('2026-11-03', '[]', 0.05); assert false, 'tuesday must fail';
  exception when others then if sqlerrm not like '%Monday%' then raise; end if; end;

  -- 4. Semaine sans participant : pas de box
  ok := settle_weekly_box('2026-10-26', '[]', 0.05);
  select prize_status into s from weekly_box_weeks where week_start = '2026-10-26';
  assert s = 'none', 'empty week has no box';

  -- 5. Réclamation : seul le gagnant, une seule fois
  s := claim_weekly_box('2026-11-02', 'SomeoneElse');
  assert s = 'not_winner', 'others cannot claim';
  s := claim_weekly_box('2026-11-02', 'WinnerAAA');
  assert s = 'claimed', 'winner claims';
  s := claim_weekly_box('2026-11-02', 'WinnerAAA');
  assert s = 'claimed', 'claiming again is harmless';
  s := claim_weekly_box('2026-10-26', 'WinnerAAA');
  assert s = 'not_winner', 'no box that week';

  -- 6. Adresse EVM : insensible à la casse pour réclamer (si elle avait gagné)
  update weekly_box_weeks set winner = '0xAbC0000000000000000000000000000000000001', prize_status = 'won' where week_start = '2026-10-26';
  s := claim_weekly_box('2026-10-26', '0xabc0000000000000000000000000000000000001');
  assert s = 'claimed', 'evm case-insensitive claim';

  raise notice 'weekly box: all scenarios passed';
end $$;
