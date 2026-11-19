import type { Metadata } from "next";
import { ActivityPage } from "@/components/terminal/activity-page";

export const metadata: Metadata = { title: "Activity | OMdotfun" };

export default function Page() {
  return <ActivityPage />;
}
