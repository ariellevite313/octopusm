-- Discover : nombre de visites de chaque site (clic sur « Discover »). Idempotent.
ALTER TABLE public.discover_apps ADD COLUMN IF NOT EXISTS visits bigint NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.discover_visit(p_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE discover_apps SET visits = visits + 1 WHERE id = p_id AND status = 'live';
$$;
REVOKE ALL ON FUNCTION public.discover_visit(uuid) FROM public, anon, authenticated;
