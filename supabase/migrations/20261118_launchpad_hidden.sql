-- Tokens masqués (tests, faux lancements) : n'apparaissent plus dans le Terminal.
ALTER TABLE public.launchpad_tokens ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_launchpad_hidden ON public.launchpad_tokens (hidden) WHERE hidden;
