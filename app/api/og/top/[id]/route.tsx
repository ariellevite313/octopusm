/** GET /api/og/top/[id][?wide=1][&theme=dark|light|blue|green|purple|orange] : image d'un classement « Top 10 » publié (chiffres figés au moment de la création). */
import { createAdminClient } from "@/lib/supabase/server";
import { limited } from "@/lib/limit";
import { isTheme, topCardResponse } from "@/lib/og/top-card";
import { isSource, TOP_KINDS, TOP_PERIODS, type TopKind, type TopPeriod, type TopRow } from "@/lib/top-lists";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  { const lim = await limited(req, "og-top", 60); if (lim) return lim; }
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (createAdminClient() as any).from("top_lists").select("source, kind, period, rows, created_at").eq("id", id).maybeSingle();
  if (!data || !isSource(data.source) || !TOP_KINDS.includes(data.kind) || !TOP_PERIODS.includes(data.period)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const theme = url.searchParams.get("theme");
  return topCardResponse({ theme: isTheme(theme) ? theme : "dark", source: data.source, kind: data.kind as TopKind, period: data.period as TopPeriod, rows: data.rows as TopRow[], at: Date.parse(data.created_at), origin: url.origin, wide: url.searchParams.get("wide") === "1" });
}
