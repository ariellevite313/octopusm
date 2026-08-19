/**
 * GET /api/cron/activate-scheduled-tokens
 *
 * Activates scheduled launchpad tokens whose `scheduled_at` has passed.
 * Call this route every 5 minutes from your cron provider (Vercel Cron,
 * GitHub Actions, Railway, etc.).
 *
 * Vercel cron.json example:
 *   { "path": "/api/cron/activate-scheduled-tokens", "schedule": "* /5 * * * *" }
 *
 * Secured by CRON_SECRET env var — pass it as the Authorization header:
 *   Authorization: Bearer <CRON_SECRET>
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  // Simple bearer-token auth to prevent public triggering
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;

    // Find all scheduled tokens whose launch time has arrived but are still non-tradeable
    const now = new Date().toISOString();
    const { data: tokensToActivate, error: fetchError } = await admin
      .from("launchpad_tokens")
      .select("id, name, ticker, scheduled_at")
      .eq("status", "active")
      .eq("is_scheduled", true)
      .eq("is_tradeable", false)
      .lte("scheduled_at", now)
      .limit(50);

    if (fetchError) {
      console.error("[cron] activate-scheduled-tokens fetch error:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    const tokens = (tokensToActivate ?? []) as Array<{ id: string; name: string; ticker: string; scheduled_at: string }>;

    if (tokens.length === 0) {
      return NextResponse.json({ activated: 0, message: "No tokens to activate" });
    }

    const ids = tokens.map(t => t.id);

    // Flip is_tradeable = true for all due tokens in a single update
    const { error: updateError } = await admin
      .from("launchpad_tokens")
      .update({ is_tradeable: true })
      .in("id", ids);

    if (updateError) {
      console.error("[cron] activate-scheduled-tokens update error:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    console.log(
      `[cron] Activated ${tokens.length} scheduled token(s):`,
      tokens.map(t => `${t.ticker} (${t.id})`).join(", "),
    );

    return NextResponse.json({
      activated: tokens.length,
      tokens: tokens.map(t => ({ id: t.id, ticker: t.ticker, scheduledAt: t.scheduled_at })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[cron] activate-scheduled-tokens unexpected error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
