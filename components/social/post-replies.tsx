"use client";

import { TokenPill } from "./token-pill";
import type { FeaturedToken } from "@/lib/social/featured-token";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";

type Reply = { id: string; author: string; author_name: string | null; author_avatar: string | null; author_token?: FeaturedToken | null; body: string; created_at: string };

export function PostReplies({ postId, onCount }: { postId: string; onCount: (n: number) => void }) {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [list, setList] = useState<Reply[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const load = () =>
    fetch(`/api/posts/${postId}/replies`).then((r) => r.json()).then((j) => { setList(j.replies ?? []); onCount((j.replies ?? []).length); }).catch(() => setList([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [postId]);

  async function send() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    if (!text.trim()) return;
    setSending(true);
    const r = await fetch(`/api/posts/${postId}/replies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text }) });
    setSending(false);
    if (r.ok) { setText(""); load(); } else toast.error(tr((await r.json().catch(() => ({}))).error ?? "Something went wrong"));
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border px-1 pt-3">
      {list === null && <div className="h-10 animate-pulse rounded-xl bg-muted/30" />}
      {list?.map((r) => (
        <div key={r.id} className="flex gap-2.5">
          {r.author_avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.author_avatar} alt="" className="size-8 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{(r.author_name ?? r.author)[0]?.toUpperCase()}</div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Link href={`/profile/${r.author}`} className="text-[13px] font-bold text-foreground">{r.author_name ?? shortAddress(r.author)}</Link>
              <TokenPill token={r.author_token} size={13} />
            </div>
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">{r.body}</p>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          maxLength={1000}
          placeholder={tr("Write a reply")}
          className="min-w-0 flex-1 rounded-full border border-border bg-transparent px-4 py-2 text-sm outline-none focus:border-foreground/40"
        />
        <button onClick={send} disabled={sending || !text.trim()} aria-label={tr("Send")} className="flex size-9 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40">
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}
