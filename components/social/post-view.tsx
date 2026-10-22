"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import type { FeedPost } from "@/lib/social/posts";
import { PostCard } from "./post-card";
import { PostReplies } from "./post-replies";

/** Page d'un seul post (lien de partage). */
export function PostView({ id }: { id: string }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    let off = false;
    fetch(`/api/posts/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { if (!off) { setPost(j.post); setState("ok"); } })
      .catch(() => { if (!off) setState("missing"); });
    return () => { off = true; };
  }, [id, isAuthenticated]);

  return (
    <div className="mx-auto max-w-xl pb-6 md:pb-0 lg:border-x lg:border-border">
      <div className="sticky top-16 z-10 lg:top-0 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Link href="/" aria-label={tr("Feed")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><ArrowLeft className="size-5" /></Link>
        <h1 className="text-lg font-extrabold">{tr("Post")}</h1>
      </div>
      {state === "loading" && <div className="flex justify-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>}
      {state === "missing" && <p className="py-16 text-center text-sm text-muted-foreground">{tr("This post is not available.")}</p>}
      {state === "ok" && post && (
        <>
          <PostCard post={post} onRemoved={() => setState("missing")} />
          <PostReplies postId={post.id} page onCount={() => {}} />
        </>
      )}
    </div>
  );
}
