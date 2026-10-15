"use client";

import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";
import { TokenBalances } from "@/components/dashboard/token-balances";

type Props = React.ComponentProps<typeof TokenBalances>;

export function BalancesSection(props: Props) {
  const pathname = usePathname();
  const { tr } = useT();

  // Launchpad dashboard is a separate universe — hide prediction market balances
  if (pathname === "/dashboard/launchpad" || pathname.startsWith("/dashboard/launchpad/")) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">{tr("Balances")}</h2>
      <TokenBalances {...props} />
    </section>
  );
}
