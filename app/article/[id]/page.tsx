import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { UUID_RE } from "@/lib/social/posts";
import { ArticleView } from "@/components/social/article-view";

type Props = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function load(id: string): Promise<{ id: string; author: string; title: string; cover_url: string | null; article_md: string; read_minutes: number | null; body: string; created_at: string } | null> {
  if (!UUID_RE.test(id)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    const { data } = await admin.from("posts")
      .select("id, author, title, cover_url, article_md, read_minutes, body, created_at, hidden, kind")
      .eq("id", id).maybeSingle();
    if (!data || data.hidden || data.kind !== "article") return null;
    return data;
  } catch { return null; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const a = await load((await params).id);
  if (!a) return { title: "Article" };
  const images = a.cover_url ? [a.cover_url] : [`/post/${a.id}/opengraph-image`];
  return {
    title: a.title,
    description: a.body.slice(0, 160),
    openGraph: { title: a.title, description: a.body.slice(0, 160), type: "article", images },
    twitter: { card: "summary_large_image", title: a.title, description: a.body.slice(0, 160), images },
  };
}

export default async function ArticlePage({ params }: Props) {
  const a = await load((await params).id);
  if (!a) notFound();
  return <ArticleView id={a.id} title={a.title} cover={a.cover_url} md={a.article_md} minutes={a.read_minutes ?? 1} />;
}
