-- Add is_creator_verified flag to wallets table
-- Controlled by admin only — badge shown on launchpad token cards

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS is_creator_verified BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN wallets.is_creator_verified IS
  'Set to true by admin to display a verified badge on creator token cards';
