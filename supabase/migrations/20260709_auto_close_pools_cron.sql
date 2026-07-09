-- ============================================================
-- Auto-close expired pools via pg_cron
-- Run once in Supabase SQL editor
-- Requires pg_cron extension (enabled by default on Supabase)
-- ============================================================

-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule: every 5 minutes, call the edge function via http extension
-- OR use a direct SQL update (simpler, no HTTP needed)

-- Option A (recommended — pure SQL, no edge function HTTP call needed):
-- This runs directly in the DB every 5 minutes
SELECT cron.schedule(
  'auto-close-expired-pools',     -- job name (unique)
  '*/5 * * * *',                  -- every 5 minutes
  $$
    UPDATE mutuel_markets
    SET status = 'closed'
    WHERE status = 'active'
      AND betting_closes_at < NOW();
  $$
);

-- To verify the job was created:
-- SELECT * FROM cron.job WHERE jobname = 'auto-close-expired-pools';

-- To remove the job if needed:
-- SELECT cron.unschedule('auto-close-expired-pools');
