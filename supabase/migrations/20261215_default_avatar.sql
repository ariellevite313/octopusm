-- Omero comme photo de profil par défaut, pour les anciens comptes et les nouveaux.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'avatar_src') THEN
    UPDATE wallets SET avatar_src = '/omero-default.jpg' WHERE avatar_src IS NULL OR btrim(avatar_src) = '';
    ALTER TABLE wallets ALTER COLUMN avatar_src SET DEFAULT '/omero-default.jpg';
  END IF;
END $$;

-- Si une photo est retirée (vide ou nulle), Omero revient
CREATE OR REPLACE FUNCTION wallets_default_avatar() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.avatar_src IS NULL OR btrim(NEW.avatar_src) = '' THEN
    NEW.avatar_src := '/omero-default.jpg';
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'wallets' AND column_name = 'avatar_src') THEN
    DROP TRIGGER IF EXISTS trg_wallets_default_avatar ON wallets;
    CREATE TRIGGER trg_wallets_default_avatar BEFORE INSERT OR UPDATE OF avatar_src ON wallets
      FOR EACH ROW EXECUTE FUNCTION wallets_default_avatar();
  END IF;
END $$;

-- Anciens commentaires sans photo
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['market_comments', 'mutuel_market_comments', 'updown_market_comments'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'avatar_src') THEN
      EXECUTE format('UPDATE %I SET avatar_src = %L WHERE avatar_src IS NULL OR btrim(avatar_src) = %L', t, '/omero-default.jpg', '');
    END IF;
  END LOOP;
END $$;
