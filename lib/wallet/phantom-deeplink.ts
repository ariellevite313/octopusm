/**
 * Connexion Phantom / Solflare depuis un navigateur mobile classique (Chrome, Safari…),
 * sans ouvrir le site dans le navigateur de Phantom : protocole de liens profonds
 * (connect puis signMessage, chiffrés NaCl), retour via /phantom-callback.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";

export type DeeplinkWallet = "phantom" | "solflare";
const BASE: Record<DeeplinkWallet, string> = { phantom: "https://phantom.app/ul/v1", solflare: "https://solflare.com/ul/v1" };
const KEY = "omdot_phantom_dl";

type Stored = {
  sk: string;            // clé secrète dApp (bs58)
  ref?: string;          // code de parrainage
  wallet?: DeeplinkWallet;
  phantomPk?: string;    // clé publique de chiffrement de Phantom (bs58)
  session?: string;
  address?: string;
  nonce?: string;        // nonce de connexion
  message?: string;      // message signé (base64)
  returnTo?: string;     // page à rouvrir après une reconnexion de session
  pending?: PendingSend; // transaction envoyée au wallet, en attente de retour
};

/** Ce qu'il faut refaire au retour du wallet : page de retour + enregistrements serveur de la transaction. */
export type PendingSend = {
  returnTo: string;
  records?: { url: string; sigField: string; body: Record<string, unknown> }[];
};

/** Un chemin du site uniquement (jamais une adresse externe). */
export function safeReturn(p: string | undefined | null): string {
  return typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && !p.includes("\\") ? p : "/";
}

export function isMobileBrowser(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
/** Phantom et Solflare savent signer par liens profonds depuis un navigateur mobile sans wallet injecté. */
export function canDeeplink(type: string): type is DeeplinkWallet {
  return (type === "phantom" || type === "solflare") && isMobileBrowser();
}

function load(): Stored | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; }
}
function save(s: Stored) { localStorage.setItem(KEY, JSON.stringify(s)); }
export function clearPhantomDeeplink() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/** Fin de connexion : on garde la session du wallet (pour signer plus tard), on retire le reste. */
export function finishDeeplinkLogin(): void {
  const s = load();
  if (!s?.phantomPk || !s.session || !s.address) { clearPhantomDeeplink(); return; }
  save({ sk: s.sk, wallet: s.wallet, phantomPk: s.phantomPk, session: s.session, address: s.address });
}

/** Le wallet a-t-il déjà une session de signature pour cette adresse dans ce navigateur ? */
export function hasSendSession(wallet: DeeplinkWallet, address: string): boolean {
  const s = load();
  return !!(s?.sk && s.phantomPk && s.session && s.address === address && (s.wallet ?? "phantom") === wallet);
}

/** Page à rouvrir après le retour du wallet (sans toucher à la session). */
export function peekReturnTo(): string { return safeReturn(load()?.returnTo ?? load()?.pending?.returnTo); }

/** Reconnexion légère (sans message à signer) pour obtenir une session de signature, puis retour sur la même page. */
export function startDeeplinkSession(wallet: DeeplinkWallet, returnTo: string): void {
  const kp = nacl.box.keyPair();
  save({ sk: bs58.encode(kp.secretKey), wallet, returnTo: safeReturn(returnTo) });
  const origin = window.location.origin;
  const q = new URLSearchParams({
    app_url: origin,
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    redirect_link: `${origin}/phantom-callback?step=session`,
    cluster: "mainnet-beta",
  });
  window.location.href = `${BASE[wallet]}/connect?${q.toString()}`;
}

/** Retour de la reconnexion légère : on garde la session et on renvoie l'adresse du wallet. */
export function handleSessionResponse(params: URLSearchParams): { address: string; wallet: DeeplinkWallet; returnTo: string } {
  const s = load();
  const phantomPk = params.get("phantom_encryption_public_key") ?? params.get("solflare_encryption_public_key");
  const data = params.get("data");
  const n = params.get("nonce");
  if (!s || !phantomPk || !data || !n) throw new Error("Invalid wallet response.");
  const { public_key, session } = decrypt<{ public_key: string; session: string }>(shared(s, phantomPk), data, n);
  save({ ...s, phantomPk, session, address: public_key });
  return { address: public_key, wallet: s.wallet ?? "phantom", returnTo: safeReturn(s.returnTo) };
}

/** Envoie la transaction au wallet pour signature et envoi (chiffré), retour sur /phantom-callback?step=send. */
export function startDeeplinkSend(wallet: DeeplinkWallet, txBytes: Uint8Array, pending: PendingSend): void {
  const s = load();
  if (!s?.phantomPk || !s.session) throw new Error("Wallet session missing.");
  save({ ...s, pending: { ...pending, returnTo: safeReturn(pending.returnTo) } });
  const nonce = nacl.randomBytes(24);
  const payload = nacl.box(
    new TextEncoder().encode(JSON.stringify({ session: s.session, transaction: bs58.encode(txBytes) })),
    nonce, bs58.decode(s.phantomPk), bs58.decode(s.sk),
  );
  const kp = nacl.box.keyPair.fromSecretKey(bs58.decode(s.sk));
  const q = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    nonce: bs58.encode(nonce),
    redirect_link: `${window.location.origin}/phantom-callback?step=send`,
    payload: bs58.encode(payload),
  });
  window.location.href = `${BASE[wallet]}/signAndSendTransaction?${q.toString()}`;
}

/** Retour de signAndSendTransaction : signature de la transaction et ce qu'il reste à enregistrer. */
export function handleSendResponse(params: URLSearchParams): { signature: string; pending: PendingSend } {
  const s = load();
  const data = params.get("data");
  const n = params.get("nonce");
  if (!s?.phantomPk || !s.pending || !data || !n) throw new Error("Invalid wallet response.");
  const { signature } = decrypt<{ signature: string }>(shared(s, s.phantomPk), data, n);
  const pending = s.pending;
  const { pending: _drop, ...rest } = s; void _drop;
  save(rest);
  return { signature, pending };
}

/** Transaction annulée ou refusée : on oublie l'envoi en attente et on renvoie la page de retour. */
export function dropPending(): string {
  const s = load();
  const back = safeReturn(s?.pending?.returnTo ?? s?.returnTo);
  if (s) { const { pending: _p, returnTo: _r, ...rest } = s; void _p; void _r; save(rest); }
  return back;
}

export function startDeeplinkConnect(wallet: DeeplinkWallet, refCode?: string): void {
  const kp = nacl.box.keyPair();
  save({ sk: bs58.encode(kp.secretKey), ref: refCode, wallet });
  const origin = window.location.origin;
  const q = new URLSearchParams({
    app_url: origin,
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    redirect_link: `${origin}/phantom-callback?step=connect`,
    cluster: "mainnet-beta",
  });
  window.location.href = `${BASE[wallet]}/connect?${q.toString()}`;
}

function shared(s: Stored, phantomPk: string): Uint8Array {
  return nacl.box.before(bs58.decode(phantomPk), bs58.decode(s.sk));
}

function decrypt<T>(secret: Uint8Array, data: string, nonce: string): T {
  const plain = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), secret);
  if (!plain) throw new Error("Unable to decrypt the wallet response.");
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

/** Étape 1 : réponse de connect → on demande la signature du message de connexion. */
export function handleConnectResponse(params: URLSearchParams, buildMessage: (address: string, nonce: string) => Uint8Array, nonce: string): void {
  const s = load();
  const phantomPk = params.get("phantom_encryption_public_key") ?? params.get("solflare_encryption_public_key");
  const data = params.get("data");
  const n = params.get("nonce");
  if (!s || !phantomPk || !data || !n) throw new Error("Invalid wallet response.");
  const secret = shared(s, phantomPk);
  const { public_key, session } = decrypt<{ public_key: string; session: string }>(secret, data, n);
  const message = buildMessage(public_key, nonce);

  const encNonce = nacl.randomBytes(24);
  const payload = nacl.box(
    new TextEncoder().encode(JSON.stringify({ session, message: bs58.encode(message), display: "utf8" })),
    encNonce, bs58.decode(phantomPk), bs58.decode(s.sk),
  );
  save({ ...s, phantomPk, session, address: public_key, nonce, message: btoa(String.fromCharCode(...Array.from(message))) });

  const kp = nacl.box.keyPair.fromSecretKey(bs58.decode(s.sk));
  const q = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    nonce: bs58.encode(encNonce),
    redirect_link: `${window.location.origin}/phantom-callback?step=sign`,
    payload: bs58.encode(payload),
  });
  window.location.href = `${BASE[s.wallet ?? "phantom"]}/signMessage?${q.toString()}`;
}

/** Étape 2 : réponse de signMessage → données pour l'Edge Function wallet-auth. */
export function handleSignResponse(params: URLSearchParams): { wallet: DeeplinkWallet; address: string; signature: Uint8Array; nonce: string; messageB64: string; ref?: string } {
  const s = load();
  const data = params.get("data");
  const n = params.get("nonce");
  if (!s?.phantomPk || !s.address || !s.nonce || !s.message || !data || !n) throw new Error("Invalid wallet response.");
  const { signature } = decrypt<{ signature: string }>(shared(s, s.phantomPk), data, n);
  return { wallet: s.wallet ?? "phantom", address: s.address, signature: bs58.decode(signature), nonce: s.nonce, messageB64: s.message, ref: s.ref };
}
