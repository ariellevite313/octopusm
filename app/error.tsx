"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <p className="text-4xl">⚠️</p>
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          An unexpected error occurred. Please try again or go back to the home page.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">ref: {error.digest}</p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
        <button
          onClick={() => router.push("/")}
          className="rounded-xl border border-border bg-muted px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/70 transition-colors"
        >
          Home
        </button>
      </div>
    </div>
  );
}
