import type { Metadata } from "next";
import { Studio } from "@/components/studio/studio";

export const metadata: Metadata = { title: "Studio", description: "Make Omero memes, profile photos and banners." };

export default function StudioPage() {
  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-6 lg:max-w-5xl lg:px-8">
      <Studio />
    </div>
  );
}
