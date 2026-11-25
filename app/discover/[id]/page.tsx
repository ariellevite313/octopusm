import type { Metadata } from "next";
import { AppDetail } from "@/components/discover/app-detail";

export const metadata: Metadata = { title: "App", description: "An app built with an OM token." };

export default async function AppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-4 lg:max-w-3xl lg:px-8">
      <AppDetail id={id} />
    </div>
  );
}
