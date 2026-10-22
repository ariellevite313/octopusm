import Link from "next/link";
import { Tr } from "@/lib/i18n";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="space-y-2">
        <p className="text-5xl font-bold text-muted-foreground/30">404</p>
        <h1 className="text-xl font-semibold text-foreground"><Tr>Page not found</Tr></h1>
        <p className="text-sm text-muted-foreground max-w-xs">
          <Tr>{"This page doesn't exist or has been removed."}</Tr>
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/"
          className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background hover:opacity-90 transition-opacity"
        >
          <Tr>Markets</Tr>
        </Link>
        <Link
          href="/"
          className="rounded-xl border border-border bg-muted px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/70 transition-colors"
        >
          <Tr>Launchpad</Tr>
        </Link>
      </div>
    </div>
  );
}
