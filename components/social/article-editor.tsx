"use client";

/**
 * Écriture d'un article, sur le modèle de l'éditeur d'articles de X : barre du haut (brouillon, publier),
 * barre de mise en forme, couverture 5:2, titre, auteur, texte en direct (ce qu'on voit est ce qui sera publié).
 * Le brouillon est gardé sur l'appareil pendant l'écriture.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Bold, ChevronDown, ImagePlus, Italic, Link2, List, ListOrdered, Loader2, MoreHorizontal, Quote, Strikethrough, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { getWalletProfile } from "@/services/wallet-service";
import { shortAddress } from "@/lib/format";
import { ARTICLE_MAX_CHARS, ARTICLE_MIN_CHARS, ARTICLE_TITLE_MAX } from "@/lib/social/article";
import { domToArticle, type MiniNode } from "@/lib/social/article-dom";

async function upload(file: File): Promise<string> {
  const f = new FormData();
  f.append("image", file);
  const r = await fetch("/api/articles/image", { method: "POST", body: f });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.error ?? "Upload failed, try again");
  return j.url as string;
}

type Draft = { title: string; cover: string | null; html: string; saved: number };
const draftKey = (w: string) => `om_article_draft:${w}`;
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function ArticleEditor() {
  const { tr } = useT();
  const router = useRouter();
  const { isAuthenticated, walletAddress } = useAuth();
  const { data: me } = useQuery({
    queryKey: ["wallet-profile", walletAddress],
    queryFn: () => getWalletProfile(walletAddress!),
    enabled: !!walletAddress, staleTime: 60_000,
  });
  const [title, setTitle] = useState("");
  const [cover, setCover] = useState<string | null>(null);
  const [words, setWords] = useState(0);
  const [empty, setEmpty] = useState(true);
  const [saved, setSaved] = useState<number | null>(null);
  const [block, setBlock] = useState<"p" | "h2" | "h3">("p");
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<null | "cover" | "image" | "publish">(null);
  const editor = useRef<HTMLDivElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  // Reprise du brouillon de cet appareil
  useEffect(() => {
    if (!walletAddress || loaded.current) return;
    loaded.current = true;
    try {
      const d = JSON.parse(localStorage.getItem(draftKey(walletAddress)) ?? "null") as Draft | null;
      if (d) {
        setTitle(d.title ?? ""); setCover(d.cover ?? null); setSaved(d.saved ?? null);
        if (editor.current) { editor.current.innerHTML = d.html ?? ""; refresh(); }
      }
    } catch { /* pas de brouillon lisible */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress]);

  function save(next?: Partial<Draft>) {
    if (!walletAddress) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const d: Draft = { title: next?.title ?? title, cover: next?.cover !== undefined ? next.cover : cover, html: editor.current?.innerHTML ?? "", saved: Date.now() };
      try { localStorage.setItem(draftKey(walletAddress), JSON.stringify(d)); setSaved(d.saved); } catch { /* stockage indisponible */ }
    }, 700);
  }

  function refresh() {
    const el = editor.current;
    if (!el) return;
    const txt = el.innerText.trim();
    setWords(txt ? txt.split(/\s+/).length : 0);
    setEmpty(!txt && !el.querySelector("img"));
    const node = document.getSelection()?.anchorNode;
    const blockEl = (node?.nodeType === 3 ? node.parentElement : (node as HTMLElement | null))?.closest?.("h2,h3,p,div,blockquote,li");
    setBlock(blockEl?.tagName === "H2" ? "h2" : blockEl?.tagName === "H3" ? "h3" : "p");
  }

  function cmd(name: string, value?: string) {
    editor.current?.focus();
    document.execCommand(name, false, value);
    refresh(); save();
  }
  const setBlockType = (b: "p" | "h2" | "h3") => cmd("formatBlock", b === "p" ? "<p>" : `<${b}>`);

  function link() {
    const url = window.prompt(tr("Link address (https://…)"), "https://");
    if (!url) return;
    if (!/^https:\/\/[^\s]+$/i.test(url.trim())) { toast.error(tr("Links must start with https://")); return; }
    cmd("createLink", url.trim());
  }

  async function pick(kind: "cover" | "image", file: File | undefined) {
    if (!file) return;
    setBusy(kind);
    try {
      const url = await upload(file);
      if (kind === "cover") { setCover(url); save({ cover: url }); }
      else cmd("insertHTML", `<figure><img src="${escAttr(url)}" alt=""></figure><p><br></p>`);
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Upload failed, try again")); }
    finally { setBusy(null); }
  }

  function clearDraft() {
    setMenu(false);
    if (!window.confirm(tr("Delete this draft?"))) return;
    try { if (walletAddress) localStorage.removeItem(draftKey(walletAddress)); } catch { /* ignore */ }
    setTitle(""); setCover(null); setSaved(null);
    if (editor.current) editor.current.innerHTML = "";
    refresh();
  }

  async function publish() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    const md = editor.current ? domToArticle(editor.current as unknown as MiniNode) : "";
    if (md.length < ARTICLE_MIN_CHARS) { toast.error(tr("The article needs at least 50 characters")); return; }
    if (md.length > ARTICLE_MAX_CHARS) { toast.error(tr("Max 20,000 characters")); return; }
    setBusy("publish");
    try {
      const r = await fetch("/api/articles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, cover_url: cover, body: md }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(j.error ?? "Could not publish the article");
      try { if (walletAddress) localStorage.removeItem(draftKey(walletAddress)); } catch { /* ignore */ }
      toast.success(tr("Article published"));
      router.push(`/article/${j.id}`);
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Could not publish the article")); setBusy(null); }
  }

  const name = me?.display_name || me?.username || (walletAddress ? shortAddress(walletAddress) : "");
  const handle = me?.username ? `@${me.username}` : walletAddress ? shortAddress(walletAddress) : "";
  const avatar = me?.avatar_src ?? null;
  const ready = title.trim().length >= 3 && !empty && !busy;
  const tb = "flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-muted";
  const keep = (e: React.MouseEvent) => e.preventDefault(); // garde la sélection du texte en cliquant sur la barre
  const Avatar = ({ size }: { size: number }) => avatar
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={avatar} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
    : <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{name[0]?.toUpperCase()}</span>;

  return (
    <div className="mx-auto max-w-2xl pb-40 lg:border-x lg:border-border">
      {/* Barre du haut + barre de mise en forme */}
      <div className="sticky top-16 z-20 border-b border-border bg-background/95 backdrop-blur lg:top-0">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <button onClick={() => router.back()} aria-label={tr("Back")} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-muted"><ArrowLeft className="size-5" /></button>
          <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-[13px] font-bold text-foreground">{tr("Draft")}</span>
          <span className="min-w-0 truncate text-[13px] text-muted-foreground">
            {saved ? `· ${tr("Saved {time}", { time: new Date(saved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}` : ""}
          </span>
          <button onClick={publish} disabled={!ready}
            className="ml-auto flex h-9 shrink-0 items-center gap-2 rounded-full bg-foreground px-4 text-[14px] font-bold text-background disabled:opacity-40">
            {busy === "publish" && <Loader2 className="size-4 animate-spin" />}{tr("Publish")}
          </button>
          <div className="relative shrink-0">
            <button onClick={() => setMenu((v) => !v)} aria-label={tr("More")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><MoreHorizontal className="size-5" /></button>
            {menu && (
              <div onMouseLeave={() => setMenu(false)} className="absolute right-0 top-10 z-30 w-48 rounded-2xl border border-border bg-card p-1.5 shadow-xl">
                <button onClick={clearDraft} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-down hover:bg-muted"><Trash2 className="size-4" />{tr("Delete draft")}</button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0.5 overflow-x-auto border-t border-border px-2 py-1.5 [scrollbar-width:none]">
          <button type="button" onMouseDown={keep} onClick={() => cmd("bold")} aria-label={tr("Bold")} className={tb}><Bold className="size-[18px]" strokeWidth={2.6} /></button>
          <button type="button" onMouseDown={keep} onClick={() => cmd("italic")} aria-label={tr("Italic")} className={tb}><Italic className="size-[18px]" /></button>
          <button type="button" onMouseDown={keep} onClick={() => cmd("strikeThrough")} aria-label={tr("Strikethrough")} className={tb}><Strikethrough className="size-[18px]" /></button>
          <label className="relative ml-1 flex h-9 shrink-0 items-center rounded-lg px-2 text-[15px] text-foreground hover:bg-muted">
            <select value={block} onMouseDown={(e) => e.stopPropagation()} onChange={(e) => setBlockType(e.target.value as "p" | "h2" | "h3")}
              className="cursor-pointer appearance-none bg-transparent pr-6 outline-none" aria-label={tr("Text style")}>
              <option value="p">{tr("Text")}</option>
              <option value="h2">{tr("Heading")}</option>
              <option value="h3">{tr("Subheading")}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 size-4" />
          </label>
          <span className="mx-1 h-6 w-px shrink-0 bg-border" />
          <button type="button" onMouseDown={keep} onClick={() => cmd("formatBlock", "<blockquote>")} aria-label={tr("Quote")} className={tb}><Quote className="size-[18px]" /></button>
          <button type="button" onMouseDown={keep} onClick={() => cmd("insertUnorderedList")} aria-label={tr("List")} className={tb}><List className="size-[18px]" /></button>
          <button type="button" onMouseDown={keep} onClick={() => cmd("insertOrderedList")} aria-label={tr("Numbered list")} className={tb}><ListOrdered className="size-[18px]" /></button>
          <button type="button" onMouseDown={keep} onClick={link} aria-label={tr("Link")} className={tb}><Link2 className="size-[18px]" /></button>
          <button type="button" onMouseDown={keep} onClick={() => imageInput.current?.click()} aria-label={tr("Image")} className={tb}>
            {busy === "image" ? <Loader2 className="size-[18px] animate-spin" /> : <ImagePlus className="size-[18px]" />}
          </button>
          <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { pick("image", e.target.files?.[0]); e.target.value = ""; }} />
          <span className="mx-1 h-6 w-px shrink-0 bg-border" />
          <span className="ml-auto shrink-0 pl-2 pr-1 text-[14px] text-muted-foreground">{tr(words === 1 ? "{n} word" : "{n} words", { n: words })}</span>
        </div>
      </div>

      {/* Couverture 5:2 */}
      <div className="relative">
        {cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" className="aspect-[5/2] w-full bg-muted object-cover" />
            <button onClick={() => { setCover(null); save({ cover: null }); }} aria-label={tr("Remove")} className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full bg-black/60 text-white"><X className="size-4" /></button>
          </>
        ) : (
          <button onClick={() => coverInput.current?.click()} className="flex aspect-[5/2] w-full flex-col items-center justify-center gap-3 bg-muted/70 px-6 text-center text-muted-foreground hover:bg-muted">
            <span className="flex size-14 items-center justify-center rounded-full bg-background/70 text-foreground">
              {busy === "cover" ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
            </span>
            <span className="text-[14px]">{tr("We recommend a 5:2 image for the best result.")}</span>
          </button>
        )}
        <input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(e) => { pick("cover", e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      <div className="px-5 pt-7 md:px-8">
        <textarea value={title} rows={1}
          onChange={(e) => { const v = e.target.value.replace(/\n/g, " ").slice(0, ARTICLE_TITLE_MAX); setTitle(v); save({ title: v }); e.currentTarget.style.height = "auto"; e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`; }}
          placeholder={tr("Add a title")}
          className="w-full resize-none overflow-hidden bg-transparent text-[34px] font-extrabold leading-[1.15] tracking-tight outline-none placeholder:text-muted-foreground/70" />

        <div className="mb-6 mt-4 flex items-center gap-2.5">
          <Avatar size={34} />
          <span className="truncate text-[16px] font-bold">{name}</span>
          <span className="truncate text-[15px] text-muted-foreground">{handle}</span>
        </div>

        <div className="relative">
          {empty && <p className="pointer-events-none absolute left-0 top-0 text-[18px] text-muted-foreground/70">{tr("Start writing")}</p>}
          <div
            ref={editor}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={tr("Start writing")}
            onInput={() => { refresh(); save(); }}
            onKeyUp={refresh}
            onMouseUp={refresh}
            onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
            className="min-h-[45vh] text-[18px] leading-[1.7] outline-none [&_blockquote]:my-4 [&_blockquote]:border-l-4 [&_blockquote]:border-[#a3e635] [&_blockquote]:pl-4 [&_blockquote]:italic [&_figure]:my-5 [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-[24px] [&_h2]:font-extrabold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-[20px] [&_h3]:font-bold [&_img]:w-full [&_img]:rounded-2xl [&_li]:mb-1 [&_ol]:ml-6 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:ml-6 [&_ul]:list-disc [&_a]:underline"
          />
        </div>

        {/* Auteur, en bas comme sur la page publiée */}
        <div className="mt-14 border-t border-border pt-8">
          <div className="flex items-center gap-3">
            <Avatar size={52} />
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold">{name}</p>
              <p className="truncate text-[15px] text-muted-foreground">{handle}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
