"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Pencil, X, Upload, Globe, Twitter, MessageCircle, Hash, ExternalLink } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";

const CATEGORIES    = ["Meme","Utility","AI","Gaming","DeFi","NFT","x402"];
const VALID_TYPES   = ["image/jpeg","image/png","image/webp","image/gif"];

function isValidUrl(s: string) {
  if (!s) return true; // optional
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:"; }
  catch { return false; }
}

type TokenData = {
  id: string;
  creator_wallet: string;
  name: string;
  ticker: string;
  description: string | null;
  category: string;
  logo_url: string | null;
  whitepaper_url: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  other_social: string | null;
  status: string;
};

type Props = {
  token: TokenData;
  onSaved?: () => void;
};

export function EditTokenButton({ token, onSaved }: Props) {
  const { walletAddress } = useAuth();
  const [open, setOpen]       = useState(false);
  const [saving, setSaving]   = useState(false);

  // Form state
  const [name, setName]               = useState(token.name);
  const [ticker, setTicker]           = useState(token.ticker);
  const [description, setDescription] = useState(token.description ?? "");
  const [category, setCategory]       = useState(token.category);
  const [website, setWebsite]         = useState(token.website ?? "");
  const [twitter, setTwitter]         = useState(token.twitter ?? "");
  const [telegram, setTelegram]       = useState(token.telegram ?? "");
  const [discord, setDiscord]         = useState(token.discord ?? "");
  const [otherSocial, setOtherSocial] = useState(token.other_social ?? "");
  const [logoFile, setLogoFile]       = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(token.logo_url);
  const [pdfFile, setPdfFile]         = useState<File | null>(null);
  const [errors, setErrors]           = useState<Record<string, string>>({});

  const logoRef = useRef<HTMLInputElement>(null);
  const pdfRef  = useRef<HTMLInputElement>(null);

  // Only show button for the creator
  if (walletAddress !== token.creator_wallet) return null;
  if (token.status === "cancelled") return null;

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!VALID_TYPES.includes(file.type)) { toast.error("Unsupported format. Use PNG, JPG, WebP, or GIF"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Logo max 5 MB"); return; }
    if (logoPreview && logoPreview !== token.logo_url) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("PDF max 20 MB"); return; }
    setPdfFile(file);
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim())   errs.name = "Name is required";
    if (!ticker.trim()) errs.ticker = "Ticker is required";
    if (!isValidUrl(website))     errs.website = "Invalid URL";
    if (!isValidUrl(twitter))     errs.twitter = "Invalid URL";
    if (!isValidUrl(telegram))    errs.telegram = "Invalid URL";
    if (!isValidUrl(discord))     errs.discord = "Invalid URL";
    if (!isValidUrl(otherSocial)) errs.other_social = "Invalid URL";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    if (!walletAddress) { toast.error("Connect your wallet first"); return; }
    setSaving(true);
    try {
      const form = new FormData();
      if (logoFile) form.append("logo", logoFile);
      if (pdfFile)  form.append("whitepaper", pdfFile);
      form.append("payload", JSON.stringify({
        wallet_address: walletAddress,
        name: name.trim(),
        ticker: ticker.trim().toUpperCase(),
        description,
        category,
        website:      website || null,
        twitter:      twitter || null,
        telegram:     telegram || null,
        discord:      discord || null,
        other_social: otherSocial || null,
      }));

      const res  = await fetch(`/api/launchpad/${token.id}/edit`, { method: "PATCH", body: form });
      const json = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        toast.error(json.error ?? "Failed to save");
        return;
      }

      toast.success("Token updated!");
      setOpen(false);
      onSaved?.();
      // Hard reload to reflect server-side changes
      window.location.reload();
    } catch {
      toast.error("Unexpected error");
    } finally {
      setSaving(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletAddress, name, ticker, description, category, website, twitter, telegram, discord, otherSocial, logoFile, pdfFile]);

  return (
    <>
      {/* Edit button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Pencil className="size-3.5" /> Edit
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">

            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">Edit token</h2>
              <button type="button" onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">

              {/* Logo */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Logo</label>
                <div className="flex items-center gap-4">
                  <button type="button" onClick={() => logoRef.current?.click()}
                    className="relative flex size-16 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/30 hover:border-primary/50 transition-colors">
                    {logoPreview
                      ? <Image src={logoPreview} alt="Logo" fill className="object-cover" unoptimized />
                      : <Upload className="size-5 text-muted-foreground" />}
                  </button>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WebP, GIF — max 5 MB</p>
                </div>
                <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleLogo} />
              </div>

              {/* Name + Ticker */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Name *</label>
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground">Ticker *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <input value={ticker}
                      onChange={(e) => setTicker(e.target.value.toUpperCase().slice(0, 10))}
                      className="w-full rounded-xl border border-border bg-background pl-7 pr-3 py-2 text-sm uppercase focus:outline-none focus:ring-1 focus:ring-primary" />
                  </div>
                  {errors.ticker && <p className="mt-1 text-xs text-red-500">{errors.ticker}</p>}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <button key={cat} type="button" onClick={() => setCategory(cat)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        category === cat ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                  rows={3} maxLength={500}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary" />
                <p className="mt-0.5 text-right text-xs text-muted-foreground">{description.length}/500</p>
              </div>

              {/* Socials */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-foreground">Socials</label>
                {[
                  { icon: <Globe className="size-4" />,           key: "website",     val: website,     set: setWebsite,     ph: "https://yourtoken.com" },
                  { icon: <Twitter className="size-4" />,         key: "twitter",     val: twitter,     set: setTwitter,     ph: "https://x.com/yourtoken" },
                  { icon: <MessageCircle className="size-4" />,   key: "telegram",    val: telegram,    set: setTelegram,    ph: "https://t.me/yourtoken" },
                  { icon: <Hash className="size-4" />,            key: "discord",     val: discord,     set: setDiscord,     ph: "https://discord.gg/yourtoken" },
                  { icon: <ExternalLink className="size-4" />,    key: "other_social",val: otherSocial, set: setOtherSocial, ph: "https://…" },
                ].map(({ icon, key, val, set: setter, ph }) => (
                  <div key={key}>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{icon}</span>
                      <input value={val} onChange={(e) => setter(e.target.value)} placeholder={ph}
                        className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    {errors[key] && <p className="mt-0.5 text-xs text-red-500">{errors[key]}</p>}
                  </div>
                ))}
              </div>

              {/* Whitepaper */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Whitepaper <span className="text-muted-foreground font-normal">(optional, PDF)</span>
                </label>
                <button type="button" onClick={() => pdfRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground hover:border-primary/50 transition-colors">
                  <Upload className="size-4" />
                  {pdfFile ? pdfFile.name : token.whitepaper_url ? "Replace PDF" : "Upload PDF"}
                </button>
                <input ref={pdfRef} type="file" accept=".pdf" className="hidden" onChange={handlePdf} />
              </div>

            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-card px-5 py-4">
              <button type="button" onClick={() => setOpen(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity">
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
