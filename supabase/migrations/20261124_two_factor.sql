-- Double vérification (2FA) par application d'authentification (TOTP, 6 chiffres), au choix de chaque utilisateur.
-- Le secret est chiffré côté serveur ; les codes de secours ne sont gardés que sous forme d'empreinte (SHA-256).
CREATE TABLE IF NOT EXISTS public.user_2fa (
  wallet      text PRIMARY KEY,
  secret      text NOT NULL,                   -- chiffré (AES-256-GCM)
  enabled     boolean NOT NULL DEFAULT false,  -- false tant que le premier code n'a pas été confirmé
  recovery    text[] NOT NULL DEFAULT '{}',    -- empreintes des codes de secours restants
  last_step   bigint NOT NULL DEFAULT 0,       -- dernier pas de 30 s accepté (un code ne sert qu'une fois)
  created_at  timestamptz NOT NULL DEFAULT now(),
  enabled_at  timestamptz
);
ALTER TABLE public.user_2fa ENABLE ROW LEVEL SECURITY;
-- Aucune politique : lecture et écriture uniquement par le serveur (clé service).
