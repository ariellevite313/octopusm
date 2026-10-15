"use client";

/**
 * /phantom-callback — retour de Phantom (liens profonds) après connect puis signMessage.
 * Connecte l'utilisateur depuis un navigateur mobile classique.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { clearPhantomDeeplink, handleConnectResponse, handleSignResponse } from "@/lib/wallet/phantom-deeplink";

const LS_WALLET_TYPE_KEY = "octo_wallet_type";

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...Array.from(bytes)));
}

function Inner() {
  const params = useSearchParams();
  const { tr } = useT();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const errMsg = params.get("errorMessage");
        if (errMsg) {
          clearPhantomDeeplink();
          if (/reject|cancel|denied|refused/i.test(errMsg)) { window.location.replace("/"); return; }
          throw new Error(errMsg);
        }
        if (params.get("step") === "connect") {
          const nonceBytes = new Uint8Array(16);
          crypto.getRandomValues(nonceBytes);
          const nonce = Array.from(nonceBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
          handleConnectResponse(params, (address, n) => new TextEncoder().encode(
            `Sign in to OMdotfun\nAddress: ${address}\nNonce: ${n}\nTimestamp: ${new Date().toISOString()}`,
          ), nonce);
          return; // redirection vers Phantom pour la signature
        }
        const r = handleSignResponse(params);
        const supabase = createClient();
        const { data, error: fnError } = await supabase.functions.invoke("wallet-auth", {
          body: {
            walletAddress: r.address,
            signature: toBase64(r.signature),
            nonce: r.nonce,
            message: r.messageB64,
            ...(r.ref ? { ref_code: r.ref } : {}),
          },
        });
        if (fnError || !data?.access_token || !data?.refresh_token) throw new Error(fnError?.message ?? "Authentication failed.");
        const { error: sErr } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
        if (sErr) throw new Error(sErr.message);
        try { localStorage.setItem(LS_WALLET_TYPE_KEY, r.wallet); } catch { /* ignore */ }
        clearPhantomDeeplink();
        window.location.replace("/");
      } catch (e) {
        setError(e instanceof Error ? e.message : "An error occurred.");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-8 text-center text-foreground">
      <p className="text-lg font-bold">{error ? tr("Connection failed") : tr("Connecting…")}</p>
      {error ? (
        <>
          <p className="text-sm text-muted-foreground">{tr(error)}</p>
          <button onClick={() => { window.location.href = "/"; }} className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground">{tr("Back")}</button>
        </>
      ) : (
        <div className="size-9 animate-spin rounded-full border-[3px] border-border border-t-primary" />
      )}
    </div>
  );
}

export default function PhantomCallbackPage() {
  return <Suspense fallback={null}><Inner /></Suspense>;
}
