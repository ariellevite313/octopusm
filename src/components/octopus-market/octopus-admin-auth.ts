/**
 * octopus-admin-auth.ts — MIGRÉ VERS SUPABASE
 *
 * L'authentification admin est désormais gérée par Supabase Auth + RLS.
 * La session est un JWT Supabase (plus de sessionStorage).
 * Le rôle admin est stocké dans wallets.role = 'admin' et vérifié via is_admin().
 *
 * Les exports conservent les mêmes signatures pour ne pas casser les composants.
 */

import { supabase } from "@/lib/supabase";
import { connectWalletAndAuth, isAdminWallet } from "@/services/auth/wallet-auth";

// ─── Types (conservés pour compatibilité) ────────────────────────────────────

type AdminSessionRecord = {
  token: string;
  walletAddress: string;
  expiresAt: number;
};

// ─── Lecture session ──────────────────────────────────────────────────────────

/**
 * Lit la session admin depuis Supabase Auth.
 * Retourne null si non connecté ou non admin.
 */
export async function readAdminSession(): Promise<AdminSessionRecord | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;

  const walletAddress: string | undefined =
    data.session.user?.user_metadata?.wallet_address;
  if (!walletAddress) return null;

  const admin = await isAdminWallet();
  if (!admin) return null;

  return {
    token: data.session.access_token,
    walletAddress,
    expiresAt: (data.session.expires_at ?? 0) * 1000,
  };
}

/**
 * Version synchrone (compatibilité legacy) — lit uniquement la session en cache.
 * Utiliser readAdminSession() (async) pour une vérification complète.
 */
export function readAdminSessionSync(): AdminSessionRecord | null {
  // Supabase gère la session en mémoire — on ne peut pas lire de façon synchrone
  // sans accéder à sessionStorage. On retourne null ici et on laisse les composants
  // utiliser readAdminSession() async ou l'état React.
  return null;
}

// ─── Déconnexion ──────────────────────────────────────────────────────────────

export async function clearAdminSession(): Promise<void> {
  await supabase.auth.signOut();
}

// ─── Connexion / Création session ─────────────────────────────────────────────

/**
 * Crée la session admin via Supabase Auth + vérification wallet.
 * Remplace l'ancienne logique hardcodée (comparaison d'adresse).
 */
export async function ensureAdminSession(
  walletAddress: string | null
): Promise<AdminSessionRecord | null> {
  if (!walletAddress) return null;

  // Vérifier si une session valide existe déjà
  const existing = await readAdminSession();
  if (existing && existing.walletAddress === walletAddress) {
    return existing;
  }

  // Connexion via signature Phantom
  const result = await connectWalletAndAuth();
  if (!result.success || result.walletAddress !== walletAddress) {
    return null;
  }

  // Vérifier le rôle admin
  return readAdminSession();
}

// ─── Headers (compatibilité legacy — plus utilisés avec Supabase) ─────────────

/**
 * @deprecated Supabase gère l'auth via JWT dans le client.
 * Cette fonction est conservée uniquement pour éviter des erreurs de compilation.
 * Les appels Supabase n'ont pas besoin de headers manuels.
 */
export function buildStoredAdminAuthHeaders(
  _walletAddress: string | null
): Record<string, string> | null {
  // Avec Supabase, le client gère automatiquement le JWT dans chaque requête.
  // Cette fonction ne doit plus être appelée — les anciens endpoints API sont supprimés.
  console.warn(
    "[octopus-admin-auth] buildStoredAdminAuthHeaders est obsolète avec Supabase."
  );
  return {};
}
