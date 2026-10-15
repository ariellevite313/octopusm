"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export function ListPager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  const btn = "flex size-9 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70 disabled:opacity-30";
  return (
    <div className="mt-3 flex items-center justify-center gap-4">
      <button type="button" aria-label="Previous page" onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0} className={btn}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="num text-sm font-semibold text-muted-foreground">{page + 1} / {total}</span>
      <button type="button" aria-label="Next page" onClick={() => onChange(Math.min(total - 1, page + 1))} disabled={page >= total - 1} className={btn}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
