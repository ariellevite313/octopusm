import type { Metadata } from "next";
import { ConnectedApps } from "@/components/oauth/connected-apps";

export const metadata: Metadata = { title: "Connected apps", robots: { index: false } };

export default function ConnectedAppsPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-8 pb-32">
      <ConnectedApps />
    </div>
  );
}
