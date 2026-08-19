"use client";

import { usePathname } from "next/navigation";
import { TokenBalances } from "@/components/dashboard/token-balances";

type Props = React.ComponentProps<typeof TokenBalances>;

export function BalancesSection(props: Props) {
  const pathname = usePathname();

  // Launchpad dashboard is a separate universe — hide prediction market balances
  if (pathname === "/dashboard/launchpad" || pathname.startsWith("/dashboard/launchpad/")) {
    return null;
  }

  return (
    <section>
      <h2 className="mb-3 text-base font-bold text-foreground">Balances</h2>
      <TokenBalances {...props} />
    </section>
  );
}
