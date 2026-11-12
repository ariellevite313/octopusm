import type { Metadata } from "next";
import { AdminAmbassadors } from "@/components/admin/admin-ambassadors";

export const metadata: Metadata = { title: "Ambassadors — Admin" };
export const dynamic = "force-dynamic";

export default function AdminAmbassadorsPage() {
  return <AdminAmbassadors />;
}
