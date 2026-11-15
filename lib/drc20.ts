/** DRC-20 (Dogecoin) côté OM : lecture des tables remplies par drc20-indexer, et mise en forme des montants. */
export type Drc20Token = { tick: string; max: string; lim: string; dec: number; minted: string; holders: number; deployer: string; inscription: string; height: number; progress: number };
export type Drc20Holder = { address: string; amount: string; pct: number };
export type Drc20Event = { height: number; txid: string; kind: string; from: string | null; to: string | null; amt: string };

/** Montant brut (entier à l'échelle 10^dec) → nombre lisible, sans perdre de précision. */
export function drcAmount(raw: string | number | null | undefined, dec: number): string {
  const v = BigInt(String(raw ?? "0").split(".")[0] || "0");
  const s = v.toString().padStart(dec + 1, "0");
  const i = s.slice(0, s.length - dec), f = s.slice(s.length - dec).replace(/0+$/, "").slice(0, 4);
  return `${BigInt(i).toLocaleString("en-US")}${f ? `.${f}` : ""}`;
}

/** Part en % (2 décimales) de a sur b, en entiers. */
export function drcPct(a: string | number, b: string | number): number {
  const x = BigInt(String(a).split(".")[0] || "0"), y = BigInt(String(b).split(".")[0] || "0");
  return y > 0n ? Number((x * 10000n) / y) / 100 : 0;
}

export const DOGE_EXPLORER = "https://blockchair.com/dogecoin";
