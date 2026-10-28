/**
 * GET /api/cron/hackathon-stats — toutes les 5 minutes pendant le hackathon.
 * Recalcule pour chaque projet : votes, volume net, et (par petits lots) holders, concentration, bundle.
 * Sécurisé par CRON_SECRET (bearer).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { HACKATHON, hackathonPhase } from "@/lib/hackathon/config";
import { RULES, PLATFORM_RATE } from "@/lib/hackathon/rules";
import { loadTrades, summarize } from "@/lib/hackathon/ledger";
import { arcBalances } from "@/lib/holders";
import { cronDenied } from "@/lib/auth/cron";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const HOLDER_BATCH = 12;
const norm = (w: string) => (/^0x[0-9a-fA-F]{40}$/.test(w) ? w.toLowerCase() : w);

export async function GET(req: Request) {
  const denied = cronDenied(req);
  if (denied) return denied;
  if (hackathonPhase() === "soon") return NextResponse.json({ skipped: "not started" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const win = { startMs: Date.parse(HACKATHON.startsAt), endMs: Date.parse(HACKATHON.endsAt) };
  const origin = new URL(req.url).origin;

  // Volume de départ : une seule fois, pour les tokens déjà lancés à l'ouverture
  await db.from("launchpad_tokens").update({ hackathon_baseline_volume: 0 }).is("hackathon_baseline_volume", null).gte("created_at", HACKATHON.startsAt);
  const { data: pre } = await db.from("launchpad_tokens").select("id, volume_total_usd").is("hackathon_baseline_volume", null);
  for (const t of (pre ?? []) as { id: string; volume_total_usd: number | null }[]) {
    await db.from("launchpad_tokens").update({ hackathon_baseline_volume: Number(t.volume_total_usd) || 0 }).eq("id", t.id).is("hackathon_baseline_volume", null);
  }

  const { data: projects } = await db.from("hackathon_projects").select("id, token_id, team_wallets, applicant").eq("status", "approved");
  const list = (projects ?? []) as { id: string; token_id: string; team_wallets: string[]; applicant: string }[];
  if (list.length === 0) return NextResponse.json({ projects: 0 });

  const { data: toks } = await db.from("launchpad_tokens")
    .select("id, chain, mint_address, arc_launch_id, sol_fee_tier, volume_total_usd, volume_24h_usd, hackathon_baseline_volume, creator_wallet")
    .in("id", list.map((p) => p.token_id));
  type Tok = { id: string; chain: string | null; mint_address: string | null; arc_launch_id: string | null; sol_fee_tier: string | null; volume_total_usd: number | null; volume_24h_usd: number | null; hackathon_baseline_volume: number | null; creator_wallet: string | null };
  const tokOf = new Map<string, Tok>(((toks ?? []) as Tok[]).map((t) => [t.id, t]));

  const { data: old } = await db.from("hackathon_stats").select("project_id, holders_updated_at").in("project_id", list.map((p) => p.id));
  const holdersAt = new Map<string, number>(((old ?? []) as { project_id: string; holders_updated_at: string | null }[]).map((r) => [r.project_id, r.holders_updated_at ? Date.parse(r.holders_updated_at) : 0]));
  const refreshHolders = new Set([...list].sort((a, b) => (holdersAt.get(a.id) ?? 0) - (holdersAt.get(b.id) ?? 0)).slice(0, HOLDER_BATCH).map((p) => p.id));

  let done = 0;
  for (const p of list) {
    const t = tokOf.get(p.token_id);
    if (!t) continue;
    try {
      const team = new Set([...(p.team_wallets ?? []), p.applicant, t.creator_wallet ?? ""].filter(Boolean).map(norm));
      const trades = await loadTrades(db, t);
      const s = summarize(trades, team, win);

      const isArc = t.chain === "arc";
      // Solana : volume total du token depuis l'ouverture, moins les trades de l'équipe vus par OM
      let volume = s.volumeUsd;
      if (!isArc) {
        const since = Math.max(0, (Number(t.volume_total_usd) || 0) - (Number(t.hackathon_baseline_volume) || 0));
        const teamVol = trades.filter((x) => team.has(x.wallet) && x.tsMs >= win.startMs && x.tsMs <= win.endMs).reduce((n, x) => n + x.usd, 0);
        volume = Math.max(0, since - teamVol);
      }
      const rate = isArc ? PLATFORM_RATE.arc : t.sol_fee_tier === "low" ? PLATFORM_RATE.solanaLow : PLATFORM_RATE.solanaStandard;

      const row: Record<string, unknown> = {
        project_id: p.id, votes: s.votes, volume_usd: volume, platform_rate: rate,
        had_volume_7d: s.recent7d || (Number(t.volume_24h_usd) || 0) > 0, updated_at: new Date().toISOString(),
      };

      if (refreshHolders.has(p.id) && t.mint_address) {
        if (isArc) {
          const bal = await arcBalances(db, t.mint_address);
          if (bal) {
            const total = bal.reduce((n, b) => n + b.raw, 0n);
            const real = bal.filter((b) => !team.has(b.owner)).map((b) => ({ ...b, pct: total > 0n ? Number((b.raw * 10_000_000n) / total) / 100_000 : 0 }))
              .filter((b) => b.pct >= RULES.minHolderPct).sort((a, b) => b.pct - a.pct);
            row.holders = real.length;
            row.top10_pct = real.slice(0, 10).reduce((n, b) => n + b.pct, 0);
            row.biggest_pct = real[0]?.pct ?? 0;
            row.bundle_pct = 0;
            row.holders_updated_at = new Date().toISOString();
          }
        } else {
          const hj = await fetch(`${origin}/api/launchpad/holders/${t.mint_address}`, { signal: AbortSignal.timeout(25000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          if (hj?.holders) {
            const real = (hj.holders as { owner: string; pct: number; isProgram: boolean }[]).filter((h) => !h.isProgram && !team.has(h.owner) && h.pct >= RULES.minHolderPct);
            const programs = (hj.holders as { isProgram: boolean }[]).filter((h) => h.isProgram).length;
            const teamInTop = (hj.holders as { owner: string }[]).filter((h) => team.has(h.owner)).length;
            row.holders = Math.max(0, Number(hj.total ?? real.length) - programs - teamInTop);
            row.top10_pct = real.slice(0, 10).reduce((n, h) => n + h.pct, 0);
            row.biggest_pct = real[0]?.pct ?? 0;
            const bj = await fetch(`${origin}/api/launchpad/bundle/${t.mint_address}`, { signal: AbortSignal.timeout(30000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
            row.bundle_pct = Number(bj?.pct ?? 0);
            row.holders_updated_at = new Date().toISOString();
          }
        }
      }
      const { error } = await db.from("hackathon_stats").upsert(row, { onConflict: "project_id" });
      if (error) console.error("[hackathon-stats] upsert:", error.message); else done++;
    } catch (e) {
      console.error("[hackathon-stats] project", p.id, e);
    }
  }
  return NextResponse.json({ projects: list.length, updated: done });
}
