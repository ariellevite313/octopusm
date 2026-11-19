/**
 * Serveur : fiche sécurité d'un token pour le Terminal.
 * Solana : rapport RugCheck (gratuit). EVM : GoPlus (gratuit). Arc et autres : non disponible.
 * Chaque ligne : ok = true (rassurant), false (risque), null (inconnu).
 */
export type SecCheck = { key: string; label: string; ok: boolean | null; value: string };
export type SecRisk = { name: string; level: "danger" | "warn" | "info"; description: string };
export type Security = { source: "rugcheck" | "goplus"; checks: SecCheck[]; risks: SecRisk[]; holders: number | null; rugged: boolean };

const pct = (n: number) => `${n >= 10 ? n.toFixed(1) : n.toFixed(2)}%`;
const GOPLUS_CHAIN: Record<string, string> = { ethereum: "1", base: "8453", bnb: "56", arbitrum: "42161", polygon: "137", avalanche: "43114" };

async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000), next: { revalidate: 120 } });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

type RcHolder = { owner: string; pct: number; insider?: boolean };
type RcReport = {
  token?: { mintAuthority: string | null; freezeAuthority: string | null; supply: number; decimals: number };
  topHolders?: RcHolder[]; knownAccounts?: Record<string, { type?: string }>;
  creator?: string; creatorBalance?: number; transferFee?: { pct?: number };
  graphInsidersDetected?: number; insiderNetworks?: { currentHolding?: number }[];
  risks?: { name: string; level: string; description: string }[]; totalHolders?: number; rugged?: boolean;
};

async function solana(mint: string): Promise<Security | null> {
  const [rep, sum] = await Promise.all([
    json<RcReport>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`),
    json<{ lpLockedPct?: number }>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report/summary`),
  ]);
  if (!rep?.token) return null;
  const t = rep.token;
  const supply = Number(t.supply) || 0;
  // Top 10 sans les pools (AMM) ni les comptes connus de plateformes
  const known = rep.knownAccounts ?? {};
  const top = (rep.topHolders ?? []).filter((h) => !known[h.owner]).slice(0, 10);
  const top10 = top.reduce((s, h) => s + (h.pct || 0), 0);
  const dev = supply > 0 && rep.creatorBalance != null ? (Number(rep.creatorBalance) / supply) * 100 : null;
  const insiderHold = supply > 0 ? ((rep.insiderNetworks ?? []).reduce((s, n) => s + Number(n.currentHolding ?? 0), 0) / supply) * 100 : null;
  const fee = rep.transferFee?.pct ?? 0;
  const lp = sum?.lpLockedPct;
  const checks: SecCheck[] = [
    { key: "mint", label: "Mint authority", ok: !t.mintAuthority, value: t.mintAuthority ? "Enabled" : "Disabled" },
    { key: "freeze", label: "Freeze authority", ok: !t.freezeAuthority, value: t.freezeAuthority ? "Enabled" : "Disabled" },
    { key: "lp", label: "LP locked or burned", ok: lp == null ? null : lp >= 90, value: lp == null ? "-" : pct(lp) },
    { key: "top10", label: "Top 10 holders", ok: top.length ? top10 < 30 : null, value: top.length ? pct(top10) : "-" },
    { key: "dev", label: "Dev holds", ok: dev == null ? null : dev < 5, value: dev == null ? "-" : pct(dev) },
    { key: "insiders", label: "Insiders", ok: rep.graphInsidersDetected == null ? null : (insiderHold ?? 0) < 10, value: rep.graphInsidersDetected ? `${rep.graphInsidersDetected} · ${pct(insiderHold ?? 0)}` : "0" },
    { key: "fee", label: "Transfer tax", ok: fee === 0, value: pct(fee) },
  ];
  const risks: SecRisk[] = (rep.risks ?? []).map((r) => ({ name: r.name, level: r.level === "danger" ? "danger" : r.level === "warn" ? "warn" : "info", description: r.description }));
  return { source: "rugcheck", checks, risks, holders: rep.totalHolders ?? null, rugged: !!rep.rugged };
}

type GpToken = Record<string, unknown> & { holders?: { percent: string; is_locked?: number; is_contract?: number }[]; lp_holders?: { percent: string; is_locked?: number }[] };

async function evm(chain: string, token: string): Promise<Security | null> {
  const id = GOPLUS_CHAIN[chain];
  if (!id) return null;
  const j = await json<{ result?: Record<string, GpToken> }>(`https://api.gopluslabs.io/api/v1/token_security/${id}?contract_addresses=${token}`);
  const g = j?.result?.[token.toLowerCase()];
  if (!g) return null;
  const yes = (k: string) => g[k] === "1";
  const num = (k: string) => (g[k] === undefined || g[k] === "" ? null : Number(g[k]) * 100);
  const buyTax = num("buy_tax"), sellTax = num("sell_tax");
  const owner = String(g.owner_address ?? "");
  const renounced = !owner || /^0x0{40}$/i.test(owner) || owner.toLowerCase() === "0x000000000000000000000000000000000000dead";
  const top10 = (g.holders ?? []).filter((h) => !h.is_locked && !h.is_contract).slice(0, 10).reduce((s, h) => s + Number(h.percent) * 100, 0);
  const lpLocked = (g.lp_holders ?? []).filter((h) => h.is_locked === 1).reduce((s, h) => s + Number(h.percent) * 100, 0);
  const creator = num("creator_percent");
  const v2 = ((g.dex as { liquidity_type?: string }[] | undefined) ?? []).some((d) => /v2/i.test(d.liquidity_type ?? ""));
  const checks: SecCheck[] = [
    { key: "honeypot", label: "Can sell", ok: !(yes("is_honeypot") || yes("cannot_sell_all")), value: yes("is_honeypot") ? "Honeypot" : yes("cannot_sell_all") ? "Limited" : "Yes" },
    { key: "tax", label: "Buy / sell tax", ok: buyTax == null || sellTax == null ? null : buyTax <= 5 && sellTax <= 5, value: `${buyTax == null ? "-" : pct(buyTax)} / ${sellTax == null ? "-" : pct(sellTax)}` },
    { key: "mint", label: "Mintable", ok: !yes("is_mintable"), value: yes("is_mintable") ? "Yes" : "No" },
    { key: "owner", label: "Ownership renounced", ok: renounced && !yes("hidden_owner") && !yes("can_take_back_ownership"), value: renounced ? "Yes" : "No" },
    { key: "verified", label: "Open source", ok: yes("is_open_source"), value: yes("is_open_source") ? "Yes" : "No" },
    // Pools V3/V4 : la liquidité est en positions NFT, GoPlus ne sait pas si elle est verrouillée
    { key: "lp", label: "LP locked or burned", ok: v2 && g.lp_holders ? lpLocked >= 90 : null, value: v2 && g.lp_holders ? pct(lpLocked) : "-" },
    { key: "top10", label: "Top 10 holders", ok: g.holders ? top10 < 30 : null, value: g.holders ? pct(top10) : "-" },
    { key: "dev", label: "Dev holds", ok: creator == null ? null : creator < 5, value: creator == null ? "-" : pct(creator) },
  ];
  const risks: SecRisk[] = [];
  if (yes("is_proxy")) risks.push({ name: "Proxy contract", level: "warn", description: "The contract can be upgraded by its owner" });
  if (yes("transfer_pausable")) risks.push({ name: "Transfers can be paused", level: "danger", description: "The owner can stop all transfers" });
  if (yes("is_blacklisted")) risks.push({ name: "Blacklist", level: "warn", description: "The owner can block some wallets" });
  if (yes("slippage_modifiable")) risks.push({ name: "Tax can change", level: "danger", description: "The owner can raise the buy or sell tax" });
  if (yes("selfdestruct")) risks.push({ name: "Self-destruct", level: "danger", description: "The contract can destroy itself" });
  return { source: "goplus", checks, risks, holders: g.holder_count ? Number(g.holder_count) : null, rugged: false };
}

export async function tokenSecurity(chain: string, mint: string): Promise<Security | null> {
  if (chain === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) ? solana(mint) : null;
  return /^0x[0-9a-fA-F]{40}$/.test(mint) ? evm(chain, mint) : null;
}
