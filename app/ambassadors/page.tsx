import type { Metadata } from "next";
import { AmbassadorsPage } from "@/components/ambassadors/ambassadors-page";

export const metadata: Metadata = { title: "Ambassador program", description: "Become an OMdotfun ambassador: 20 places, 20% of the fees on your referrals." };

export default function Page() {
  return <AmbassadorsPage />;
}
