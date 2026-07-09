-- Migration: add slug column to prediction_markets
-- Run in Supabase SQL editor (safe — adds a new column, nothing is removed)

-- Step 1: Add nullable column
ALTER TABLE prediction_markets
ADD COLUMN IF NOT EXISTS slug TEXT;

-- Step 2: Preview what slugs will look like before applying
-- (run this SELECT first, then comment it out and run the UPDATE)
/*
SELECT id,
  regexp_replace(
    regexp_replace(id, '^[a-z]+-market-', ''),
    '-[a-z0-9]{8}$', ''
  ) AS proposed_slug
FROM prediction_markets
WHERE slug IS NULL;
*/

-- Step 3: Backfill — strip "{prefix}-market-" and "-{8char-suffix}"
UPDATE prediction_markets
SET slug = regexp_replace(
  regexp_replace(id, '^[a-z]+-market-', ''),
  '-[a-z0-9]{8}$', ''
)
WHERE slug IS NULL;

-- Step 4: Unique constraint (run AFTER verifying no duplicates in the SELECT above)
ALTER TABLE prediction_markets
ADD CONSTRAINT prediction_markets_slug_key UNIQUE (slug);

-- Step 5: Index for fast lookup by slug
CREATE INDEX IF NOT EXISTS idx_prediction_markets_slug
ON prediction_markets (slug);
