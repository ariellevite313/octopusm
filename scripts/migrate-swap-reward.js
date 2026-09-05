/**
 * node scripts/migrate-swap-reward.js
 * Run from /opt/octopus-market-next with env vars loaded.
 */

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function run() {
  const sql = `
    ALTER TABLE public.octo_transactions
      DROP CONSTRAINT IF EXISTS octo_transactions_type_check;

    ALTER TABLE public.octo_transactions
      ADD CONSTRAINT octo_transactions_type_check
      CHECK (type IN ('bet', 'task', 'referral', 'launch', 'swap'));

    CREATE INDEX IF NOT EXISTS octo_transactions_type_label_idx
      ON public.octo_transactions (type, label)
      WHERE type = 'swap';
  `;

  const { error } = await supabase.rpc("exec_sql", { sql }).single();

  if (error) {
    // exec_sql n'existe pas forcément — fallback via REST SQL
    console.error("rpc failed:", error.message);
    console.log("Lance ce SQL manuellement dans Supabase SQL editor :");
    console.log(sql);
    process.exit(1);
  }

  console.log("✅ Migration swap_reward applied.");
}

run().catch(e => { console.error(e); process.exit(1); });
