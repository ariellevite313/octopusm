/** Règles de la candidature au hackathon : validation des champs et vérification du site. */
import { lookup } from "node:dns/promises";
import net from "node:net";

export const CATEGORIES = ["ai_agents", "defi", "gaming", "payments", "social", "other"] as const;
export type Category = (typeof CATEGORIES)[number];
import { MAX_TEAM } from "./config";
export { MAX_TEAM };

export type ApplicationInput = {
  name?: unknown; description?: unknown; siteUrl?: unknown; githubUrl?: unknown;
  xHandle?: unknown; videoUrl?: unknown; category?: unknown; teamWallets?: unknown; discoverUrl?: unknown;
};
export type ValidApplication = {
  name: string; description: string; siteUrl: string; githubUrl: string | null;
  xHandle: string; videoUrl: string | null; category: Category; teamWallets: string[]; discoverUrl: string | null;
};

const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDR = /^0x[0-9a-fA-F]{40}$/;
export const isWalletAddress = (s: string) => SOL_ADDR.test(s) || EVM_ADDR.test(s);

import { cleanHttpsUrl } from "@/lib/https-url";
export { cleanHttpsUrl };

export function validateApplication(input: ApplicationInput, applicant: string): { ok: true; value: ValidApplication } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > 60) return { ok: false, error: "Project name must be 2 to 60 characters" };
  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length < 10 || description.length > 600) return { ok: false, error: "Description must be 10 to 600 characters" };
  const siteUrl = cleanHttpsUrl(input.siteUrl);
  if (!siteUrl) return { ok: false, error: "A valid https website is required" };
  let githubUrl: string | null = null;
  if (input.githubUrl != null && input.githubUrl !== "") {
    githubUrl = cleanHttpsUrl(input.githubUrl);
    if (!githubUrl) return { ok: false, error: "Invalid GitHub link" };
  }
  let videoUrl: string | null = null;
  if (input.videoUrl != null && input.videoUrl !== "") {
    videoUrl = cleanHttpsUrl(input.videoUrl);
    if (!videoUrl) return { ok: false, error: "Invalid video link" };
  }
  // Lien optionnel vers la fiche Discover du projet (omdot.fun/discover/…)
  let discoverUrl: string | null = null;
  if (input.discoverUrl != null && input.discoverUrl !== "") {
    discoverUrl = cleanHttpsUrl(input.discoverUrl);
    let okPath = false;
    try { okPath = !!discoverUrl && /^\/discover\/[0-9a-f-]{36}\/?$/i.test(new URL(discoverUrl).pathname); } catch { okPath = false; }
    if (!okPath) return { ok: false, error: "Invalid Discover link" };
  }
  const xRaw = typeof input.xHandle === "string" ? input.xHandle.trim().replace(/^@/, "").replace(/^https:\/\/(x|twitter)\.com\//i, "") : "";
  if (!/^[A-Za-z0-9_]{1,15}$/.test(xRaw)) return { ok: false, error: "A valid X profile is required" };
  if (typeof input.category !== "string" || !(CATEGORIES as readonly string[]).includes(input.category)) return { ok: false, error: "Invalid category" };

  const rawTeam = Array.isArray(input.teamWallets) ? input.teamWallets : [];
  const team: string[] = [];
  const seen = new Set<string>();
  for (const w of [applicant, ...rawTeam]) {
    if (typeof w !== "string" || !isWalletAddress(w)) return { ok: false, error: "Invalid team wallet" };
    const key = EVM_ADDR.test(w) ? w.toLowerCase() : w;
    if (!seen.has(key)) { seen.add(key); team.push(key); }
  }
  if (team.length > MAX_TEAM) return { ok: false, error: `A team has ${MAX_TEAM} members at most` };

  return { ok: true, value: { name, description, siteUrl, githubUrl, xHandle: xRaw, videoUrl, category: input.category as Category, teamWallets: team, discoverUrl } };
}

/** Adresse interne ou privée : jamais jointe par le serveur (protection contre le SSRF). */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80") || l.startsWith("::ffff:");
  }
  return true;
}

/**
 * Le site existe-t-il ? Refuse les adresses internes et les noms qui n'existent pas (DNS).
 * Un site lent, protégé contre les robots ou en erreur serveur existe quand même : seuls un 404/410 et les vraies erreurs serveur sont refusés.
 */
export async function siteIsReachable(url: string): Promise<boolean> {
  let u: URL;
  try {
    u = new URL(url);
    if (u.protocol !== "https:" || net.isIP(u.hostname) || u.hostname === "localhost") return false;
    const addrs = await lookup(u.hostname, { all: true });
    if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) return false;
  } catch { return false; }
  try {
    const res = await fetch(u, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0 (compatible; OMdotfun-hackathon-check)" } });
    return res.status < 500 ? ![404, 410].includes(res.status) : res.status === 503;
  } catch { return true; } // le nom existe, la réponse est lente ou bloquée : on ne refuse pas
}
