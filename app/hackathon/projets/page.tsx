import type { Metadata } from "next";
import { HackathonHome } from "@/components/hackathon/hackathon-home";

export const metadata: Metadata = {
  title: "OM Builders Hackathon · Projets",
  description: "Les projets inscrits au hackathon OM, la cagnotte collectée et les catégories.",
};

export default function HackathonProjectsPage() {
  return <HackathonHome />;
}
