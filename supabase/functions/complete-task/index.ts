/**
 * Supabase Edge Function : complete-task
 *
 * Flow :
 *   1. Lit le wallet depuis le JWT (Authorization: Bearer <access_token>)
 *   2. Vérifie que la tâche existe et est active
 *   3. Upsert dans user_task_completions (idempotent — double-claim safe)
 *   4. Insère une ligne dans octo_transactions type=task
 *
 * Sécurité :
 *   - Le wallet n'est JAMAIS lu depuis le body — uniquement depuis le JWT
 *   - Un double-claim retourne 200 sans insérer un deuxième octo_transactions
 *
 * Déploiement :
 *   supabase functions deploy complete-task
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl    = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey        = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // ── Lire le JWT de l'utilisateur ─────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!accessToken) {
      return json({ error: "Not authenticated" }, 401);
    }

    // Vérifier le token avec le client anon (valide la signature JWT Supabase)
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: "Invalid or expired token" }, 401);
    }

    const walletAddress: string = user.user_metadata?.wallet_address ?? "";
    if (!walletAddress) {
      return json({ error: "No wallet linked to this account" }, 400);
    }

    // ── Lire le body ─────────────────────────────────────────────────────────
    let body: { task_id?: string };
    try { body = await req.json(); }
    catch { return json({ error: "Invalid JSON body" }, 400); }

    const { task_id } = body;
    if (!task_id) return json({ error: "task_id required" }, 400);

    // ── Client admin (bypass RLS) ─────────────────────────────────────────────
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Vérifier que la tâche existe et est active ────────────────────────────
    const { data: task, error: taskErr } = await admin
      .from("tasks")
      .select("id, title, reward_octo, is_active")
      .eq("id", task_id)
      .maybeSingle();

    if (taskErr || !task) return json({ error: "Task not found" }, 404);
    if (!task.is_active) return json({ error: "Task is no longer active" }, 400);

    // ── Vérifier si déjà complété (idempotent guard) ──────────────────────────
    const { data: existing } = await admin
      .from("user_task_completions")
      .select("task_id")
      .eq("wallet_address", walletAddress)
      .eq("task_id", task_id)
      .maybeSingle();

    if (existing) {
      // Déjà complété — réponse 200 sans double-insertion OCTO
      return json({ ok: true, already_completed: true, octo_awarded: 0 });
    }

    // ── Insérer la complétion ─────────────────────────────────────────────────
    const { error: compErr } = await admin.from("user_task_completions").insert({
      wallet_address: walletAddress,
      task_id,
      completed_at: new Date().toISOString(),
    });
    if (compErr) {
      // Race condition : un autre appel concurrent a déjà inséré
      if (compErr.code === "23505") {
        return json({ ok: true, already_completed: true, octo_awarded: 0 });
      }
      return json({ error: compErr.message }, 500);
    }

    // ── Attribuer les points OCTO ─────────────────────────────────────────────
    const { error: octoErr } = await admin.from("octo_transactions").insert({
      wallet_address: walletAddress,
      type: "task",
      amount: task.reward_octo,
      task_id,
    });
    if (octoErr) {
      console.error("[complete-task] octo_transactions insert:", octoErr.message);
    }

    // Update leaderboard_octo so the balance reflects the award immediately
    try {
      const { data: lb } = await admin
        .from("leaderboard_octo")
        .select("total_octo")
        .eq("wallet_address", walletAddress)
        .maybeSingle();
      const current = Number(lb?.total_octo ?? 0);
      await admin.from("leaderboard_octo").upsert(
        { wallet_address: walletAddress, total_octo: current + task.reward_octo },
        { onConflict: "wallet_address" },
      );
    } catch (lbErr) {
      console.error("[complete-task] leaderboard_octo upsert:", lbErr);
    }

    return json({ ok: true, already_completed: false, octo_awarded: task.reward_octo });

  } catch (err) {
    console.error("[complete-task]", err);
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
