import type { Metadata } from "next";
import { InfosView } from "@/components/hackathon/infos-view";

export const metadata: Metadata = { title: "Hackathon info and rules" };
export default function Page() { return <InfosView />; }
