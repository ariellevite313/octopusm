import type { Metadata } from "next";
import { FeedClient } from "@/components/social/feed-client";

export const metadata: Metadata = { title: "Feed", description: "Posts from the OMdotfun community." };

export default function FeedPage() {
  return <FeedClient />;
}
