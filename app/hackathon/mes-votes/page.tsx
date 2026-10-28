import type { Metadata } from "next";
import { MyVotesView } from "@/components/hackathon/my-votes-view";

export const metadata: Metadata = { title: "My votes" };
export default function Page() { return <MyVotesView />; }
