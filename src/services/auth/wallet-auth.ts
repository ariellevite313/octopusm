/**
 * Auth wallet → JWT Supabase
 *
 * Flow :
 *   1. L'utilisateur connecte son wallet Phantom
 *   2. On génère un nonce aléatoire + timestamp
 *   3. On demande à Phantom de signer le message
 *   4. On envoie { address, signature, nonce } à la Supabase Edge Function
 *   5. La Edge Function vérifie la signature ed25519 et renvoie un JWT Supabase
 *   6. On appelle supabase.auth.setSession() avec le JWT reçu
 */

import { supabase } from "../../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WalletAuthResult {
  success: boolean;
  walletAddress: string | null;
  error?: string;
}

interface PhantomProvider {
  publicKey: { toBase58(): string } | null;
  isConnected: boolean;
  connect(): Promise<{ publicKey: { toBase58(): string } }>;
  disconnect(): Promise<void>;
  signMessage(
    message: Uint8Array,
    encoding: "utf8"
  ): Promise<{ signature: Uint8Array }>;
}

declare global {
  interface Window {
    solana?: PhantomProvider;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPhantom(): PhantomProvider {
  const phantom = window.solana;
  if (!phantom) {
    throw new Error(
      "Phantom wallet non détecté. Installe l'extension Phantom."
    );
  }
  return phantom;
}

function buildSignMessage(address: string, nonce: string): Uint8Array {
  const message = [
    "Connexion à Octopus Market",
    "",
    `Adresse : ${address}`,
    `Nonce   : ${nonce}`,
    `Heure   : ${new Date().toISOString()}`,
    "",
    "En signant ce message, tu confirmes que tu es propriétaire de ce wallet.",
    "Aucune transaction ne sera effectuée.",
  ].join("\n");
  return new TextEncoder().encode(message);
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Connect ──────────────────────────────────────────────────────────────────

/**
 * Connecte le wallet Phantom et crée/renouvelle la session Supabase via JWT custom.
 */
export async function connectWalletAndAuth(): Promise<WalletAuthResult> {
  try {
    const phantom = getPhantom();

    // 1. Connexion Phantom
    await phantom.connect();
    const address = phantom.publicKey?.toBase58();
    if (!address) throw new Error("Impossible d'obtenir la clé publique.");

    // 2. Vérifier si la session Supabase est encore valide
    const { data: session } = await supabase.auth.getSession();
    if (session.session) {
      const meta = session.session.user?.user_metadata;
      if (meta?.wallet_address === address) {
        // Session déjà valide pour ce wallet — pas besoin de re-signer
        return { success: true, walletAddress: address };
      }
    }

    // 3. Générer le nonce et demander la signature
    const nonce = generateNonce();
    const message = buildSignMessage(address, nonce);
    const { signature } = await phantom.signMessage(message, "utf8");

    // 4. Envoyer à la Supabase Edge Function
    const { data, error } = await supabase.functions.invoke("wallet-auth", {
      body: {
        walletAddress: address,
        signature: toBase64(signature),
        nonce,
        message: btoa(new TextDecoder().decode(message)),
      },
    });

    if (error) {
      throw new Error(`Erreur Edge Function : ${error.message}`);
    }

    if (!data?.access_token || !data?.refresh_token) {
      throw new Error("La Edge Function n'a pas renvoyé de token.");
    }

    // 5. Initialiser la session Supabase
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });

    if (sessionError) {
      throw new Error(`Erreur session : ${sessionError.message}`);
    }

    return { success: true, walletAddress: address };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue";
    console.error("[wallet-auth]", message);
    return { success: false, walletAddress: null, error: message };
  }
}

// ─── Disconnect ───────────────────────────────────────────────────────────────

export async function disconnectWallet(): Promise<void> {
  try {
    await supabase.auth.signOut();
    const phantom = window.solana;
    if (phantom?.isConnected) {
      await phantom.disconnect();
    }
  } catch (err) {
    console.error("[wallet-auth] Erreur déconnexion :", err);
  }
}

// ─── Get current wallet ───────────────────────────────────────────────────────

export async function getCurrentWalletAddress(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.user_metadata?.wallet_address ?? null;
}

export async function isAdminWallet(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return !!data;
}
