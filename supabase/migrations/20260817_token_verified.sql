-- Add is_verified flag to launchpad_tokens
-- Set by admin to show a verified badge on token cards

ALTER TABLE launchpad_tokens
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false;
