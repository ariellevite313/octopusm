import type { Metadata } from "next";
import { getConnectedWallets } from "@/services/admin-service";
import { AdminWalletsClient } from "@/components/admin/admin-wallets-client";

export const metadata: Metadata = { title: "Connected Wallets — Admin" };
export const revalidate = 0;

export default async function AdminWalletsPage() {
  const wallets = await getConnectedWallets();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Connected Wallets</h1>
        <p className="text-sm text-muted-foreground mt-1">{wallets.length} wallet{wallets.length !== 1 ? "s" : ""}</p>
      </div>
      <AdminWalletsClient wallets={wallets} />
    </div>
  );
}
