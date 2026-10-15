"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, User, AtSign, Check, ArrowRight, Loader2 } from "lucide-react";
import { AppIcon } from "@/components/shared/app-icon";
import Image from "next/image";

// ── Validation helpers ────────────────────────────────────────────────────────

function validateUsername(v: string) {
  if (!v.trim()) return "Username is required.";
  if (v.length < 3) return "At least 3 characters.";
  if (v.length > 30) return "Maximum 30 characters.";
  if (!/^[a-zA-Z0-9_]+$/.test(v)) return "Letters, numbers and underscores only.";
  return "";
}

function validateDisplayName(v: string) {
  if (!v.trim()) return "Display name is required.";
  if (v.length > 50) return "Maximum 50 characters.";
  return "";
}

function validateTwitter(v: string) {
  if (!v.trim()) return "Twitter / X handle is required.";
  const clean = v.replace(/^@/, "");
  if (!/^[a-zA-Z0-9_]{1,15}$/.test(clean)) return "Invalid handle (max 15 chars, letters/numbers/_).";
  return "";
}

// ── Upload avatar via server route (bypasses RLS) ────────────────────────────

async function uploadAvatarToStorage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });
  const data = await res.json() as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
  return data.url;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function UsernameSetupModal({ onSetupComplete }: { onSetupComplete?: () => void } = {}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [username, setUsername]         = useState("");
  const [displayName, setDisplayName]   = useState("");
  const [twitter, setTwitter]           = useState("");
  const [avatarFile, setAvatarFile]     = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [errors, setErrors] = useState({ username: "", displayName: "", twitter: "" });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ── Wallet address (needed for avatar upload path) ────────────────────────

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  function validate() {
    const next = {
      username: validateUsername(username),
      displayName: validateDisplayName(displayName),
      twitter: validateTwitter(twitter),
    };
    setErrors(next);
    return !next.username && !next.displayName && !next.twitter;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      // 1. Upload avatar if provided
      let avatarSrc: string | undefined;
      if (avatarFile) {
        setUploading(true);
        avatarSrc = await uploadAvatarToStorage(avatarFile);
        setUploading(false);
      }

      // 2. Save profile via server-side route (bypasses RLS)
      const payload: Record<string, string> = {
        username: username.trim(),
        display_name: displayName.trim(),
        twitter_handle: twitter.replace(/^@/, "").trim(),
      };
      if (avatarSrc) payload.avatar_src = avatarSrc;

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json() as { error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Failed to save profile.");
        return;
      }

      toast.success("Welcome! Your profile has been set up.");
      onSetupComplete?.();
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message ?? "Unexpected error.");
    } finally {
      setSaving(false);
      setUploading(false);
    }
  }

  const isLoading = saving || uploading;
  const canSubmit = username.length >= 3 && displayName.trim().length > 0 && twitter.trim().length > 0;

  const fields = [
    {
      key: "username" as const,
      label: "Username",
      icon: <AtSign className="size-[18px]" />,
      value: username,
      placeholder: "crypto_whale",
      maxLength: 30,
      autoFocus: true,
      ok: username.length >= 3 && !validateUsername(username),
      onChange: (v: string) => { const t = v.trim(); setUsername(t); setErrors(p => ({ ...p, username: validateUsername(t) })); },
    },
    {
      key: "displayName" as const,
      label: "Display name",
      icon: <User className="size-[18px]" />,
      value: displayName,
      placeholder: "Crypto Whale",
      maxLength: 50,
      ok: !!displayName.trim() && !validateDisplayName(displayName),
      onChange: (v: string) => { setDisplayName(v); setErrors(p => ({ ...p, displayName: validateDisplayName(v) })); },
    },
    {
      key: "twitter" as const,
      label: "X handle",
      icon: <AppIcon name="ti-brand-x" className="size-4" />,
      value: twitter.replace(/^@/, ""),
      placeholder: "yourhandle",
      maxLength: 15,
      prefix: "@",
      ok: !!twitter.trim() && !validateTwitter(twitter),
      onChange: (v: string) => { const t = v.replace(/^@/, ""); setTwitter(t); setErrors(p => ({ ...p, twitter: validateTwitter(t) })); },
    },
  ];
  const fieldError = fields.map(f => errors[f.key] && f.value ? errors[f.key] : "").find(Boolean);
  const initials = (displayName || username || "").replace(/^@/, "").slice(0, 2).toUpperCase();

  return (
    // Plein écran sur téléphone, fenêtre centrée sur ordinateur — non fermable
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-md sm:items-center sm:px-4">
      <div className="relative max-h-[100dvh] w-full overflow-y-auto rounded-t-[32px] bg-background shadow-2xl ring-1 ring-border sm:max-w-[420px] sm:rounded-[32px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(ellipse_at_top,rgba(255,122,26,0.28),transparent_70%)]" />

        <form onSubmit={handleSubmit} className="relative px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-7">
          {/* Marque */}
          <div className="flex items-center justify-center gap-2">
            <img src="/card-logo.png" alt="" className="size-7 rounded-full" />
            <span className="text-[15px] font-black tracking-tight text-foreground">omdot.fun</span>
          </div>

          {/* Avatar */}
          <div className="mt-7 flex flex-col items-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative size-28 rounded-full p-[3px]"
              aria-label="Add a profile photo"
            >
              <span className="absolute inset-0 overflow-hidden rounded-full"><span className="gains-frame absolute inset-[-40%]" /></span>
              <span className="relative flex size-full items-center justify-center overflow-hidden rounded-full border-[3px] border-background bg-muted">
                {avatarPreview ? (
                  <Image src={avatarPreview} alt="preview" fill className="object-cover" unoptimized />
                ) : initials ? (
                  <span className="text-3xl font-bold text-foreground">{initials}</span>
                ) : (
                  <User className="size-10 text-muted-foreground" />
                )}
              </span>
              <span className="absolute bottom-0.5 right-0.5 flex size-9 items-center justify-center rounded-full bg-primary text-white shadow-lg ring-4 ring-background transition-transform group-hover:scale-105">
                <Camera className="size-4" />
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

            <h2 className="mt-5 text-[26px] font-bold tracking-tight text-foreground">Create your profile</h2>
            <p className="mt-1 text-center text-[15px] text-muted-foreground">This is how traders will see you on OMdot.</p>
          </div>

          {/* Champs */}
          <div className="mt-6">
            {fields.map(f => (
              <label
                key={f.key}
                className={`flex items-center gap-3.5 border-b border-border py-3.5 transition-colors focus-within:border-primary`}
              >
                <span className={`flex w-6 shrink-0 items-center justify-center ${f.ok ? "text-primary" : "text-muted-foreground"}`}>
                  {f.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</span>
                  <span className="flex items-center">
                    {f.prefix && <span className="text-[16px] text-muted-foreground">{f.prefix}</span>}
                    <input
                      type="text"
                      autoFocus={f.autoFocus}
                      autoComplete="off"
                      placeholder={f.placeholder}
                      value={f.value}
                      maxLength={f.maxLength}
                      onChange={e => f.onChange(e.target.value)}
                      className="w-full bg-transparent text-[16px] font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                    />
                  </span>
                </span>
                {f.ok && <Check className="size-5 shrink-0 text-up" strokeWidth={2.5} />}
              </label>
            ))}
          </div>
          <p className={`mt-2 min-h-[18px] px-1 text-[13px] ${fieldError ? "text-red-500" : "text-muted-foreground"}`}>
            {fieldError || "Profile photo is optional."}
          </p>

          <button
            type="submit"
            disabled={isLoading || !canSubmit}
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-bold text-white shadow-[0_10px_30px_-10px_rgba(255,122,26,0.8)] transition-all hover:brightness-105 disabled:opacity-40 disabled:shadow-none"
          >
            {isLoading
              ? <><Loader2 className="size-5 animate-spin" />{uploading ? "Uploading photo…" : "Saving…"}</>
              : <>Continue<ArrowRight className="size-5" /></>}
          </button>
        </form>
      </div>
    </div>
  );
}
