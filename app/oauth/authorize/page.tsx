import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthorizeCard } from "@/components/oauth/authorize-card";

export const metadata: Metadata = { title: "Connect an AI assistant", robots: { index: false } };

export default function AuthorizePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-[28px] bg-muted/30" />}>
        <AuthorizeCard />
      </Suspense>
    </div>
  );
}
