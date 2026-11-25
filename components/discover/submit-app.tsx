"use client";

/**
 * Lister mon app sur Discover. Il faut un token lancé sur OM (on choisit lequel) et l'app doit accepter ce token comme paiement.
 * Site web, icône, bannière et jusqu'à 6 images explicatives.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { APP_CATEGORIES, APP_CATEGORY_LABEL, MAX_SCREENSHOTS, validateApp } from "@/lib/discover";
import { Mirage } from "@/components/shared/mirage";

type Tok = { id: string; ticker: string; name: string; logo_url: string | null; chain: string };
type Existing = { id: string; token_id: string; name: string; tagline: string; description: string; category: string; site_url: string; icon_url: string | null; banner_url: string | null; screenshots: string[]; payment_note: string };

async function upload(file: File): Promise<string> {
  const fd = new FormData(); fd.append("image", file);
  const r = await fetch("/api/discover/upload", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Upload failed");
  return j.url as string;
}

export function SubmitApp() {
  const { tr } = useT();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [toks, setToks] = useState<Tok[] | null>(null);
  const [apps, setApps] = useState<Existing[]>([]);
  const [f, setF] = useState({ tokenId: "", name: "", tagline: "", description: "", category: "tools", siteUrl: "", iconUrl: "", bannerUrl: "", paymentNote: "", acceptsToken: false });
  const [shots, setShots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetch("/api/discover/mine", { cache: "no-store" }).then((r) => r.json()).then((j) => { setToks(j.tokens ?? []); setApps(j.apps ?? []); if (j.tokens?.[0]) pick(j.tokens[0].id, j.apps ?? []); }).catch(() => setToks([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  function pick(tokenId: string, list = apps) {
    const e = list.find((x) => x.token_id === tokenId);
    if (e) {
      setF({ tokenId, name: e.name, tagline: e.tagline, description: e.description, category: e.category, siteUrl: e.site_url, iconUrl: e.icon_url ?? "", bannerUrl: e.banner_url ?? "", paymentNote: e.payment_note, acceptsToken: true });
      setShots(e.screenshots ?? []);
    } else setF((x) => ({ ...x, tokenId }));
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function onFile(kind: "icon" | "banner" | "shot", file?: File | null) {
    if (!file) return;
    setUp(kind);
    try {
      const url = await upload(file);
      if (kind === "icon") setF((x) => ({ ...x, iconUrl: url }));
      else if (kind === "banner") setF((x) => ({ ...x, bannerUrl: url }));
      else setShots((s) => [...s, url].slice(0, MAX_SCREENSHOTS));
    } catch (e) { toast.error(tr((e as Error).message)); }
    setUp(null);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...f, screenshots: shots };
    const v = validateApp(payload);
    if (!v.ok) { toast.error(tr(v.error)); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/discover/apps", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Could not save your app");
      toast.success(tr("Your app is live on Discover"));
      router.push(`/discover/${j.id}`);
    } catch (err) { toast.error(tr((err as Error).message)); }
    setBusy(false);
  }

  if (isLoading) return <div className="flex justify-center py-16"><Mirage className="size-5 text-muted-foreground" /></div>;
  if (!isAuthenticated) return (
    <div className="rounded-[28px] border border-border bg-card p-6 text-center">
      <p className="text-[18px] font-bold">{tr("List my app")}</p>
      <p className="mt-2 text-[14px] text-muted-foreground">{tr("Connect the wallet that launched your token.")}</p>
      <button onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className="mt-4 h-12 rounded-full bg-foreground px-6 text-[15px] font-bold text-background">{tr("Connect Wallet")}</button>
    </div>
  );
  if (toks === null) return <div className="flex justify-center py-16"><Mirage className="size-5 text-muted-foreground" /></div>;
  if (toks.length === 0) return (
    <div className="rounded-[28px] border border-border bg-card p-6 text-center">
      <p className="text-[18px] font-bold">{tr("Launch your token first")}</p>
      <p className="mx-auto mt-2 max-w-sm text-[14px] text-muted-foreground">{tr("Only apps with a token launched on OM can be listed. Your token will be the payment of your app, and every visitor will see it.")}</p>
      <Link href="/launchpad/create" className="mt-4 inline-flex h-12 items-center rounded-full bg-foreground px-6 text-[15px] font-bold text-background">{tr("Launch my token on OM")}</Link>
    </div>
  );

  const tok = toks.find((t) => t.id === f.tokenId);
  const input = "h-12 w-full rounded-2xl bg-muted px-4 text-[15px] text-foreground outline-none";
  const label = "mb-1.5 block text-[13px] font-semibold text-muted-foreground";
  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-[28px] font-bold">{tr("List my app")}</h1>
      <label className="block"><span className={label}>{tr("Your OM token")}</span>
        <select className={input} value={f.tokenId} onChange={(e) => pick(e.target.value)}>
          {toks.map((t) => <option key={t.id} value={t.id}>${t.ticker} · {t.name}</option>)}
        </select></label>
      <label className="block"><span className={label}>{tr("App name")}</span><input className={input} value={f.name} onChange={set("name")} maxLength={40} /></label>
      <label className="block"><span className={label}>{tr("Short description")}</span><input className={input} value={f.tagline} onChange={set("tagline")} maxLength={80} /></label>
      <label className="block"><span className={label}>{tr("About this app")}</span><textarea className={`${input} h-32 py-3`} value={f.description} onChange={set("description")} maxLength={2000} /></label>
      <label className="block"><span className={label}>{tr("Category")}</span>
        <select className={input} value={f.category} onChange={set("category")}>{APP_CATEGORIES.map((c) => <option key={c} value={c}>{tr(APP_CATEGORY_LABEL[c])}</option>)}</select></label>
      <label className="block"><span className={label}>{tr("Website (https)")}</span><input type="url" className={input} value={f.siteUrl} onChange={set("siteUrl")} placeholder="https://" /></label>

      <div className="grid grid-cols-[96px_1fr] gap-3">
        <label className="block"><span className={label}>{tr("Icon")}</span>
          <span className="relative flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-[22%] bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.iconUrl || tok?.logo_url ? <img src={f.iconUrl || tok?.logo_url || ""} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-muted-foreground" />}
            {up === "icon" && <span className="absolute inset-0 flex items-center justify-center bg-black/40"><Mirage className="size-5" /></span>}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onFile("icon", e.target.files?.[0])} />
          </span></label>
        <label className="block"><span className={label}>{tr("Banner (16:9)")}</span>
          <span className="relative flex aspect-[16/9] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {f.bannerUrl ? <img src={f.bannerUrl} alt="" className="size-full object-cover" /> : <ImagePlus className="size-6 text-muted-foreground" />}
            {up === "banner" && <span className="absolute inset-0 flex items-center justify-center bg-black/40"><Mirage className="size-5" /></span>}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onFile("banner", e.target.files?.[0])} />
          </span></label>
      </div>

      <div><span className={label}>{tr("Explanatory images (up to {n})", { n: MAX_SCREENSHOTS })}</span>
        <div className="-mx-4 flex gap-2.5 overflow-x-auto scrollbar-none px-4">
          {shots.map((s, i) => (
            <span key={s} className="relative h-40 shrink-0 overflow-hidden rounded-2xl bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s} alt="" className="h-full w-auto object-cover" />
              <button type="button" aria-label={tr("Remove")} onClick={() => setShots((x) => x.filter((_, k) => k !== i))} className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/70 text-white"><X className="size-4" /></button>
            </span>
          ))}
          {shots.length < MAX_SCREENSHOTS && (
            <label className="flex h-40 w-28 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border text-muted-foreground">
              {up === "shot" ? <Mirage className="size-5" /> : <ImagePlus className="size-6" />}<span className="text-[12px] font-semibold">{tr("Add")}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => onFile("shot", e.target.files?.[0])} />
            </label>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={f.acceptsToken} onChange={(e) => setF((x) => ({ ...x, acceptsToken: e.target.checked }))} className="mt-1 size-5" />
          <span className="text-[14px] font-semibold">{tr("My app accepts ${t} as payment", { t: tok?.ticker ?? "TOKEN" })}</span>
        </label>
        <input className={`${input} mt-3`} value={f.paymentNote} onChange={set("paymentNote")} maxLength={200} placeholder={tr("How is your token used to pay in your app?")} />
        <p className="mt-2 text-[12px] text-muted-foreground">{tr("This is shown to every visitor of your app page.")}</p>
      </div>

      <button type="submit" disabled={busy || !!up} className="flex h-12 w-full items-center justify-center rounded-full bg-foreground text-[16px] font-bold text-background disabled:opacity-50">
        {busy ? <Mirage className="size-5" /> : apps.some((x) => x.token_id === f.tokenId) ? tr("Update my app") : tr("Publish my app")}
      </button>
    </form>
  );
}
