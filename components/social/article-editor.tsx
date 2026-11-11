"use client";

/** Écriture d'un article : titre, couverture, texte avec une petite barre de mise en forme, aperçu, publication. */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bold, Heading2, Image as ImageIcon, Italic, Link2, List, ListOrdered, Loader2, Quote, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { ARTICLE_MAX_CHARS, ARTICLE_MIN_CHARS, ARTICLE_TITLE_MAX, readMinutes } from "@/lib/social/article";
import { ArticleBody } from "./article-body";
import { ArticleCover } from "./article-card";

async function upload(file: File): Promise<string> {
  const f = new FormData();
  f.append("image", file);
  const r = await fetch("/api/articles/image", { method: "POST", body: f });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error ?? "Upload failed, try again");
  return j.url as string;
}

export function ArticleEditor() {
  const { tr } = useT();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [title, setTitle] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [md, setMd] = useState("");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [busy, setBusy] = useState<null | "cover" | "image" | "publish">(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  /** Entoure la sélection (gras, italique, lien) ou ajoute un début de ligne (titre, liste, citation). */
  function apply(kind: "b" | "i" | "h" | "ul" | "ol" | "q" | "a", insert?: string) {
    const el = area.current;
    if (!el) return;
    const [s, e] = [el.selectionStart, el.selectionEnd];
    const sel = md.slice(s, e);
    let next = md, caret = e;
    if (insert !== undefined) {
      const piece = `${s > 0 && md[s - 1] !== "\n" ? "\n\n" : ""}${insert}\n\n`;
      next = md.slice(0, s) + piece + md.slice(e); caret = s + piece.length;
    } else if (kind === "b" || kind === "i") {
      const m = kind === "b" ? "**" : "*";
      const t = sel || tr("text");
      next = md.slice(0, s) + m + t + m + md.slice(e); caret = s + m.length + t.length + m.length;
    } else if (kind === "a") {
      const t = sel || tr("link");
      next = md.slice(0, s) + `[${t}](https://)` + md.slice(e); caret = s + t.length + 11;
    } else {
      const lineStart = md.lastIndexOf("\n", s - 1) + 1;
      const prefix = kind === "h" ? "## " : kind === "ul" ? "- " : kind === "ol" ? "1. " : "> ";
      next = md.slice(0, lineStart) + prefix + md.slice(lineStart); caret = e + prefix.length;
    }
    setMd(next.slice(0, ARTICLE_MAX_CHARS));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret); });
  }

  async function pick(kind: "cover" | "image", file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    try {
      const url = await upload(file);
      if (kind === "cover") setCover(url);
      else apply("b", `![](${url})`);
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Upload failed, try again")); }
    finally { setBusy(null); }
  }

  async function publish() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setBusy("publish");
    try {
      const r = await fetch("/api/articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, cover_url: cover, body: md }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(j.error ?? "Could not publish the article");
      toast.success(tr("Article published"));
      router.push(`/article/${j.id}`);
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Could not publish the article")); setBusy(null); }
  }

  const ready = title.trim().length >= 3 && md.trim().length >= ARTICLE_MIN_CHARS && !busy;
  const tool = "flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-muted";

  return (
    <div className="mx-auto max-w-2xl pb-40 lg:border-x lg:border-border">
      <div className="sticky top-16 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur lg:top-0">
        <button onClick={() => router.back()} aria-label={tr("Back")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><ArrowLeft className="size-5" /></button>
        <p className="flex-1 text-[16px] font-extrabold">{tr("Write an article")}</p>
        <button onClick={publish} disabled={!ready}
          className="flex h-9 items-center gap-2 rounded-full bg-foreground px-4 text-[14px] font-bold text-background disabled:opacity-40">
          {busy === "publish" && <Loader2 className="size-4 animate-spin" />}{tr("Publish")}
        </button>
      </div>

      {/* Couverture */}
      <div className="relative">
        {cover ? (
          <>
            <ArticleCover src={cover} className="aspect-[2.2/1]" />
            <button onClick={() => setCover(null)} aria-label={tr("Remove")} className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/60 text-white"><X className="size-4" /></button>
          </>
        ) : (
          <button onClick={() => coverInput.current?.click()} className="flex aspect-[2.2/1] w-full flex-col items-center justify-center gap-2 border-b border-border bg-muted/40 text-muted-foreground hover:bg-muted">
            {busy === "cover" ? <Loader2 className="size-6 animate-spin" /> : <ImageIcon className="size-7" />}
            <span className="text-[14px] font-semibold">{tr("Add a cover image")}</span>
            <span className="text-[12px]">{tr("JPG, PNG, WEBP or GIF, 5 MB max")}</span>
          </button>
        )}
        <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { pick("cover", e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      <div className="px-4 pt-4 md:px-6">
        <textarea value={title} onChange={(e) => setTitle(e.target.value.replace(/\n/g, " ").slice(0, ARTICLE_TITLE_MAX))} rows={2}
          placeholder={tr("Title")} className="w-full resize-none bg-transparent text-[28px] font-extrabold leading-tight outline-none placeholder:text-muted-foreground/60" />

        <div className="mb-3 mt-2 grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
          {(["write", "preview"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-xl py-2 text-[14px] font-bold ${tab === t ? "bg-background text-foreground" : "text-muted-foreground"}`}>
              {t === "write" ? tr("Write") : tr("Preview")}
            </button>
          ))}
        </div>

        {tab === "write" ? (
          <>
            <div className="sticky top-[118px] z-10 -mx-1 mb-2 flex gap-1 overflow-x-auto rounded-xl border border-border bg-background/95 p-1 backdrop-blur [scrollbar-width:none] lg:top-[58px]">
              <button type="button" className={tool} onClick={() => apply("h")} aria-label={tr("Heading")}><Heading2 className="size-[18px]" /></button>
              <button type="button" className={tool} onClick={() => apply("b")} aria-label={tr("Bold")}><Bold className="size-[18px]" /></button>
              <button type="button" className={tool} onClick={() => apply("i")} aria-label={tr("Italic")}><Italic className="size-[18px]" /></button>
              <button type="button" className={tool} onClick={() => apply("ul")} aria-label={tr("List")}><List className="size-[18px]" /></button>
              <button type="button" className={tool} onClick={() => apply("ol")} aria-label={tr("Numbered list")}><ListOrdered className="size-[18px]" /></button>
              <button type="button" className={tool} onClick={() => apply("q")} aria-label={tr("Quote")}><Quote className="size-[18px]" /></button>
              <button type="button" className={tool} onClick={() => apply("a")} aria-label={tr("Link")}><Link2 className="size-[18px]" /></button>
              <button type="button" className={tool} onClick={() => imageInput.current?.click()} aria-label={tr("Image")}>
                {busy === "image" ? <Loader2 className="size-[18px] animate-spin" /> : <ImageIcon className="size-[18px]" />}
              </button>
              <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { pick("image", e.target.files?.[0]); e.target.value = ""; }} />
            </div>
            <textarea ref={area} value={md} onChange={(e) => setMd(e.target.value.slice(0, ARTICLE_MAX_CHARS))}
              placeholder={tr("Write your article…")}
              className="min-h-[50vh] w-full resize-y bg-transparent text-[17px] leading-[1.68] outline-none placeholder:text-muted-foreground/60" />
          </>
        ) : (
          <div className="min-h-[50vh]">
            {md.trim() ? <ArticleBody md={md} /> : <p className="py-10 text-center text-muted-foreground">{tr("Nothing to preview yet.")}</p>}
          </div>
        )}

        <p className="mt-3 flex justify-between text-[12px] text-muted-foreground">
          <span>{tr("{n} min read", { n: readMinutes(md || " ") })}</span>
          <span className="num">{md.length.toLocaleString()} / {ARTICLE_MAX_CHARS.toLocaleString()}</span>
        </p>
      </div>
    </div>
  );
}
