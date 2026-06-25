-- Migration : ajout de la colonne event_start_at sur prediction_markets
-- Backward compatible : les marchés existants auront NULL (aucun impact)

ALTER TABLE prediction_markets
  ADD COLUMN IF NOT EXISTS event_start_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN prediction_markets.event_start_at IS
  'Date et heure de début de l''événement (UTC). NULL = pas de date de début définie. '
  'Quand now() >= event_start_at : le marché passe en statut LIVE et les paris sont bloqués.';
