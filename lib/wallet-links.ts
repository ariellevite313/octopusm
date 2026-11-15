/**
 * Wallets liés entre les holders d'un token : un holder a financé l'autre, ou plusieurs holders ont été financés
 * par le même wallet. Un financeur commun à beaucoup de holders est probablement une plateforme d'échange : ignoré.
 */
export type Funding = { owner: string; funder: string | null };
export type WalletLink = { a: string; b: string; why: "funded" | "same_funder"; via?: string };

export const MAX_SHARED = 6;

export function linksFrom(list: Funding[]): WalletLink[] {
  const holders = new Set(list.map((f) => f.owner));
  const out: WalletLink[] = [];
  const seen = new Set<string>();
  const add = (l: WalletLink) => { const k = [l.a, l.b].sort().join(":"); if (l.a !== l.b && !seen.has(k)) { seen.add(k); out.push(l); } };
  // Financement direct entre deux holders
  for (const f of list) if (f.funder && holders.has(f.funder)) add({ a: f.funder, b: f.owner, why: "funded" });
  // Même financeur (hors holders), relié en étoile au premier de la liste
  const by = new Map<string, string[]>();
  for (const f of list) if (f.funder && !holders.has(f.funder)) by.set(f.funder, [...(by.get(f.funder) ?? []), f.owner]);
  for (const [funder, owners] of by) {
    if (owners.length < 2 || owners.length > MAX_SHARED) continue;
    for (const o of owners.slice(1)) add({ a: owners[0], b: o, why: "same_funder", via: funder });
  }
  return out;
}
