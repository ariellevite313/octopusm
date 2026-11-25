import type { Metadata } from "next";
import { AppDetail } from "@/components/discover/app-detail";

export const metadata: Metadata = { title: "App", description: "An app built with an OM token." };

export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-xl pb-32 sm:max-w-3xl md:max-w-4xl lg:max-w-5xl">
      <AppDetail id={id} />
    </div>
  );
}
