import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/services/admin-service";
import { AdminTickersClient } from "@/components/admin/admin-tickers-client";

export const metadata: Metadata = { title: "Reserved tickers — Admin" };
export const revalidate = 0;

export default async function AdminTickersPage() {
  if (!(await requireAdmin())) redirect("/");
  return <AdminTickersClient />;
}
