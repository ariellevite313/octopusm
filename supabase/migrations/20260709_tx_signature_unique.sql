-- Add tx_signature column to payments if it does not exist, then add unique index

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS tx_signature TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payments_tx_signature_unique
  ON payments (tx_signature)
  WHERE tx_signature IS NOT NULL;
