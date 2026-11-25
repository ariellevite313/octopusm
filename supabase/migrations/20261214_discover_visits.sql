-- Discover : nombre de visites de chaque site (clic sur « Discover »). Idempotent.
ALTER TABLE public.discover_apps ADD COLUMN IF NOT EXISTS visits bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.discover_visit(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE discover_apps SET visits = visits + 1 WHERE id = p_id AND status = 'live';
$$;
REVOKE ALL ON FUNCTION public.discover_visit(uuid) FROM public, anon, authenticated;

-- Signalements d'un projet Discover (un par compte). Masqué automatiquement à 5 signalements, l'admin décide ensuite.
CREATE TABLE IF NOT EXISTS public.discover_reports (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id     uuid NOT NULL REFERENCES public.discover_apps (id) ON DELETE CASCADE,
  reporter   text NOT NULL,
  reason     text NOT NULL CHECK (reason IN ('asks_seed', 'scam', 'fake', 'no_token_payment', 'other')),
  note       text CHECK (note IS NULL OR char_length(note) <= 300),
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (app_id, reporter)
);
CREATE INDEX IF NOT EXISTS idx_discover_reports_open ON public.discover_reports (status, created_at DESC);
ALTER TABLE public.discover_reports ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.discover_auto_hide() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM discover_reports WHERE app_id = NEW.app_id AND status = 'open') >= 5 THEN
    UPDATE discover_apps SET status = 'hidden' WHERE id = NEW.app_id AND status = 'live';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_discover_auto_hide ON public.discover_reports;
CREATE TRIGGER trg_discover_auto_hide AFTER INSERT ON public.discover_reports FOR EACH ROW EXECUTE FUNCTION public.discover_auto_hide();
