import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/social/posts";
import { PostView } from "@/components/social/post-view";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_RE.test(id)) return { title: "Post" };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data: p } = await admin.from("posts").select("body, images, author, hidden").eq("id", id).maybeSingle();
    if (!p || p.hidden) return { title: "Post" };
    const { data: w } = await admin.from("wallets").select("username, display_name").eq("address", p.author).maybeSingle();
    const name = w?.display_name ?? w?.username ?? `${String(p.author).slice(0, 4)}…${String(p.author).slice(-4)}`;
    const text = String(p.body ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
    return {
      title: `${name} on OMdotfun`,
      description: text || "Post on OMdotfun",
      openGraph: { title: `${name} on OMdotfun`, description: text },
      twitter: { card: "summary_large_image" },
    };
  } catch { return { title: "Post" }; }
}

export default async function PostPage({ params }: Props) {
  const { id } = await params;
  return <PostView id={id} />;
}
