"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Camera, User } from "lucide-react";
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

// ── Upload avatar to Supabase Storage ────────────────────────────────────────

async function uploadAvatarToStorage(file: File, walletAddress: string): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${walletAddress}/avatar.${ext}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
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
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const wallet = user?.user_metadata?.wallet_address as string | undefined;
        if (wallet) {
          avatarSrc = await uploadAvatarToStorage(avatarFile, wallet);
        }
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

  return (
    // Backdrop — non-dismissible
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card shadow-xl overflow-y-auto max-h-[90vh]">
        <div className="p-6">
          {/* Header */}
          <div className="mb-5 text-center">
            <h2 className="text-lg font-bold text-foreground">Welcome to OMdotfun</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Set up your profile to get started.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Avatar */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="size-20 rounded-full overflow-hidden bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  {avatarPreview ? (
                    <Image src={avatarPreview} alt="preview" fill className="object-cover" unoptimized />
                  ) : (
                    <User className="size-8 text-orange-400" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-card bg-orange-500 shadow hover:bg-orange-400 transition-colors"
                >
                  <Camera className="size-3.5 text-white" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground -mt-1">
              Profile photo <span className="text-muted-foreground/60">(optional)</span>
            </p>

            {/* Username */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                autoFocus
                autoComplete="off"
                placeholder="e.g. crypto_whale"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.trim());
                  setErrors((prev) => ({ ...prev, username: validateUsername(e.target.value.trim()) }));
                }}
                maxLength={30}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              {errors.username && <p className="mt-1 text-xs text-red-500">{errors.username}</p>}
            </div>

            {/* Display name */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Display name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                autoComplete="off"
                placeholder="e.g. Crypto Whale"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setErrors((prev) => ({ ...prev, displayName: validateDisplayName(e.target.value) }));
                }}
                maxLength={50}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              {errors.displayName && <p className="mt-1 text-xs text-red-500">{errors.displayName}</p>}
            </div>

            {/* Twitter / X */}
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Twitter / X handle <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="yourhandle"
                  value={twitter.replace(/^@/, "")}
                  onChange={(e) => {
                    const val = e.target.value.replace(/^@/, "");
                    setTwitter(val);
                    setErrors((prev) => ({ ...prev, twitter: validateTwitter(val) }));
                  }}
                  maxLength={15}
                  className="w-full rounded-xl border border-border bg-background pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              {errors.twitter && <p className="mt-1 text-xs text-red-500">{errors.twitter}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading || !canSubmit}
              className="w-full rounded-xl bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60 transition-colors"
            >
              {uploading ? "Uploading photo..." : saving ? "Saving..." : "Complete setup"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
