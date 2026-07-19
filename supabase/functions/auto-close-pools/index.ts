import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Edge Function: auto-close-pools
 * Passes all mutuel_markets from "active" -> "closed" when betting_closes_at has passed.
 * Called every 5 minutes via pg_cron or Supabase scheduler.
 *
 * Secured by SUPABASE_SERVICE_ROLE_KEY — never call this from the client.
 */
serve(async (req: Request) => {
  // BUG-26 fix: CRON_SECRET is now required — if not set, the function is disabled for safety.
  // Without this, anyone could POST to the function URL and force-close all active pools.
  const authHeader = req.headers.get("Authorization");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase     = createClient(supabaseUrl, serviceKey);

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("mutuel_markets")
    .update({ status: "closed" })
    .eq("status", "active")
    .lt("betting_closes_at", now)
    .select("id, title, betting_closes_at");

  if (error) {
    console.error("[auto-close-pools]", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const closed = data ?? [];
  console.log(`[auto-close-pools] closed ${closed.length} pools`);

  return new Response(
    JSON.stringify({ ok: true, closed: closed.length, pools: closed.map((p: { id: string; title: string }) => ({ id: p.id, title: p.title })) }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
