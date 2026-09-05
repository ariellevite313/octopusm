-- Add 'swap' and 'launch' types to octo_transactions
ALTER TABLE public.octo_transactions
  DROP CONSTRAINT IF EXISTS octo_transactions_type_check;

ALTER TABLE public.octo_transactions
  ADD CONSTRAINT octo_transactions_type_check
  CHECK (type IN ('bet', 'task', 'referral', 'launch', 'swap'));

-- Index on (type, label) for quick duplicate-claim check
CREATE INDEX IF NOT EXISTS octo_transactions_type_label_idx
  ON public.octo_transactions (type, label)
  WHERE type = 'swap';
