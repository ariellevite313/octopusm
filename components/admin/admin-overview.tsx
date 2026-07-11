import Link from "next/link";
import { BarChart3, CheckSquare, CreditCard, Layers, Rocket, TrendingUp } from "lucide-react";
import { getAdminStats } from "@/services/admin-service";

export async function AdminOverview() {
  const stats = await getAdminStats();

  const cards = [
    {
      label: "Active markets",
      value: stats.activeMarkets,
      sub: `${stats.totalMarkets} total — ${stats.resolvedMarkets} resolved`,
      href: "/admin/markets",
      icon: BarChart3,
      color: "text-orange-500",
    },
    {
      label: "Pending payments",
      value: stats.pendingPayments,
      sub: `${stats.totalPayments} total`,
      href: "/admin/payments",
      icon: CreditCard,
      color: stats.pendingPayments > 0 ? "text-orange-500" : "text-emerald-500",
    },
    {
      label: "Pending launches",
      value: stats.pendingLaunches,
      sub: "Token launch requests",
      href: "/admin/launches",
      icon: Rocket,
      color: stats.pendingLaunches > 0 ? "text-orange-500" : "text-emerald-500",
    },
    {
      label: "Predictions to validate",
      value: stats.pendingBets + stats.pendingPools,
      sub: `${stats.pendingBets} markets · ${stats.pendingPools} pools`,
      href: "/admin/bets",
      icon: Layers,
      color: (stats.pendingBets + stats.pendingPools) > 0 ? "text-orange-500" : "text-emerald-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, sub, href, icon: Icon, color }) => (
          <Link
            key={href}
            href={href}
            className="rounded-2xl border border-border bg-card p-5 transition-all hover:border-orange-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-1 text-3xl font-bold">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
              </div>
              <Icon className={`size-6 ${color}`} />
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/tasks"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:border-orange-300 hover:shadow-md"
        >
          <CheckSquare className="size-5 text-purple-500" />
          <div>
            <p className="font-medium">Task management</p>
            <p className="text-sm text-muted-foreground">Create, enable, disable tasks</p>
          </div>
        </Link>
        <Link
          href="/archive"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:border-orange-300 hover:shadow-md"
        >
          <TrendingUp className="size-5 text-emerald-500" />
          <div>
            <p className="font-medium">Public archive</p>
            <p className="text-sm text-muted-foreground">View resolved markets</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
