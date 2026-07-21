"use client";

import { useState, useEffect } from "react";
import { AdminPaymentsClient } from "./admin-payments-client";
import type { PaymentRow } from "@/lib/supabase/types";

type Props = {
  payments: PaymentRow[];
  currentFilter?: string;
  currentFlow?: string;
  pendingCount?: number;
};

/**
 * Client-only wrapper that defers rendering AdminPaymentsClient until after
 * hydration, without using next/dynamic (which wraps in a Suspense boundary
 * and triggers React 19 + Turbopack insertBefore crashes on initial mount).
 */
export function AdminPaymentsLoader(props: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-[200px] animate-pulse rounded-2xl border border-border bg-muted/20" />
    );
  }

  return <AdminPaymentsClient {...props} />;
}
