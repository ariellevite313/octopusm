"use client";

import { createClient } from "@/lib/supabase/client";
import { getProviderByType, type WalletType } from "./adapters";

export interface WalletAuthResult {
  success: boolean;
  walletAddress: string | null;
  error?: string;
}

function buildSignMessage(address: string, nonce: string): Uint8Array {
  const message = `Sign in to OMdotfun\nAddress: ${address}\nNonce: ${nonce}`;
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

export async function connectWalletAndAuth(
  walletType: WalletType
): Promise<WalletAuthResult> {
  const supabase = createClient();

  // Capture the referral code — sessionStorage first (survives navigation), fallback to URL param
  const refCode =
    typeof window !== "undefined"
      ? (sessionStorage.getItem("referral_code") ??
         new URLSearchParams(window.location.search).get("ref") ??
         undefined)
      : undefined;

  try {
    const provider = getProviderByType(walletType);
    if (!provider) {
      throw new Error(`Wallet ${walletType} not detected. Please install the extension.`);
    }
    if (!provider.signMessage) {
      throw new Error(`Wallet ${walletType} does not support message signing.`);
    }

    await provider.connect();
    const address = provider.publicKey?.toString();
    if (!address) throw new Error("Could not retrieve public key from wallet.");

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      const meta = sessionData.session.user?.user_metadata;
      if (meta?.wallet_address === address) {
        return { success: true, walletAddress: address };
      }
    }

    const nonce = generateNonce();
    const message = buildSignMessage(address, nonce);

    const { signature } = await provider.signMessage(message, "utf8");

    const { data, error } = await supabase.functions.invoke("wallet-auth", {
      body: {
        walletAddress: address,
        signature: toBase64(signature),
        nonce,
        message: toBase64(message),
        ...(refCode ? { ref_code: refCode } : {}),
      },
    });

    // Clear the stored ref code after use so it doesn't apply to future logins
    if (typeof window !== "undefined") sessionStorage.removeItem("referral_code");

    if (error) {
      let errorMsg = error.message;
      if ("context" in error && error.context instanceof Response) {
        try {
          const body = await (error.context as Response).json();
          errorMsg = body?.error ?? errorMsg;
        } catch { /* ignore */ }
      }
      throw new Error(`Edge Function : ${errorMsg}`);
    }
    if (!data?.access_token || !data?.refresh_token) {
      throw new Error("Authentication failed: no token returned from Edge Function.");
    }

    const { error: sessionError } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    });
    if (sessionError) throw new Error(`Session : ${sessionError.message}`);

    return { success: true, walletAddress: address };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[wallet-auth]", msg);
    return { success: false, walletAddress: null, error: msg };
  }
}

export async function disconnectWallet(walletType: WalletType | null): Promise<void> {
  const supabase = createClient();
  try {
    await supabase.auth.signOut();
    if (walletType) {
      const provider = getProviderByType(walletType);
      if (provider?.isConnected && provider.disconnect) {
        await provider.disconnect();
      }
    }
  } catch (err) {
    console.error("[wallet-auth] Disconnect error:", err);
  }
}

export async function isAdminWallet(): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return !!data;
}
