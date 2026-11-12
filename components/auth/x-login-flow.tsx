"use client";

import { useEffect, useRef } from "react";
import { PrivyProvider, usePrivy, useLogin } from "@privy-io/react-auth";
import { createClient } from "@/lib/supabase/client";

type Props = { onDone: (wallet: string) => void; onFail: (message: string) => void; onCancel: () => void };

/** Echange le jeton Privy contre une session OM (le serveur verifie tout, le client n'envoie que le jeton). */
async function openSession(token: string): Promise<{ wallet: string } | { error: string }> {
  for (let i = 0; i < 6; i++) {
    const r = await fetch("/api/auth/privy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 409 && j?.error === "Wallet not ready, try again") { await new Promise((ok) => setTimeout(ok, 1500)); continue; } // wallet embarque en cours de creation
    if (!r.ok || !j.access_token) return { error: j?.error ?? "Sign-in failed" };
    const { error } = await createClient().auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
    return error ? { error: error.message } : { wallet: j.wallet as string };
  }
  return { error: "Wallet not ready, try again" };
}

function Inner({ onDone, onFail, onCancel }: Props) {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const started = useRef(false), exchanged = useRef(false);
  const { login } = useLogin({
    onComplete: () => {},
    onError: (e) => { if (!exchanged.current) (String(e).includes("exited") ? onCancel() : onFail(String(e))); },
  });

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    if (!authenticated) login({ loginMethods: ["twitter"] });
  }, [ready, authenticated, login]);

  useEffect(() => {
    if (!ready || !authenticated || exchanged.current) return;
    exchanged.current = true;
    (async () => {
      const token = await getAccessToken();
      if (!token) return onFail("Sign-in failed");
      const r = await openSession(token);
      "wallet" in r ? onDone(r.wallet) : onFail(r.error);
    })();
  }, [ready, authenticated, getAccessToken, onDone, onFail]);
  return null;
}

export default function XLoginFlow(props: Props) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID as string;
  return (
    <PrivyProvider appId={appId} config={{
      loginMethods: ["twitter"],
      appearance: { theme: "dark" },
      embeddedWallets: { ethereum: { createOnLogin: "all-users" }, solana: { createOnLogin: "all-users" } },
    }}>
      <Inner {...props} />
    </PrivyProvider>
  );
}
