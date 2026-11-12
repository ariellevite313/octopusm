"use client";

/**
 * /phantom-callback — retour de Phantom (liens profonds) après connect puis signMessage.
 * Connecte l'utilisateur depuis un navigateur mobile classique.
 */
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { clearPhantomDeeplink, dropPending, finishDeeplinkLogin, handleConnectResponse, handleSendResponse, handleSessionResponse, handleSignResponse, peekReturnTo, type PendingSend } from "@/lib/wallet/phantom-deeplink";

const LS_WALLET_TYPE_KEY = "octo_wallet_type";

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...Array.from(bytes)));
}

/** Enregistre la transaction côté serveur (le temps qu'elle soit visible, quelques essais). */
async function runRecords(sig: string, records: NonNullable<PendingSend["records"]>): Promise<void> {
  await Promise.all(records.map(async (rec) => {
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 2500 : 3000));
      const r = await fetch(rec.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...rec.body, [rec.sigField]: sig }) }).catch(() => null);
      if (r && r.status !== 404 && r.status !== 503) return;
    }
  }));
}

function Inner() {
  const params = useSearchParams();
  const { tr } = useT();
  const ran = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ title: string; sig?: string } | null>(null);
  const [back, setBack] = useState("/");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const errMsg = params.get("errorMessage");
        const step = params.get("step");
        // Signature d'une transaction ou reconnexion légère : retour sur la page d'origine, sans toucher à la connexion
        if (step === "send" || step === "session") {
          if (errMsg) {
            const to = dropPending();
            setBack(to);
            setNotice({ title: /reject|cancel|denied|refused/i.test(errMsg) ? "Transaction cancelled" : errMsg });
            setTimeout(() => window.location.replace(to), 1500);
            return;
          }
          if (step === "session") {
            const r = handleSessionResponse(params);
            const { data: { user } } = await createClient().auth.getUser();
            const mine = user?.app_metadata?.wallet_address as string | undefined;
            if (mine && mine !== r.address) throw new Error("This is not the wallet you are signed in with.");
            setBack(r.returnTo);
            setNotice({ title: "Wallet ready. Go back and tap Buy or Sell again." });
            setTimeout(() => window.location.replace(r.returnTo), 1200);
            return;
          }
          const sent = handleSendResponse(params);
          setBack(sent.pending.returnTo);
          setNotice({ title: "Transaction sent", sig: sent.signature });
          await Promise.race([runRecords(sent.signature, sent.pending.records ?? []), new Promise((r) => setTimeout(r, 25000))]);
          window.location.replace(sent.pending.returnTo);
          return;
        }
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
            `Sign in to OMdotfun\nAddress: ${address}\nNonce: ${n}\nTimestamp: ${new Date().toISOString()}\nDomain: ${window.location.hostname}`,
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
        finishDeeplinkLogin();
        window.location.replace("/");
      } catch (e) {
        setBack(peekReturnTo());
        setError(e instanceof Error ? e.message : "An error occurred.");
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-8 text-center text-foreground">
      <p className="text-lg font-bold">{error ? tr("Connection failed") : notice ? tr(notice.title) : tr("Connecting…")}</p>
      {notice?.sig && (
        <a href={`https://solscan.io/tx/${notice.sig}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline">{tr("View on Solscan")}</a>
      )}
      {notice ? (
        <button onClick={() => { window.location.replace(back); }} className="rounded-xl bg-foreground px-6 py-3 font-semibold text-background">{tr("Back")}</button>
      ) : error ? (
        <>
          <p className="text-sm text-muted-foreground">{tr(error)}</p>
          <button onClick={() => { window.location.href = back; }} className="rounded-xl bg-foreground px-6 py-3 font-semibold text-background">{tr("Back")}</button>
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
