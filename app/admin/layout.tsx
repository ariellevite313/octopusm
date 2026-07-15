import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  CheckSquare,
  CreditCard,
  LayoutDashboard,
  Layers,
  Rocket,
  Shield,
  User,
  Gavel,
  Users,
  TrendingUp,
} from "lucide-react";
import { requireAdmin } from "@/services/admin-service";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";

const NAV = [
  { href: "/admin",          label: "Overview",  icon: LayoutDashboard },
  { href: "/admin/markets",  label: "Markets",   icon: BarChart3 },
  { href: "/admin/pools",    label: "Pools",     icon: Layers },
  { href: "/admin/bets",     label: "Predicts",  icon: Gavel },
  { href: "/admin/payments", label: "Payments",  icon: CreditCard },
  { href: "/admin/launches", label: "Launches",  icon: Rocket },
  { href: "/admin/tasks",    label: "Tasks",     icon: CheckSquare },
  { href: "/admin/wallets",  label: "Wallets",   icon: Users },
  { href: "/admin/updown",   label: "Up/Down",   icon: TrendingUp },
  { href: "/admin/account",  label: "My account",icon: User },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await requireAdmin();
  if (!isAdmin) redirect("/");

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <Shield className="size-4 text-orange-500" />
          <span className="text-sm font-semibold">Admin</span>
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <AdminMobileNav />

      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
      </main>
    </div>
  );
}
