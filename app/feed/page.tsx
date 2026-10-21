import type { Metadata } from "next";
import { Suspense } from "react";
import { FeedClient } from "@/components/social/feed-client";

export const metadata: Metadata = { title: "Feed", description: "Posts from the OMdotfun community." };

export default function FeedPage() {
  return <Suspense fallback={null}><FeedClient /></Suspense>;
}
