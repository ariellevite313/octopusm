"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { ChevronDown, ArrowUpRight } from "lucide-react";
import type { TokenActivity, OctoActivity, TokenStats, OctoStats } from "@/services/dashboard-service";
import { WithdrawModal } from "@/components/dashboard/withdraw-modal";
import { createClient } from "@/lib/supabase/client";

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtUsdc(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtClt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Stat box ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, variant = "neutral" }: {
  label: string;
  value: string;
  variant?: "neutral" | "gain" | "loss";
}) {
  const color =
    variant === "gain" ? "text-emerald-600 dark:text-emerald-400" :
    variant === "loss" ? "text-red-600 dark:text-red-400" :
    "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}

// ─── Activity row ─────────────────────────────────────────────────────────────

function ActivityRow({ label, sub, amount, date, direction = "in" }: {
  label: string;
  sub: string;
  amount: string;
  date: string;
  direction?: "in" | "out";
}) {
  const isOut = direction === "out";
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`size-2 rounded-full shrink-0 ${isOut ? "bg-red-400" : "bg-emerald-500"}`} />
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
        </div>
      </div>
      <div className="shrink-0 text-right ml-3">
        <p className={`text-xs font-semibold ${isOut ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
          {amount}
        </p>
        <p className="text-[10px] text-muted-foreground">{date}</p>
      </div>
    </div>
  );
}

// ─── USDC accordion ───────────────────────────────────────────────────────────

function UsdcDropdown({ stats, activity, balance, onWithdraw }: {
  stats: TokenStats;
  activity: TokenActivity[];
  balance: number;
  onWithdraw: () => void;
}) {
  return (
    <div className="border-t border-border bg-muted/30 px-4 py-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Volume"     value={`$${fmtUsdc(stats.volume)}`} />
        <StatBox label="Total wins"  value={`+$${fmtUsdc(stats.gains)}`}  variant="gain" />
        <StatBox label="Total losses" value={`-$${fmtUsdc(stats.losses)}`} variant="loss" />
      </div>
      {activity.length > 0 ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </p>
          <div>
            {activity.slice(0, 8).map((a) => (
              <ActivityRow
                key={a.id}
                label={a.label}
                sub={a.sub}
                amount={a.direction === "out" ? `-$${fmtUsdc(a.amount)}` : `+$${fmtUsdc(a.amount)}`}
                date={fmtDate(a.created_at)}
                direction={a.direction}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      )}
      {balance >= 2 ? (
        <button
          type="button"
          onClick={onWithdraw}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-400 transition-colors"
        >
          <ArrowUpRight className="size-4" />
          Withdraw USDC
        </button>
      ) : balance > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          Minimum withdrawal: <span className="font-semibold text-foreground">$2.00 USDC</span>
        </p>
      ) : null}
    </div>
  );
}

// ─── CLT accordion ────────────────────────────────────────────────────────────

function CltDropdown({ stats, activity, balance, onWithdraw }: {
  stats: TokenStats;
  activity: TokenActivity[];
  balance: number;
  onWithdraw: () => void;
}) {
  return (
    <div className="border-t border-border bg-muted/30 px-4 py-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Volume"      value={fmtClt(stats.volume)} />
        <StatBox label="Total wins"  value={`+${fmtClt(stats.gains)}`}  variant="gain" />
        <StatBox label="Total losses" value={`-${fmtClt(stats.losses)}`} variant="loss" />
      </div>
      {activity.length > 0 ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </p>
          <div>
            {activity.slice(0, 8).map((a) => (
              <ActivityRow
                key={a.id}
                label={a.label}
                sub={a.sub}
                amount={a.direction === "out" ? `-${fmtClt(a.amount)} CLT` : `+${fmtClt(a.amount)} CLT`}
                date={fmtDate(a.created_at)}
                direction={a.direction}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      )}
      {balance >= 500_000 ? (
        <button
          type="button"
          onClick={onWithdraw}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-purple-600 py-2.5 text-sm font-semibold text-white hover:bg-purple-500 transition-colors"
        >
          <ArrowUpRight className="size-4" />
          Withdraw CLT
        </button>
      ) : balance > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          Minimum withdrawal: <span className="font-semibold text-foreground">500K CLT</span>
        </p>
      ) : null}
    </div>
  );
}

// ─── OCTO accordion ───────────────────────────────────────────────────────────

function OctoDropdown({ stats, activity }: {
  stats: OctoStats;
  activity: OctoActivity[];
}) {
  return (
    <div className="border-t border-border bg-muted/30 px-4 py-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatBox label="Referrals"   value={`+${stats.referral.toLocaleString("en-US")}`} variant="gain" />
        <StatBox label="Predictions" value={`+${stats.bet.toLocaleString("en-US")}`}      variant="gain" />
        <StatBox label="Tasks"       value={`+${stats.task.toLocaleString("en-US")}`}      variant="gain" />
      </div>
      {activity.length > 0 ? (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent activity
          </p>
          <div>
            {activity.slice(0, 8).map((a) => (
              <ActivityRow
                key={a.id}
                label={a.label}
                sub={a.sub}
                amount={`+${a.amount.toLocaleString("en-US")} OCTO`}
                date={fmtDate(a.created_at)}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No activity yet.</p>
      )}
      <p className="text-[10px] text-muted-foreground">
        OCTO points are non-transferable — they reflect your platform rank.
      </p>
    </div>
  );
}

// ─── Token row ────────────────────────────────────────────────────────────────

function TokenRow({
  logo, name, symbol, balance, open, onToggle, children,
}: {
  logo: string;
  name: string;
  symbol: string;
  balance: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="size-9 shrink-0 rounded-full overflow-hidden bg-muted">
          <Image src={logo} alt={symbol} width={36} height={36} className="size-9 object-cover" unoptimized />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">{name}</p>
          <p className="text-xs text-muted-foreground">{symbol}</p>
        </div>
        <p className="text-sm font-semibold text-foreground shrink-0">{balance}</p>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 shrink-0 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TokenBalances({
  usdcBalance: initialUsdcBalance,
  cltBalance: initialCltBalance,
  octoBalance,
  usdcStats,
  cltStats,
  octoStats,
  usdcActivity: initialUsdcActivity,
  cltActivity: initialCltActivity,
  octoActivity,
}: {
  usdcBalance: number;
  cltBalance: number;
  octoBalance: number;
  usdcStats: TokenStats;
  cltStats: TokenStats;
  octoStats: OctoStats;
  usdcActivity: TokenActivity[];
  cltActivity: TokenActivity[];
  octoActivity: OctoActivity[];
}) {
  const [open, setOpen] = useState<"usdc" | "clt" | "octo" | null>(null);
  const [withdrawToken, setWithdrawToken] = useState<"usdc" | "clawdtrust" | null>(null);
  const [usdcBalance, setUsdcBalance]     = useState(initialUsdcBalance);
  const [cltBalance, setCltBalance]       = useState(initialCltBalance);
  const [usdcActivity, setUsdcActivity]   = useState<TokenActivity[]>(initialUsdcActivity);
  const [cltActivity, setCltActivity]     = useState<TokenActivity[]>(initialCltActivity);

  const toggle = (tok: "usdc" | "clt" | "octo") =>
    setOpen((prev) => (prev === tok ? null : tok));

  // Re-fetch balances from the API
  const refreshBalances = useCallback(async () => {
    try {
      const res = await fetch("/api/balance");
      if (!res.ok) return;
      const { usdcBalance: u, cltBalance: c } = await res.json() as { usdcBalance: number; cltBalance: number };
      setUsdcBalance(u);
      setCltBalance(c);
    } catch {
      // silent — stale values remain
    }
  }, []);

  // Re-fetch activity list from the API (wins + commissions + withdrawals)
  const refreshActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      if (!res.ok) return;
      const { usdcActivity: ua, cltActivity: ca } = await res.json() as {
        usdcActivity: TokenActivity[];
        cltActivity: TokenActivity[];
      };
      setUsdcActivity(ua);
      setCltActivity(ca);
    } catch {
      // silent — stale values remain
    }
  }, []);

  // Refresh both balance and activity together
  const refreshAll = useCallback(() => {
    void refreshBalances();
    void refreshActivity();
  }, [refreshBalances, refreshActivity]);

  // Supabase Realtime: listen for bet resolutions and withdrawal changes
  useEffect(() => {
    const sb = createClient();
    const channel = sb
      .channel("balance-and-activity-updates")
      // Withdrawal changes (any status: pending/approved/paid/rejected)
      .on("postgres_changes" as const, { event: "INSERT", schema: "public", table: "withdrawal_requests" }, refreshAll)
      .on("postgres_changes" as const, { event: "UPDATE", schema: "public", table: "withdrawal_requests" }, refreshAll)
      .on("postgres_changes" as const, { event: "DELETE", schema: "public", table: "withdrawal_requests" }, refreshAll)
      // Up/Down bets: status flips to "won" when market resolves → payout credited
      .on("postgres_changes" as const, { event: "UPDATE", schema: "public", table: "updown_bets" }, refreshAll)
      // Pool bets: payout_amount is set automatically when admin resolves the market
      .on("postgres_changes" as const, { event: "UPDATE", schema: "public", table: "mutuel_bets" }, refreshAll)
      .subscribe();

    return () => { void sb.removeChannel(channel); };
  }, [refreshAll]);

  return (
    <>
      <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
        <TokenRow
          logo="/usdc-coin.png"
          name="USD Coin"
          symbol="USDC"
          balance={`$${fmtUsdc(usdcBalance)}`}
          open={open === "usdc"}
          onToggle={() => toggle("usdc")}
        >
          <UsdcDropdown
            stats={usdcStats}
            activity={usdcActivity}
            balance={usdcBalance}
            onWithdraw={() => setWithdrawToken("usdc")}
          />
        </TokenRow>

        <TokenRow
          logo="/clawdtrust-coin.png"
          name="ClawdTrust"
          symbol="CLT"
          balance={fmtClt(cltBalance)}
          open={open === "clt"}
          onToggle={() => toggle("clt")}
        >
          <CltDropdown
            stats={cltStats}
            activity={cltActivity}
            balance={cltBalance}
            onWithdraw={() => setWithdrawToken("clawdtrust")}
          />
        </TokenRow>

        <TokenRow
          logo="/octo-coin.png"
          name="Octo Points"
          symbol="OCTO"
          balance={octoBalance.toLocaleString("en-US")}
          open={open === "octo"}
          onToggle={() => toggle("octo")}
        >
          <OctoDropdown stats={octoStats} activity={octoActivity} />
        </TokenRow>
      </div>

      {withdrawToken && (
        <WithdrawModal
          token={withdrawToken}
          balance={withdrawToken === "usdc" ? usdcBalance : cltBalance}
          onClose={() => { setWithdrawToken(null); refreshAll(); }}
        />
      )}
    </>
  );
}
