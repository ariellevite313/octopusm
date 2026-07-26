-- ============================================================
-- Cron jobs pour les rounds Up/Down — toutes les minutes
-- À exécuter dans le SQL Editor Supabase
--
-- AVANT D'EXÉCUTER : remplace les deux placeholders :
--   YOUR_PROJECT_REF   → ex: abcdefghijklmnop
--   YOUR_SERVICE_ROLE  → Settings > API > service_role (secret)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Supprimer les anciens jobs si existants (re-run safe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resolve-updown-markets') THEN
    PERFORM cron.unschedule('resolve-updown-markets');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'create-updown-markets') THEN
    PERFORM cron.unschedule('create-updown-markets');
  END IF;
END $$;

-- 1. Résolution — chaque minute
--    (le resolver attend 30s après resolve_at avant de fetcher les klines)
SELECT cron.schedule(
  'resolve-updown-markets',
  '* * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/resolve-updown-markets',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- 2. Création — chaque minute
--    Crée les prochains rounds dès qu'un slot est libre
SELECT cron.schedule(
  'create-updown-markets',
  '* * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/create-updown-markets',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);

-- Vérification après exécution :
-- SELECT jobname, schedule FROM cron.job WHERE jobname LIKE '%updown%';
