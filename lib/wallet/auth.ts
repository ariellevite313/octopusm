"use client";

import { createClient } from "@/lib/supabase/client";
import { getProviderByType, type WalletType } from "./adapters";

export interface WalletAuthResult {
  success: boolean;
  walletAddress: string | null;
  error?: string;
}

function buildSignMessage(address: string, nonce: string): Uint8Array {
  // Timestamp is included so the Edge Function can enforce a 5-minute expiry (REF-C fix)
  const timestamp = new Date().toISOString();
  const message = `Sign in to OMdotfun\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
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

// ─── MetaMask (EVM) ──────────────────────────────────────────────────────────

function getMetaMaskEthProvider(): {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
} | null {
  if (typeof window === "undefined") return null;
  const eth = (window as any).ethereum;
  if (!eth) return null;
  if (Array.isArray(eth.providers)) {
    const mm = eth.providers.find((p: any) => p.isMetaMask && !p.isPhantom);
    return mm ?? null;
  }
  return eth.isMetaMask && !eth.isPhantom ? eth : null;
}

async function connectMetaMaskAndAuth(refCode?: string): Promise<WalletAuthResult> {
  const eth = getMetaMaskEthProvider();
  if (!eth) {
    return { success: false, walletAddress: null, error: "MetaMask not detected. Please install the extension." };
  }

  try {
    const accounts = await eth.request({ method: "eth_requestAccounts" }) as string[];
    const address = accounts[0];
    if (!address) throw new Error("Could not retrieve address from MetaMask.");

    const supabase = createClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user?.user_metadata?.wallet_address?.toLowerCase() === address.toLowerCase()) {
      return { success: true, walletAddress: address };
    }

    const nonce = generateNonce();
    const timestamp = new Date().toISOString();
    const messageText = `Sign in to OMdotfun\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

    // personal_sign expects hex-encoded message
    const msgBytes = new TextEncoder().encode(messageText);
    const msgHex = "0x" + Array.from(msgBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    const signature = await eth.request({
      method: "personal_sign",
      params: [msgHex, address],
    }) as string;

    const { data, error } = await supabase.functions.invoke("wallet-auth", {
      body: {
        walletAddress: address,
        signature,
        nonce,
        message: btoa(messageText),
        chain: "evm",
        ...(refCode ? { ref_code: refCode } : {}),
      },
    });

    if (typeof window !== "undefined") sessionStorage.removeItem("referral_code");

    if (error) {
      let errorMsg = error.message;
      if ("context" in error && error.context instanceof Response) {
        try { const body = await (error.context as Response).json(); errorMsg = body?.error ?? errorMsg; } catch { /* ignore */ }
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
    const msg =
      err instanceof Error ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : typeof err === "string" ? err : "Connection failed";
    const isUserCancel = /reject|cancel|denied|refused/i.test(msg) ||
      (typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === 4001);
    return { success: false, walletAddress: null, error: isUserCancel ? "Connection cancelled." : msg };
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function connectWalletAndAuth(
  walletType: WalletType
): Promise<WalletAuthResult> {
  // MetaMask uses EVM signing — separate flow
  if (walletType === "metamask") {
    const refCode =
      typeof window !== "undefined"
        ? (sessionStorage.getItem("referral_code") ??
           new URLSearchParams(window.location.search).get("ref") ??
           undefined)
        : undefined;
    return connectMetaMaskAndAuth(refCode ?? undefined);
  }

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

    // Trust Wallet ne supporte pas le 2e argument "utf8" et peut retourner
    // directement un Uint8Array au lieu de { signature: Uint8Array }
    const signResult = await provider.signMessage(message).catch(() =>
      provider.signMessage!(message, "utf8")
    );
    const signature: Uint8Array =
      signResult instanceof Uint8Array
        ? signResult
        : (signResult as { signature: Uint8Array }).signature;

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
    // Trust Wallet et d'autres wallets lancent des objets { code, message }
    // qui ne sont pas des instances Error standard
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : typeof err === "string"
            ? err
            : "Connection failed";
    console.error("[wallet-auth]", err);
    // Masquer "User rejected" / annulation volontaire
    const isUserCancel = /reject|cancel|denied|refused/i.test(msg) ||
      (typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === 4001);
    return {
      success: false,
      walletAddress: null,
      error: isUserCancel ? "Connection cancelled." : msg,
    };
  }
}

export async function disconnectWallet(walletType: WalletType | null): Promise<void> {
  const supabase = createClient();
  try {
    await supabase.auth.signOut();
    // MetaMask has no disconnect API — just sign out of Supabase
    if (walletType && walletType !== "metamask") {
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
