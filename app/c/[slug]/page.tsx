import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getCommunity } from "@/lib/social/communities";
import { CommunityView } from "@/components/communities/community-view";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const c = await getCommunity(createAdminClient(), slug.toLowerCase());
    if (c) return { title: `${c.name} · Community`, description: c.description || `${c.name} on OMdotfun`, openGraph: c.logo_src ? { images: [c.banner_src ?? c.logo_src] } : undefined };
  } catch { /* table absente avant migration */ }
  return { title: "Community" };
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CommunityView slug={slug.toLowerCase()} />;
}
