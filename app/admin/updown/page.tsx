import { requireAdmin } from "@/services/admin-service";
import { redirect } from "next/navigation";
import { AdminUpDownClient } from "./admin-updown-client";

export default async function AdminUpDownPage() {
  const isAdmin = await requireAdmin();
  if (!isAdmin) redirect("/");
  return <AdminUpDownClient />;
}
