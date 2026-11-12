import type { Metadata } from "next";
import { CommunityMembers } from "@/components/communities/community-members";

export const metadata: Metadata = { title: "Members" };

export default async function CommunityMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CommunityMembers slug={slug.toLowerCase()} />;
}
