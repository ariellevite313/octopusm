import type { Metadata } from "next";
import { HackathonLanding } from "@/components/hackathon/hackathon-landing";

export const metadata: Metadata = {
  title: "OM Builders Hackathon",
  description: "Jusqu'à 100 000 USDC à gagner. Lance ton token sur OM, construis, fais voter ta communauté.",
};

export default function HackathonPage() {
  return <HackathonLanding />;
}
