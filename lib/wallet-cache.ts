"use client";

/**
 * Cache du wallet : les dernières valeurs connues (solde, actifs, résumé Omero) sont gardées sur l'appareil
 * et affichées tout de suite, puis remplacées par les nouvelles. Une même adresse demandée au même moment
 * n'est appelée qu'une fois. Un échec garde les anciennes valeurs et réessaie une fois.
 */
const inflight = new Map<string, Promise<unknown>>();
const k = (wallet: string, url: string) => `om-wc:${wallet}:${url.split("?")[0]}`;

export function readCached<T>(wallet: string, url: string): T | null {
  try {
    const raw = localStorage.getItem(k(wallet, url));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}

async function once<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}

/** Récupère `url`, garde le résultat pour `wallet`. Renvoie null seulement si les deux essais échouent. */
export function fetchCached<T>(wallet: string, url: string): Promise<T | null> {
  const id = `${wallet}|${url}`;
  const running = inflight.get(id) as Promise<T | null> | undefined;
  if (running) return running;
  const p = (async () => {
    let v = await once<T>(url);
    if (v == null) { await new Promise((r) => setTimeout(r, 2500)); v = await once<T>(url); }
    if (v != null) { try { localStorage.setItem(k(wallet, url), JSON.stringify(v)); } catch { /* plein ou bloqué */ } }
    return v;
  })().finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
