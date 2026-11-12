"use client";

/** Création (100 OMERO) ou modification d'une communauté : nom, adresse, description, catégorie, hashtags, logo, bannière. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { COMMUNITY_CATEGORIES, COMMUNITY_COST_OMERO, type Community } from "@/lib/social/communities-shared";

const CAT_LABEL: Record<string, string> = {
  crypto: "Cryptocurrency", memecoins: "Memecoins", trading: "Trading", predictions: "Predictions", builders: "Builders",
  gaming: "Gaming", art: "Art", sports: "Sports", other: "Other",
};
export const categoryLabel = (c: string) => CAT_LABEL[c] ?? "Other";

export function CommunityForm({ onClose, edit = null, onSaved }: { onClose: () => void; edit?: Community | null; onSaved?: () => void }) {
  const { tr } = useT();
  const router = useRouter();
  const [name, setName] = useState(edit?.name ?? "");
  const [slug, setSlug] = useState(edit?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!edit);
  const [description, setDescription] = useState(edit?.description ?? "");
  const [category, setCategory] = useState(edit?.category ?? "crypto");
  const [tags, setTags] = useState((edit?.hashtags ?? []).map((t) => `#${t}`).join(" "));
  const [logo, setLogo] = useState<File | null>(null);
  const [banner, setBanner] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(edit?.logo_src ?? null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(edit?.banner_src ?? null);

  useEffect(() => { if (!slugTouched) setSlug(name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 30)); }, [name, slugTouched]);
  useEffect(() => { if (!logo) return; const u = URL.createObjectURL(logo); setLogoUrl(u); return () => URL.revokeObjectURL(u); }, [logo]);
  useEffect(() => { if (!banner) return; const u = URL.createObjectURL(banner); setBannerUrl(u); return () => URL.revokeObjectURL(u); }, [banner]);
  useEffect(() => { const p = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = p; }; }, []);

  const pick = (set: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) { toast.error(tr("Image too large (max 4 MB)")); return; }
    set(f);
  };

  async function submit() {
    setBusy(true);
    const fd = new FormData();
    fd.append("name", name.trim());
    if (!edit) fd.append("slug", slug);
    fd.append("description", description.trim());
    fd.append("category", category);
    fd.append("hashtags", tags);
    if (logo) fd.append("logo", logo);
    if (banner) fd.append("banner", banner);
    const r = await fetch(edit ? `/api/communities/${edit.slug}` : "/api/communities", { method: edit ? "PATCH" : "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    if (edit) { toast.success(tr("Saved")); onSaved?.(); onClose(); return; }
    toast.success(tr("Community created"));
    onClose();
    router.push(`/c/${j.slug}`);
  }

  const ok = name.trim().length >= 3 && /^[a-z0-9_]{3,30}$/.test(slug) && !busy;
  const input = "w-full rounded-2xl border border-border bg-transparent px-3.5 py-3 text-[15px] outline-none focus:border-foreground/40";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-border bg-card sm:rounded-[28px]">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold text-foreground">{edit ? tr("Edit community") : tr("Create a community")}</h2>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full hover:bg-muted"><X className="size-5" /></button>
        </div>

        {/* Bannière et logo */}
        <button type="button" onClick={() => bannerRef.current?.click()} className="relative mx-5 block h-28 w-[calc(100%-2.5rem)] overflow-hidden rounded-2xl bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {bannerUrl && <img src={bannerUrl} alt="" className="size-full object-cover" />}
          <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">{!bannerUrl && <><ImagePlus className="size-5" />{tr("Banner")}</>}</span>
        </button>
        <div className="-mt-8 px-8">
          <button type="button" onClick={() => logoRef.current?.click()} className="relative flex size-16 items-center justify-center overflow-hidden rounded-2xl border-4 border-card bg-muted text-muted-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt="" className="size-full object-cover" /> : <ImagePlus className="size-5" />}
          </button>
        </div>
        <input ref={bannerRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={pick(setBanner)} />
        <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={pick(setLogo)} />

        <div className="space-y-3 px-5 pb-5 pt-3">
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} placeholder={tr("Community name")} className={input} />
          {!edit && (
            <div className="flex items-center rounded-2xl border border-border px-3.5 text-[15px] focus-within:border-foreground/40">
              <span className="text-muted-foreground">omdot.fun/c/</span>
              <input value={slug} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30)); }} className="w-full bg-transparent py-3 outline-none" />
            </div>
          )}
          <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 500))} rows={3} placeholder={tr("What is this community about?")} className={`${input} resize-none`} />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={input}>
            {COMMUNITY_CATEGORIES.map((c) => <option key={c} value={c}>{tr(categoryLabel(c))}</option>)}
          </select>
          <input value={tags} onChange={(e) => setTags(e.target.value.slice(0, 200))} placeholder={tr("Hashtags, e.g. #OMdotfun #Solana")} className={input} />
          <button onClick={submit} disabled={!ok} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-bold text-background disabled:opacity-40">
            {busy && <Loader2 className="size-4 animate-spin" />}
            {edit ? tr("Save") : tr("Create for {n} OMERO", { n: COMMUNITY_COST_OMERO })}
          </button>
          {!edit && <p className="text-center text-xs text-muted-foreground">{tr("You become the admin. You can name moderators later.")}</p>}
        </div>
      </div>
    </div>
  );
}
