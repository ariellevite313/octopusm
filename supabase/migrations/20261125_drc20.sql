-- DRC-20 (Dogecoin) indexé par omdotfun-drc20-indexer. Lecture publique par OMdotfun, écriture par l'indexer seul (clé service).
-- Montants : entiers à l'échelle 10^dec (numeric), comme sur la chaîne.

CREATE TABLE IF NOT EXISTS public.drc20_tokens (
  tick        text PRIMARY KEY,               -- 4 caractères, en minuscules
  max_supply  numeric(78,0) NOT NULL,
  lim         numeric(78,0) NOT NULL,
  dec         smallint NOT NULL,
  minted      numeric(78,0) NOT NULL DEFAULT 0,
  deployer    text NOT NULL,
  inscription text NOT NULL,
  height      integer NOT NULL,
  holders     integer NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.drc20_balances (
  tick     text NOT NULL,
  address  text NOT NULL,
  avail    numeric(78,0) NOT NULL DEFAULT 0,
  trans    numeric(78,0) NOT NULL DEFAULT 0,
  PRIMARY KEY (tick, address)
);
CREATE INDEX IF NOT EXISTS drc20_balances_addr ON public.drc20_balances (address);
CREATE INDEX IF NOT EXISTS drc20_balances_top ON public.drc20_balances (tick, avail DESC);

-- Inscriptions de transfert pas encore envoyées (montant bloqué chez l'expéditeur)
CREATE TABLE IF NOT EXISTS public.drc20_pending (
  id      text PRIMARY KEY,
  tick    text NOT NULL,
  amt     numeric(78,0) NOT NULL,
  sender  text NOT NULL,
  txid    text NOT NULL,
  vout    integer NOT NULL,
  "offset" numeric(30,0) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.drc20_events (
  id          bigserial PRIMARY KEY,
  height      integer NOT NULL,
  txid        text NOT NULL,
  kind        text NOT NULL,                 -- deploy, mint, inscribe_transfer, transfer, return, burn
  tick        text NOT NULL,
  from_addr   text,
  to_addr     text,
  amt         numeric(78,0) NOT NULL,
  inscription text NOT NULL
);
CREATE INDEX IF NOT EXISTS drc20_events_tick ON public.drc20_events (tick, height DESC);
CREATE INDEX IF NOT EXISTS drc20_events_from ON public.drc20_events (from_addr, height DESC);
CREATE INDEX IF NOT EXISTS drc20_events_to ON public.drc20_events (to_addr, height DESC);

CREATE TABLE IF NOT EXISTS public.drc20_state (
  id      smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  height  integer NOT NULL,
  hash    text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.drc20_tokens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drc20_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drc20_pending  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drc20_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drc20_state    ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY drc20_tokens_read   ON public.drc20_tokens   FOR SELECT USING (true);
  CREATE POLICY drc20_balances_read ON public.drc20_balances FOR SELECT USING (true);
  CREATE POLICY drc20_events_read   ON public.drc20_events   FOR SELECT USING (true);
  CREATE POLICY drc20_state_read    ON public.drc20_state    FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

/**
 * Écrit tout un bloc d'un coup (une seule transaction SQL) : soit tout passe, soit rien.
 * Refuse un bloc déjà écrit : un bloc ne peut jamais être appliqué deux fois. Les blocs sans DRC-20 ne sont
 * pas écrits un par un (seule la hauteur avance de temps en temps).
 */
CREATE OR REPLACE FUNCTION public.drc20_commit_block(
  p_height integer, p_hash text, p_tokens jsonb, p_balances jsonb, p_pending_put jsonb, p_pending_drop jsonb, p_events jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cur integer;
BEGIN
  SELECT height INTO cur FROM drc20_state WHERE id = 1 FOR UPDATE;
  IF cur IS NOT NULL AND p_height <= cur THEN RAISE EXCEPTION 'drc20: block % already written (last %)', p_height, cur; END IF;

  INSERT INTO drc20_tokens (tick, max_supply, lim, dec, minted, deployer, inscription, height, updated_at)
  SELECT x->>'tick', (x->>'max')::numeric, (x->>'lim')::numeric, (x->>'dec')::smallint, (x->>'minted')::numeric, x->>'deployer', x->>'inscription', (x->>'height')::int, now()
  FROM jsonb_array_elements(p_tokens) x
  ON CONFLICT (tick) DO UPDATE SET minted = EXCLUDED.minted, updated_at = now();

  INSERT INTO drc20_balances (tick, address, avail, trans)
  SELECT x->>'tick', x->>'address', (x->>'avail')::numeric, (x->>'trans')::numeric FROM jsonb_array_elements(p_balances) x
  ON CONFLICT (tick, address) DO UPDATE SET avail = EXCLUDED.avail, trans = EXCLUDED.trans;
  DELETE FROM drc20_balances WHERE avail = 0 AND trans = 0 AND (tick, address) IN (SELECT x->>'tick', x->>'address' FROM jsonb_array_elements(p_balances) x);

  DELETE FROM drc20_pending WHERE id IN (SELECT jsonb_array_elements_text(p_pending_drop));
  INSERT INTO drc20_pending (id, tick, amt, sender, txid, vout, "offset")
  SELECT x->>'id', x->>'tick', (x->>'amt')::numeric, x->>'from', x->>'txid', (x->>'vout')::int, (x->>'offset')::numeric FROM jsonb_array_elements(p_pending_put) x
  ON CONFLICT (id) DO UPDATE SET txid = EXCLUDED.txid, vout = EXCLUDED.vout, "offset" = EXCLUDED."offset";

  INSERT INTO drc20_events (height, txid, kind, tick, from_addr, to_addr, amt, inscription)
  SELECT (x->>'height')::int, x->>'txid', x->>'kind', x->>'tick', x->>'from', x->>'to', (x->>'amt')::numeric, x->>'inscription' FROM jsonb_array_elements(p_events) x;

  -- Nombre de holders des tokens touchés
  UPDATE drc20_tokens t SET holders = (SELECT count(*) FROM drc20_balances b WHERE b.tick = t.tick AND (b.avail > 0 OR b.trans > 0))
  WHERE t.tick IN (SELECT DISTINCT x->>'tick' FROM jsonb_array_elements(p_balances) x);

  INSERT INTO drc20_state (id, height, hash, updated_at) VALUES (1, p_height, p_hash, now())
  ON CONFLICT (id) DO UPDATE SET height = EXCLUDED.height, hash = EXCLUDED.hash, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.drc20_commit_block(integer, text, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
