/**
 * GET /api/og/profile/[wallet][?wide=1]
 * Carte de partage d'un profil, au même style que la carte de trade : courbe des gains cumulés, marqueurs des paris
 * gagnés (W) et perdus (L), total des gains (prédictions, launchpad, frais de marchés). Données publiques du profil.
 * wide=1 : version 1200×630 pour l'aperçu des liens (X, Telegram, WhatsApp…).
 */
import { limited } from "@/lib/limit";
import { getPublicProfile } from "@/services/profile-service";
import { localImage, money, pnlCardResponse, remoteImage } from "@/lib/og/pnl-card";

const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export async function GET(req: Request, { params }: { params: Promise<{ wallet: string }> }) {
  { const lim = await limited(req, "og-profile", 30); if (lim) return lim; }
  const wallet = decodeURIComponent((await params).wallet);
  const url = new URL(req.url);
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet) && !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return new Response("Invalid wallet", { status: 400 });

  const data = await getPublicProfile(wallet).catch(() => null);
  const e = data?.earnings;
  const predictions = e?.won_usd ?? 0, launchpad = e?.launchpad_usd ?? 0, fees = e?.market_fees_usd ?? 0;
  const total = predictions + launchpad + fees;
  const series = (data?.pnl_series ?? []).map((p) => ({ t: Date.parse(`${p.date}T12:00:00Z`), v: p.usd })).filter((p) => Number.isFinite(p.t)).sort((a, b) => a.t - b.t);
  if (series.length) series.push({ t: Date.now(), v: total });
  const marks = (data?.activity ?? [])
    .filter((a) => a.status === "won" || a.status === "lost")
    .map((a) => ({ t: Date.parse(a.created_at), side: a.status === "won" ? "buy" as const : "sell" as const, label: a.status === "won" ? "W" : "L" }))
    .filter((m) => Number.isFinite(m.t))
    .sort((a, b) => a.t - b.t);

  const isArc = /^0x/.test(wallet);
  const [avatar, chainLogo] = await Promise.all([remoteImage(data?.wallet?.avatar_src ?? null, url.origin), localImage(`chains/${isArc ? "arc" : "solana"}.png`)]);
  const details = [
    { label: "Predictions", value: money(predictions), n: predictions },
    { label: "Launchpad", value: money(launchpad), n: launchpad },
    { label: "Market fees", value: money(fees), n: fees },
  ].filter((d) => d.n > 0).map(({ label, value }) => ({ label, value }));
  const wins = data?.stats.win_count ?? 0, rounds = data?.stats.total_rounds ?? 0;

  return pnlCardResponse({
    name: data?.wallet?.display_name || short(wallet),
    avatar,
    badge: data?.stats.rank ? `Rank #${data.stats.rank}` : rounds ? `${wins}/${rounds} wins` : "Trader",
    dateMs: Date.now(),
    chainLogos: [chainLogo],
    series,
    marks,
    box: { title: "Total gains", amount: total, pct: null, details },
  }, { wide: url.searchParams.get("wide") === "1", cache: "public, max-age=300, s-maxage=300" });
}
