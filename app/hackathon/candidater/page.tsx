import type { Metadata } from "next";
import { ApplyForm } from "@/components/hackathon/apply-form";

export const metadata: Metadata = { title: "Apply to the hackathon" };
export default function Page() { return <ApplyForm />; }
