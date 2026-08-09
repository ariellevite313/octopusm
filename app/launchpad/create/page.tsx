import type { Metadata } from "next";
import Link from "next/link";
import { CreateTokenWizard } from "@/components/launchpad/create-token-wizard";

export const metadata: Metadata = {
  title: "Launch a Token — Launchpad",
  description: "Create and launch your Solana token on OMdotfun.",
  robots: { index: false, follow: false },
};

export default function CreateTokenPage() {
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
        <p className="text-sm text-muted-foreground">
          Launch your token on Solana
        </p>
      </div>
      <CreateTokenWizard />
    </main>
  );
}
