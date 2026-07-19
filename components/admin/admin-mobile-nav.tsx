"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  CheckSquare,
  CreditCard,
  LayoutDashboard,
  Layers,
  Rocket,
  User,
  Gavel,
  Users,
  MoreHorizontal,
  X,
  ArrowUpRight,
} from "lucide-react";

const PRIMARY = [
  { href: "/admin",          label: "Overview",  icon: LayoutDashboard },
  { href: "/admin/markets",  label: "Markets",   icon: BarChart3 },
  { href: "/admin/bets",     label: "Predicts",  icon: Gavel },
  { href: "/admin/payments", label: "Payments",  icon: CreditCard },
  { href: "/admin/launches", label: "Launches",  icon: Rocket },
];

const MORE_ITEMS = [
  { href: "/admin/pools",        label: "PrediMarket",  icon: Layers },
  { href: "/admin/tasks",        label: "Tasks",        icon: CheckSquare },
  { href: "/admin/wallets",      label: "Wallets",      icon: Users },
  { href: "/admin/withdrawals",  label: "Withdrawals",  icon: ArrowUpRight },
  { href: "/admin/account",      label: "My account",   icon: User },
];

export function AdminMobileNav() {
  const [showMore, setShowMore] = useState(false);

  return (
    <>
      {showMore && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
            onClick={() => setShowMore(false)}
          />
          <div className="fixed inset-x-0 bottom-[56px] z-50 border-t border-border bg-card px-2 py-2 md:hidden">
            <div className="flex items-center justify-between px-2 pb-1">
              <span className="text-xs font-semibold text-muted-foreground">More</span>
              <button
                onClick={() => setShowMore(false)}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                aria-label="Close"
              >
                <X className="size-3.5" />
              </button>
            </div>
            {MORE_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setShowMore(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 flex h-14 border-t border-border bg-card md:hidden">
        {PRIMARY.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
        <button
          onClick={() => setShowMore((s) => !s)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          aria-label="More options"
        >
          <MoreHorizontal className="size-4" />
          More
        </button>
      </div>
    </>
  );
}
