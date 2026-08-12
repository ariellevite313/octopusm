-- Tighten creator_fee_pct constraint to match API validation.
-- The API only accepts creator_fee_pct = 1 (on-chain fees are governed by
-- DBC_CONFIG_KEY, not this column). The old constraint allowing 1 or 2 is dead.

ALTER TABLE launchpad_tokens
  DROP CONSTRAINT IF EXISTS launchpad_tokens_creator_fee_pct_check;

ALTER TABLE launchpad_tokens
  ADD CONSTRAINT launchpad_tokens_creator_fee_pct_check
  CHECK (creator_fee_pct = 1);
