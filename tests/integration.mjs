/**
 * Octopus Market — Supabase Integration Tests
 * Run: node tests/integration.mjs
 *
 * Reads credentials from .env.local:
 *   VITE_SUPABASE_URL      — public URL
 *   VITE_SUPABASE_ANON_KEY — anon key (used by the app)
 *   SUPABASE_SERVICE_KEY   — service role key (bypasses RLS, required for tests)
 *
 * All test rows use a timestamped prefix and are deleted in a cleanup phase.
 * Deletion order respects FK dependencies (children before parents).
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ─── Env loading ──────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) {
    console.error("❌  .env.local not found");
    process.exit(1);
  }
  const lines = readFileSync(envPath, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = val;
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env["VITE_SUPABASE_URL"];
const SUPABASE_ANON_KEY = env["VITE_SUPABASE_ANON_KEY"];
const SUPABASE_SERVICE_KEY = env["SUPABASE_SERVICE_KEY"];

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌  Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.warn("⚠️   SUPABASE_SERVICE_KEY not found — add it from Supabase dashboard → Settings → API → service_role\n");
}

// Service key bypasses RLS (required for INSERT/UPDATE tests).
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY ?? SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// ─── Test harness ─────────────────────────────────────────────────────────────

const P = `__test_${Date.now()}`;   // unique prefix for this run
const results = [];

async function run(label, fn) {
  try {
    await fn();
    results.push({ label, ok: true });
    console.log(`  ✅  ${label}`);
  } catch (err) {
    results.push({ label, ok: false, err: err.message ?? String(err) });
    console.log(`  ❌  ${label}\n       ${err.message ?? err}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? "Assertion failed");
}

function ok(result, ctx) {
  if (result.error) throw new Error(`[${ctx}] ${result.error.message}`);
}

// ─── Test IDs ─────────────────────────────────────────────────────────────────
//
// Dependency graph (→ = FK parent must exist first):
//   wallets
//     ├── ai_listings        (wallet_address → wallets.address)
//     ├── admin_logs         (admin_wallet   → wallets.address)
//     └── ai_memory          (wallet_address → wallets.address)
//   ai_tool_social
//     ├── tool_ratings       (tool_name → ai_tool_social.tool_name)
//     ├── tool_reactions     (tool_name → ai_tool_social.tool_name)
//     └── tool_comments      (tool_name → ai_tool_social.tool_name)
//   prediction_markets — independent
//   token_board        — independent
//   payment_requests   — independent

const ids = {
  wallet:        `${P}_wallet`,
  adminWallet:   `${P}_admin`,
  market:        `${P}_market`,
  listing:       `${P}_listing`,
  toolName:      `${P}_tool`,
  rating:        randomUUID(),
  reaction:      randomUUID(),
  comment:       `${P}_comment`,
  log:           `${P}_log`,
  token:         `${P}_token`,
  paymentReq:    `${P}_preq`,
};

console.log("\n🐙  Octopus Market — Supabase Integration Tests");
console.log(`    URL    : ${SUPABASE_URL}`);
console.log(`    Prefix : ${P}\n`);

// ─── 1. Connectivity ──────────────────────────────────────────────────────────

console.log("── 1. Connectivity");

await run("Client initialises", async () => {
  assert(supabase !== null);
});

await run("Can reach Supabase (wallets SELECT)", async () => {
  const r = await supabase.from("wallets").select("address").limit(1);
  if (r.error && !r.error.message.toLowerCase().includes("permission")) throw new Error(r.error.message);
});

// ─── 2. Seed parent rows (wallet + ai_tool_social) ────────────────────────────
//    These must exist before any FK-dependent inserts below.

console.log("\n── 2. Parent rows (wallet + ai_tool_social)");

await run("INSERT wallet (parent)", async () => {
  ok(await supabase.from("wallets").insert({
    address: ids.wallet,
    role: "user",
    status: "active",
    first_connected_at: new Date().toISOString(),
    last_connected_at:  new Date().toISOString(),
    latest_activity_at: new Date().toISOString(),
    latest_activity_label: "test",
  }), "wallets insert");
});

await run("INSERT admin wallet (parent for admin_logs)", async () => {
  ok(await supabase.from("wallets").insert({
    address: ids.adminWallet,
    role: "admin",
    status: "active",
    first_connected_at: new Date().toISOString(),
    last_connected_at:  new Date().toISOString(),
    latest_activity_at: new Date().toISOString(),
    latest_activity_label: "test-admin",
  }), "wallets admin insert");
});

await run("INSERT ai_tool_social (parent for ratings/reactions/comments)", async () => {
  ok(await supabase.from("ai_tool_social").insert({
    tool_name: ids.toolName,
    rating_average: 0,
    rating_count: 0,
    reports: 0,
  }), "ai_tool_social insert");
});

// ─── 3. wallets CRUD ──────────────────────────────────────────────────────────

console.log("\n── 3. wallets");

await run("SELECT wallet", async () => {
  const r = await supabase.from("wallets").select("address").eq("address", ids.wallet).single();
  ok(r, "wallets select");
  assert(r.data?.address === ids.wallet, "address mismatch");
});

await run("UPDATE wallet status → suspended", async () => {
  ok(await supabase.from("wallets").update({ status: "suspended" }).eq("address", ids.wallet), "wallets update");
});

await run("UPDATE wallet status → active", async () => {
  ok(await supabase.from("wallets").update({ status: "active" }).eq("address", ids.wallet), "wallets restore");
});

// ─── 4. prediction_markets ────────────────────────────────────────────────────

console.log("\n── 4. prediction_markets");

await run("INSERT prediction market", async () => {
  ok(await supabase.from("prediction_markets").insert({
    id: ids.market,
    category_id: "test",
    title: "Test market — integration",
    market_type: "yes-no",
    resolution_label: "Resolved when test passes",
    visual_type: "simple",
    options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
    is_resolved: false,
    is_active: true,
  }), "prediction_markets insert");
});

await run("SELECT prediction market", async () => {
  const r = await supabase.from("prediction_markets").select("id, title").eq("id", ids.market).single();
  ok(r, "prediction_markets select");
  assert(r.data?.id === ids.market, "id mismatch");
});

await run("UPDATE market → resolved", async () => {
  ok(await supabase.from("prediction_markets").update({
    is_resolved: true,
    resolution_outcome_id: "yes",
    resolved_at: new Date().toISOString(),
  }).eq("id", ids.market), "prediction_markets update");
});

// ─── 5. ai_listings ───────────────────────────────────────────────────────────

console.log("\n── 5. ai_listings");

await run("INSERT AI listing", async () => {
  ok(await supabase.from("ai_listings").insert({
    id: ids.listing,
    wallet_address: ids.wallet,   // FK → wallets.address (now exists)
    display_name: "Test AI Tool",
    twitter_handle: "@test",
    icon_src: "https://example.com/icon.png",
    icon_name: "test-icon",
    website_url: "https://example.com",
    description: "Integration test listing",
    social_url: "https://twitter.com/test",
    guide_file_name: "test.pdf",
    guide_file_url: "https://example.com/guide.pdf",
    plan_id: "free",
    billing_label: "Free",
    amount_usd: 0,
    auto_renew_enabled: false,
    status: "pending",
    badge: "none",
    visible_in_explore: false,
    visitor_count: 0,
  }), "ai_listings insert");
});

await run("SELECT AI listing", async () => {
  const r = await supabase.from("ai_listings").select("id, status").eq("id", ids.listing).single();
  ok(r, "ai_listings select");
  assert(r.data?.id === ids.listing, "id mismatch");
});

await run("UPDATE listing → approved", async () => {
  ok(await supabase.from("ai_listings").update({ status: "approved", badge: "blue" }).eq("id", ids.listing), "ai_listings update");
});

// ─── 6. tool_ratings ──────────────────────────────────────────────────────────

console.log("\n── 6. tool_ratings");

await run("INSERT tool rating", async () => {
  ok(await supabase.from("tool_ratings").insert({
    id: ids.rating,
    tool_name: ids.toolName,   // FK → ai_tool_social.tool_name (now exists)
    actor_key: ids.wallet,
    rating: 4,
  }), "tool_ratings insert");
});

await run("SELECT tool rating", async () => {
  const r = await supabase.from("tool_ratings").select("rating").eq("id", ids.rating).single();
  ok(r, "tool_ratings select");
  assert(r.data?.rating === 4, "rating mismatch");
});

await run("UPDATE tool rating → 5", async () => {
  ok(await supabase.from("tool_ratings").update({ rating: 5 }).eq("id", ids.rating), "tool_ratings update");
});

// ─── 7. tool_reactions ────────────────────────────────────────────────────────

console.log("\n── 7. tool_reactions");

await run("INSERT tool reaction", async () => {
  ok(await supabase.from("tool_reactions").insert({
    id: ids.reaction,
    tool_name: ids.toolName,
    actor_key: ids.wallet,
    reaction_type: "heart",
  }), "tool_reactions insert");
});

await run("SELECT tool reaction", async () => {
  const r = await supabase.from("tool_reactions").select("reaction_type").eq("id", ids.reaction).single();
  ok(r, "tool_reactions select");
  assert(r.data?.reaction_type === "heart", "reaction_type mismatch");
});

// ─── 8. tool_comments ─────────────────────────────────────────────────────────

console.log("\n── 8. tool_comments");

await run("INSERT tool comment", async () => {
  ok(await supabase.from("tool_comments").insert({
    id: ids.comment,
    tool_name: ids.toolName,
    author: ids.wallet,
    content: "Integration test comment",
  }), "tool_comments insert");
});

await run("SELECT tool comment", async () => {
  const r = await supabase.from("tool_comments").select("content").eq("id", ids.comment).single();
  ok(r, "tool_comments select");
  assert(r.data?.content === "Integration test comment", "content mismatch");
});

// ─── 9. admin_logs ────────────────────────────────────────────────────────────

console.log("\n── 9. admin_logs");

await run("INSERT admin log", async () => {
  ok(await supabase.from("admin_logs").insert({
    id: ids.log,
    admin_wallet: ids.adminWallet,   // FK → wallets.address (now exists)
    action: "create_prediction",
    target_id: ids.market,
    details: "Integration test log",
  }), "admin_logs insert");
});

await run("SELECT admin log by id", async () => {
  const r = await supabase.from("admin_logs").select("action").eq("id", ids.log).single();
  ok(r, "admin_logs select");
  assert(r.data?.action === "create_prediction", "action mismatch");
});

await run("SELECT admin logs by wallet", async () => {
  const r = await supabase.from("admin_logs").select("id").eq("admin_wallet", ids.adminWallet);
  ok(r, "admin_logs by wallet");
  assert(Array.isArray(r.data) && r.data.length >= 1, "expected ≥1 log");
});

// ─── 10. ai_memory ────────────────────────────────────────────────────────────

console.log("\n── 10. ai_memory");

await run("UPSERT ai_memory", async () => {
  ok(await supabase.from("ai_memory").upsert({
    wallet_address: ids.wallet,   // FK → wallets.address (now exists)
    user_name: "Test User",
    user_age: "30",
    user_location: "Paris",
    user_profession: "Developer",
    language_preference: "en",
    response_style: "concise",
    tone_preference: "professional",
    humor_preference: "light",
    projects_in_progress: ["Octopus Market"],
    current_goals: ["Pass all tests"],
    important_information: ["Supabase migration"],
    updated_at: new Date().toISOString(),
  }, { onConflict: "wallet_address" }), "ai_memory upsert");
});

await run("SELECT ai_memory", async () => {
  const r = await supabase.from("ai_memory").select("user_name, current_goals").eq("wallet_address", ids.wallet).single();
  ok(r, "ai_memory select");
  assert(r.data?.user_name === "Test User", "user_name mismatch");
  assert(Array.isArray(r.data?.current_goals), "current_goals should be array");
});

await run("UPDATE ai_memory user_name", async () => {
  ok(await supabase.from("ai_memory").update({ user_name: "Updated User" }).eq("wallet_address", ids.wallet), "ai_memory update");
});

// ─── 11. token_board ──────────────────────────────────────────────────────────

console.log("\n── 11. token_board");

await run("INSERT token_board", async () => {
  ok(await supabase.from("token_board").insert({
    id: ids.token,
    name: "Test Token",
    ticker: "TEST",
    status: "active",
    chart_points: [],
  }), "token_board insert");
});

await run("SELECT token_board", async () => {
  const r = await supabase.from("token_board").select("ticker").eq("id", ids.token).single();
  ok(r, "token_board select");
  assert(r.data?.ticker === "TEST", "ticker mismatch");
});

await run("UPDATE token_board price", async () => {
  ok(await supabase.from("token_board").update({ price: "$0.01" }).eq("id", ids.token), "token_board update");
});

// ─── 12. payment_requests ─────────────────────────────────────────────────────

console.log("\n── 12. payment_requests");

await run("INSERT payment_request", async () => {
  ok(await supabase.from("payment_requests").insert({
    id: ids.paymentReq,
    kind: "listing",
    recipient: ids.wallet,
    amount: 10,
    reference: `ref_${P}`,
    currency: "USDC",
    status: "created",
    metadata: {},
  }), "payment_requests insert");
});

await run("SELECT payment_request", async () => {
  const r = await supabase.from("payment_requests").select("status").eq("id", ids.paymentReq).single();
  ok(r, "payment_requests select");
  assert(r.data?.status === "created", "status mismatch");
});

await run("UPDATE payment_request → signed", async () => {
  ok(await supabase.from("payment_requests").update({ status: "signed" }).eq("id", ids.paymentReq), "payment_requests update");
});

// ─── 13. RLS spot-check (anon key) ────────────────────────────────────────────

console.log("\n── 13. RLS / anon read access");

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

for (const table of ["wallets", "prediction_markets", "ai_listings", "ai_tool_social", "tool_ratings", "tool_reactions", "tool_comments", "admin_logs", "ai_memory"]) {
  await run(`Anon can SELECT ${table}`, async () => {
    const r = await anonClient.from(table).select("*").limit(1);
    if (r.error && !r.error.message.toLowerCase().includes("permission")) throw new Error(r.error.message);
  });
}

// ─── Cleanup (reverse FK order: children before parents) ──────────────────────

console.log("\n── Cleanup");

const cleanups = [
  // Children first
  ["ai_memory",        (s) => s.from("ai_memory").delete().eq("wallet_address", ids.wallet)],
  ["admin_logs",       (s) => s.from("admin_logs").delete().eq("id", ids.log)],
  ["tool_comments",    (s) => s.from("tool_comments").delete().eq("id", ids.comment)],
  ["tool_reactions",   (s) => s.from("tool_reactions").delete().eq("id", ids.reaction)],
  ["tool_ratings",     (s) => s.from("tool_ratings").delete().eq("id", ids.rating)],
  ["ai_listings",      (s) => s.from("ai_listings").delete().eq("id", ids.listing)],
  ["prediction_markets",(s)=> s.from("prediction_markets").delete().eq("id", ids.market)],
  ["token_board",      (s) => s.from("token_board").delete().eq("id", ids.token)],
  ["payment_requests", (s) => s.from("payment_requests").delete().eq("id", ids.paymentReq)],
  // Parents last
  ["ai_tool_social",   (s) => s.from("ai_tool_social").delete().eq("tool_name", ids.toolName)],
  ["wallet (user)",    (s) => s.from("wallets").delete().eq("address", ids.wallet)],
  ["wallet (admin)",   (s) => s.from("wallets").delete().eq("address", ids.adminWallet)],
];

for (const [label, fn] of cleanups) {
  await run(`DELETE ${label}`, async () => { ok(await fn(supabase), `delete ${label}`); });
}

// ─── Summary ──────────────────────────────────────────────────────────────────

const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;

console.log("\n─────────────────────────────────────────────────────────────");
console.log(`  Results : ${passed}/${results.length} passed`);

if (failed > 0) {
  console.log("\n  Failed tests:");
  results.filter((r) => !r.ok).forEach((r) => {
    console.log(`    ❌  ${r.label}`);
    console.log(`         ${r.err}`);
  });
  console.log();
  process.exit(1);
} else {
  console.log("  🎉  All tests passed!\n");
}
