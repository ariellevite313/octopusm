import type { Metadata } from "next";
import { HackathonHome } from "@/components/hackathon/hackathon-home";

export const metadata: Metadata = {
  title: "OM Builders Hackathon",
  description: "Jusqu'à 100 000 USDC à gagner. Lance ton token sur OM, construis, fais voter ta communauté.",
};

export default function HackathonPage() {
  return <HackathonHome />;
}
