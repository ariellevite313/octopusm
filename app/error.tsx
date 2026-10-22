"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n";
import { EmptyIcon } from "@/components/shared/empty-icon";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  const router = useRouter();
  const { tr } = useT();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <EmptyIcon icon={AlertTriangle} className="mx-auto" />
        <h1 className="text-xl font-semibold text-foreground">{tr("Something went wrong")}</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          {tr("An unexpected error occurred. Please try again or go back to the home page.")}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">ref: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90 transition-opacity"
        >
          {tr("Try again")}
        </button>
        <button
          onClick={() => router.push("/")}
          className="rounded-xl border border-border bg-muted px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/70 transition-colors"
        >
          {tr("Home")}
        </button>
      </div>
    </div>
  );
}
