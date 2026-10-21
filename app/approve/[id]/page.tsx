import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/social/posts";
import { ApprovalCard, type Approval } from "@/components/agents/approval-card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Review agent request", robots: { index: false } };

async function load(id: string): Promise<Approval | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: it } = await admin.from("agent_intents").select("id, agent_wallet, kind, target_id, params, status, created_at, expires_at").eq("id", id).maybeSingle();
  if (!it) return null;
  const { data: w } = await admin.from("wallets").select("display_name, avatar_src").eq("address", it.agent_wallet).maybeSingle();
  let target: Approval["target"] = null;
  if (it.kind === "bet_pool") {
    const { data: m } = await admin.from("mutuel_markets").select("slug, title, cover_image_src, options").eq("id", it.target_id).maybeSingle();
    if (m) {
      const opts = (typeof m.options === "string" ? JSON.parse(m.options) : m.options) as { id: string; label: string }[];
      target = { title: m.title, image: m.cover_image_src, href: `/pools/${m.slug ?? it.target_id}`, option: opts.find((o) => o.id === it.params.option_id)?.label ?? null };
    }
  } else {
    const { data: t } = await admin.from("launchpad_tokens").select("name, ticker, logo_url, mint_address").eq("id", it.target_id).maybeSingle();
    if (t) target = { title: `${t.name} ($${t.ticker})`, image: t.logo_url, href: `/launchpad/${t.mint_address ?? it.target_id}`, option: null };
  }
  return {
    id: it.id, kind: it.kind, status: it.status, expires_at: it.expires_at, params: it.params,
    agent: { wallet: it.agent_wallet, name: w?.display_name ?? null, avatar: w?.avatar_src ?? null },
    target,
  };
}

export default async function ApprovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const a = await load(id);
  if (!a) notFound();
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <ApprovalCard a={a} />
    </div>
  );
}
