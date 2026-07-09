import type { Metadata } from "next";
import { getAllLaunches } from "@/services/admin-service";
import { AdminLaunchesClient } from "@/components/admin/admin-launches-client";

export const metadata: Metadata = { title: "Launches — Admin" };
export const revalidate = 0;

export default async function AdminLaunchesPage() {
  const launches = await getAllLaunches();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Token Launches</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {launches.length} demandes · {launches.filter((l) => l.status === "pending").length} en attente
        </p>
      </div>
      <AdminLaunchesClient launches={launches} />
    </div>
  );
}
