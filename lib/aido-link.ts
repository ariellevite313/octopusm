/** Lien entre un compte Aido (wallet Arc) et un compte OM : message signé par le wallet Aido, envoyé depuis la session OM. */
export const AIDO_URL = "https://aidocircle.com";
const MAX_AGE_MS = 10 * 60_000;

export function aidoLinkMessage(omWallet: string, aidoAddress: string, issuedAt: string): string {
  return `Link my Aido account to OMdotfun\nOM: ${omWallet}\nAido: ${aidoAddress.toLowerCase()}\nIssued: ${issuedAt}`;
}

/** Relit le message : il doit nommer ce compte OM et ce wallet Aido, et dater de moins de 10 minutes. */
export function parseAidoMessage(msg: string, omWallet: string, now = Date.now()): { aido: string } | { error: string } {
  const m = msg.match(/^Link my Aido account to OMdotfun\nOM: (\S+)\nAido: (0x[0-9a-f]{40})\nIssued: (\S+)$/);
  if (!m) return { error: "Invalid message" };
  const sameOm = /^0x/i.test(omWallet) ? m[1].toLowerCase() === omWallet.toLowerCase() : m[1] === omWallet;
  if (!sameOm) return { error: "This message is for another OM account" };
  const t = Date.parse(m[3]);
  if (!Number.isFinite(t) || t > now + 60_000 || now - t > MAX_AGE_MS) return { error: "The signature expired, sign again" };
  return { aido: m[2] };
}
