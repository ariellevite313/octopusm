import type { Metadata } from "next";
import { JanusPage } from "@/components/janus/janus-page";

export const metadata: Metadata = { title: "Janus | OMdotfun", description: "Janus is your AI on OMdotfun: its own wallet, your limits, your exits executed 24/7." };

export default function Page() {
  return <JanusPage />;
}
