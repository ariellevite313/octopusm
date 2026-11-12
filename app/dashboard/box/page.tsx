import type { Metadata } from "next";
import { WeeklyBox } from "@/components/dashboard/weekly-box";

export const metadata: Metadata = {
  title: "Weekly box",
  robots: { index: false, follow: false },
};

export default function WeeklyBoxPage() {
  return <WeeklyBox />;
}
