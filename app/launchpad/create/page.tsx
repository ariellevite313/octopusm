import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { CreateTokenWizard } from "@/components/launchpad/create-token-wizard";

export const metadata: Metadata = {
  title: "Launch a Token — Launchpad",
  description: "Create and launch your Solana token on OMdotfun.",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ from?: string }> };

export default async function CreateTokenPage({ searchParams }: Props) {
  const { from } = await searchParams;

  // Pre-fill wizard data when re-launching from a cancelled token
  let initialData: Record<string, unknown> | undefined;
  if (from) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const admin = createAdminClient() as any;
      const { data: token } = await admin
        .from("launchpad_tokens")
        .select("name, ticker, category, description, website, twitter, telegram, discord, other_social, supply")
        .eq("id", from)
        .eq("status", "cancelled")   // only cancelled tokens can be re-launched this way
        .maybeSingle();
      if (token) initialData = token;
    } catch { /* non-fatal — wizard starts empty */ }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link
          href="/launchpad"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Launchpad
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Launch a Token</h1>
        {initialData ? (
          <p className="text-sm text-muted-foreground">
            Re-lancement — les informations du token précédent sont pré-remplies.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Launch your token on Solana
          </p>
        )}
      </div>
      <CreateTokenWizard initialData={initialData} />
    </main>
  );
}
