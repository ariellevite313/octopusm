import type { Metadata } from "next";

export const metadata: Metadata = { title: "AI agents", description: "Connect Claude, ChatGPT or Grok to OMdotfun, or build an agent that posts, trades and launches tokens." };

export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
