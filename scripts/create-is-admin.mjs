// scripts/create-is-admin.mjs
// Exécuter depuis le dossier du projet :  node --env-file=.env.local scripts/create-is-admin.mjs

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY in the environment.");
  process.exit(1);
}
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SQL = `
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet TEXT;
BEGIN
  v_wallet := (auth.jwt() -> 'app_metadata' ->> 'wallet_address');
  IF v_wallet IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.wallets
    WHERE address = v_wallet
      AND role = 'admin'
  );
END;
$$;
`;

// Supabase REST ne permet pas le DDL directement.
// On passe par l'API Management avec le service key via /pg endpoint.
const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: SQL }),
  }
);

if (!res.ok) {
  // L'API Management nécessite un personal access token — fallback: tester si la fonction existe
  console.log("L'API Management nécessite ton Personal Access Token Supabase.");
  console.log("   → Supabase Dashboard → Account → Access Tokens");
  console.log("");

  // Vérifier si is_admin() existe déjà
  const { data, error } = await supabase.rpc("is_admin");
  if (error && error.message.includes("not find")) {
    console.log("is_admin() n'existe pas encore dans ta base.");
    console.log("   Copie le SQL ci-dessous dans Supabase → SQL Editor :\n");
    console.log(SQL);
  } else {
    console.log("is_admin() existe déjà !", data);
  }
} else {
  const json = await res.json();
  console.log("is_admin() créée avec succès :", json);
}
