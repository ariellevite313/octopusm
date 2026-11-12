import type { Metadata } from "next";
import { CommunitiesList } from "@/components/communities/communities-list";

export const metadata: Metadata = { title: "Communities", description: "Public communities on OMdotfun" };

export default function CommunitiesPage() {
  return <CommunitiesList />;
}
