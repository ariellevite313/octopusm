/**
 * Connexion Phantom depuis un navigateur mobile classique (Chrome, Safari…),
 * sans ouvrir le site dans le navigateur de Phantom : protocole de liens profonds
 * (connect puis signMessage, chiffrés NaCl), retour via /phantom-callback.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";

const KEY = "omdot_phantom_dl";

type Stored = {
  sk: string;            // clé secrète dApp (bs58)
  ref?: string;          // code de parrainage
  phantomPk?: string;    // clé publique de chiffrement de Phantom (bs58)
  session?: string;
  address?: string;
  nonce?: string;        // nonce de connexion
  message?: string;      // message signé (base64)
};

function load(): Stored | null {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "null"); } catch { return null; }
}
function save(s: Stored) { localStorage.setItem(KEY, JSON.stringify(s)); }
export function clearPhantomDeeplink() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

export function startPhantomConnect(refCode?: string): void {
  const kp = nacl.box.keyPair();
  save({ sk: bs58.encode(kp.secretKey), ref: refCode });
  const origin = window.location.origin;
  const q = new URLSearchParams({
    app_url: origin,
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    redirect_link: `${origin}/phantom-callback?step=connect`,
    cluster: "mainnet-beta",
  });
  window.location.href = `https://phantom.app/ul/v1/connect?${q.toString()}`;
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
  const phantomPk = params.get("phantom_encryption_public_key");
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
  window.location.href = `https://phantom.app/ul/v1/signMessage?${q.toString()}`;
}

/** Étape 2 : réponse de signMessage → données pour l'Edge Function wallet-auth. */
export function handleSignResponse(params: URLSearchParams): { address: string; signature: Uint8Array; nonce: string; messageB64: string; ref?: string } {
  const s = load();
  const data = params.get("data");
  const n = params.get("nonce");
  if (!s?.phantomPk || !s.address || !s.nonce || !s.message || !data || !n) throw new Error("Invalid wallet response.");
  const { signature } = decrypt<{ signature: string }>(shared(s, s.phantomPk), data, n);
  return { address: s.address, signature: bs58.decode(signature), nonce: s.nonce, messageB64: s.message, ref: s.ref };
}
