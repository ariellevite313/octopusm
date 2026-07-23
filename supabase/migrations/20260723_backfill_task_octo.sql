-- Backfill OCTO for already-claimed tasks
--
-- Root cause: complete-task Edge Function was inserting ref_id (non-existent column)
-- which caused PostgREST to reject ALL octo_transactions inserts for tasks.
-- Result: user_task_completions rows existed (task marked claimed) but no OCTO was ever credited.
--
-- This migration inserts one octo_transactions row per completion that has no task_id match.
-- Safe to run multiple times (idempotent via NOT EXISTS on task_id).
-- Must be run AFTER 20260723_octo_transactions_columns.sql (adds task_id column).

INSERT INTO public.octo_transactions (wallet_address, type, amount, task_id)
SELECT
  utc.wallet_address,
  'task',
  t.reward_octo,
  t.id
FROM public.user_task_completions utc
JOIN public.tasks t ON t.id = utc.task_id
WHERE t.reward_octo > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.octo_transactions ot
    WHERE ot.wallet_address = utc.wallet_address
      AND ot.task_id        = t.id
  );
