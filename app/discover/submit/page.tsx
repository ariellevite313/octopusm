import type { Metadata } from "next";
import { SubmitApp } from "@/components/discover/submit-app";

export const metadata: Metadata = { title: "List my app", robots: { index: false, follow: false } };

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-6">
      <SubmitApp />
    </div>
  );
}
