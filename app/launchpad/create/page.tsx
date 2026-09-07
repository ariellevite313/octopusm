import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { CreatePageClient } from "./create-page-client";

export const metadata: Metadata = {
  title: "Launch a Token — Launchpad",
  description: "Create and launch your token on OMdotfun.",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ from?: string }> };

export default async function CreateTokenPage({ searchParams }: Props) {
  const { from } = await searchParams;

  let initialData: Record<string, unknown> | undefined;
  if (from) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      const { data: token } = await admin
        .from("launchpad_tokens")
        .select("name, ticker, category, description, website, twitter, telegram, discord, other_social, supply")
        .eq("id", from)
        .eq("status", "cancelled")
        .maybeSingle();
      if (token) initialData = token;
    } catch { /* non-fatal */ }
  }

  return <CreatePageClient initialData={initialData} />;
}
