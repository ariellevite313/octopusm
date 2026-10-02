"use client";

/**
 * /mobile-connect
 *
 * Page de relais de session pour TWA.
 *
 * Flux :
 *  1. Dans le TWA, si le wallet n'est pas détecté, on redirige vers le deeplink
 *     du wallet (ex. Phantom) en passant cette page comme URL cible.
 *  2. Phantom ouvre cette page dans son navigateur intégré : window.phantom est injecté.
 *  3. On connecte automatiquement le wallet + signature + appel wallet-auth.
 *  4. On redirige vers https://omdot.fun/#twa_session=<tokens_b64>
 *  5. Android (Digital Asset Links) intercepte cet URL et le rouvre dans la TWA.
 *  6. auth-provider.tsx détecte #twa_session et restaure la session Supabase.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getProviderByType, type WalletType } from "@/lib/wallet/adapters";
import { createClient } from "@/lib/supabase/client";

// ─── Helpers (dupliqués depuis lib/wallet/auth.ts pour éviter les imports circulaires) ──

function buildSignMessage(address: string, nonce: string): Uint8Array {
  const timestamp = new Date().toISOString();
  const message = `Sign in to OMdotfun\nAddress: ${address}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;
  return new TextEncoder().encode(message);
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...Array.from(bytes)));
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Page interne ─────────────────────────────────────────────────────────────

type Status = "waiting" | "connecting" | "signing" | "authenticating" | "redirecting" | "error";

function MobileConnectInner() {
  const searchParams = useSearchParams();
  const attempted = useRef(false);
  const [status, setStatus] = useState<Status>("waiting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    const walletParam = searchParams.get("wallet") as WalletType | null;
    const refCode = searchParams.get("ref") ?? undefined;
    // URL de retour (la page d'accueil de la TWA)
    const returnBase = "https://omdot.fun/";

    if (!walletParam) {
      window.location.href = returnBase;
      return;
    }

    async function doConnect() {
      // 1. Attendre l'injection du wallet (max 4 s)
      setStatus("connecting");
      let provider = getProviderByType(walletParam!);
      if (!provider) {
        for (let i = 0; i < 40; i++) {
          await new Promise((r) => setTimeout(r, 100));
          provider = getProviderByType(walletParam!);
          if (provider) break;
        }
      }

      if (!provider) {
        // Wallet non détecté : retour silencieux vers la TWA
        window.location.href = returnBase;
        return;
      }

      try {
        // 2. Connecter le wallet
        await provider.connect();
        const address = provider.publicKey?.toString();
        if (!address) throw new Error("Impossible de récupérer la clé publique.");

        // 3. Signer le message
        setStatus("signing");
        const nonce = generateNonce();
        const message = buildSignMessage(address, nonce);

        const signResult = await provider.signMessage!(message).catch(() =>
          provider.signMessage!(message, "utf8")
        );
        const signature: Uint8Array =
          signResult instanceof Uint8Array
            ? signResult
            : (signResult as { signature: Uint8Array }).signature;

        // 4. Authentifier via Edge Function
        setStatus("authenticating");
        const supabase = createClient();
        const { data, error: fnError } = await supabase.functions.invoke("wallet-auth", {
          body: {
            walletAddress: address,
            signature: toBase64(signature),
            nonce,
            message: toBase64(message),
            ...(refCode ? { ref_code: refCode } : {}),
          },
        });

        if (fnError || !data?.access_token || !data?.refresh_token) {
          throw new Error(fnError?.message ?? "Authentification échouée.");
        }

        // 5. Encoder les tokens et rediriger vers la TWA
        setStatus("redirecting");
        const payload = btoa(
          JSON.stringify({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            wallet_type: walletParam,
          })
        );

        // Android routera https://omdot.fun/... vers la TWA grâce aux Digital Asset Links
        window.location.href = `${returnBase}#twa_session=${encodeURIComponent(payload)}`;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Une erreur est survenue.";
        // Annulation utilisateur : retour silencieux
        if (/reject|cancel|denied|refused/i.test(msg)) {
          window.location.href = returnBase;
          return;
        }
        setStatus("error");
        setError(msg);
      }
    }

    doConnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const labels: Record<Status, string> = {
    waiting:        "Initialisation…",
    connecting:     "Connexion au wallet…",
    signing:        "En attente de signature…",
    authenticating: "Authentification…",
    redirecting:    "Retour vers l'app…",
    error:          "Erreur",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#fff",
        fontFamily: "'Inter', system-ui, sans-serif",
        gap: 20,
        padding: "0 32px",
        textAlign: "center",
      }}
    >
      {/* Logo */}
      <div style={{ fontSize: 52, marginBottom: 4 }}>🔐</div>

      {/* Titre */}
      <p style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
        {status === "error" ? "Connexion échouée" : "Connexion en cours…"}
      </p>

      {/* Statut */}
      <p style={{ fontSize: 15, color: "#aaa", margin: 0 }}>
        {status === "error" ? error : labels[status]}
      </p>

      {/* Spinner (sauf erreur) */}
      {status !== "error" && (
        <div
          style={{
            width: 36,
            height: 36,
            border: "3px solid #333",
            borderTop: "3px solid #f97316",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
      )}

      {/* Bouton retour en cas d'erreur */}
      {status === "error" && (
        <button
          onClick={() => { window.location.href = "https://omdot.fun/"; }}
          style={{
            marginTop: 8,
            padding: "12px 28px",
            borderRadius: 12,
            background: "#f97316",
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
            border: "none",
            cursor: "pointer",
          }}
        >
          Retour
        </button>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ─── Export (enveloppe Suspense requise par useSearchParams) ──────────────────

export default function MobileConnectPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            background: "#0a0a0a",
          }}
        />
      }
    >
      <MobileConnectInner />
    </Suspense>
  );
}
