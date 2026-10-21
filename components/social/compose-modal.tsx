"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import type { FeedPost } from "@/lib/social/posts";
import { MAX_BODY, MAX_IMAGES, MAX_IMAGE_BYTES, IMAGE_TYPES } from "@/lib/social/posts";

type Suggest = { wallet: string; username: string; name: string | null; avatar: string | null };

export function ComposeModal({ onClose, onPosted, initialBody = "" }: { onClose: () => void; onPosted: (p: FeedPost) => void; initialBody?: string }) {
  const { tr } = useT();
  const [body, setBody] = useState(initialBody);
  const [sug, setSug] = useState<Suggest[]>([]);
  const area = useRef<HTMLTextAreaElement>(null);

  // Suggestions @ : mot en cours de frappe qui commence par @
  function onType(v: string) {
    setBody(v.slice(0, MAX_BODY));
    const pos = area.current?.selectionStart ?? v.length;
    const m = v.slice(0, pos).match(/(?:^|\s)@([A-Za-z0-9_]{1,30})$/);
    if (!m) { setSug([]); return; }
    fetch(`/api/users/search?q=${encodeURIComponent(m[1])}`).then((r) => r.json()).then((j) => setSug(j.users ?? [])).catch(() => setSug([]));
  }
  function pickUser(u: Suggest) {
    const el = area.current;
    const pos = el?.selectionStart ?? body.length;
    const before = body.slice(0, pos).replace(/@([A-Za-z0-9_]{0,30})$/, `@${u.username} `);
    const next = (before + body.slice(pos)).slice(0, MAX_BODY);
    setBody(next);
    setSug([]);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  }
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const next = [...files];
    for (const f of Array.from(e.target.files ?? [])) {
      if (!IMAGE_TYPES.includes(f.type)) { toast.error(tr("Images only (JPG, PNG, WEBP, GIF). No video.")); continue; }
      if (f.size > MAX_IMAGE_BYTES) { toast.error(tr("Image too large (max 5 MB)")); continue; }
      if (next.length < MAX_IMAGES) next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    setSending(true);
    const fd = new FormData();
    fd.append("body", body.trim());
    files.forEach((f) => fd.append("images", f));
    const r = await fetch("/api/posts", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setSending(false);
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    onPosted(j.post as FeedPost);
    onClose();
  }

  const canPost = (body.trim().length > 0 || files.length > 0) && !sending;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-t-[28px] border border-border bg-card p-5 sm:rounded-[28px]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">{tr("New post")}</h2>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><X className="size-5" /></button>
        </div>
        <div className="relative">
        <textarea
          ref={area}
          value={body}
          onChange={(e) => onType(e.target.value)}
          rows={5}
          autoFocus
          placeholder={tr("Share something. Use $TICKER, #hashtag, @name or paste a market link.")}
          className="w-full resize-none rounded-2xl border border-border bg-transparent p-3 text-[15px] outline-none focus:border-foreground/40"
        />
        {sug.length > 0 && (
          <ul className="absolute inset-x-2 top-full z-10 mt-1 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
            {sug.map((u) => (
              <li key={u.wallet}>
                <button type="button" onClick={() => pickUser(u)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted">
                  {u.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatar} alt="" className="size-8 rounded-full object-cover" />
                  ) : <span className="size-8 rounded-full bg-muted" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">{u.name ?? u.username}</span>
                    <span className="block text-xs text-muted-foreground">@{u.username}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        </div>
        {previews.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {previews.map((u, i) => (
              <div key={u} className="relative overflow-hidden rounded-2xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" className="aspect-square w-full object-cover" />
                <button onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} aria-label={tr("Remove")} className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"><X className="size-4" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(",")} multiple className="hidden" onChange={pick} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={files.length >= MAX_IMAGES}
            aria-label={tr("Add image")}
            className="flex size-10 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted disabled:opacity-40"
          >
            <ImagePlus className="size-5" />
          </button>
          <span className="num ml-auto text-xs text-muted-foreground">{body.length}/{MAX_BODY}</span>
          <button onClick={submit} disabled={!canPost} className="flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-bold text-background disabled:opacity-40">
            {sending && <Loader2 className="size-4 animate-spin" />}{tr("Post")}
          </button>
        </div>
      </div>
    </div>
  );
}
