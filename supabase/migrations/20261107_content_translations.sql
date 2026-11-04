-- Cache des traductions de posts et de réponses (une ligne par contenu et par langue).
-- Une traduction n'est demandée qu'une fois au fournisseur, ensuite elle est relue ici.
CREATE TABLE IF NOT EXISTS public.content_translations (
  kind       text        NOT NULL CHECK (kind IN ('post', 'reply')),
  ref_id     uuid        NOT NULL,
  lang       text        NOT NULL,
  text       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, ref_id, lang)
);
ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;
-- Aucune policy : seul le serveur (clé service) lit et écrit.
