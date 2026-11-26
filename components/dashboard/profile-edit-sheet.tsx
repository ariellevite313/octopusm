"use client";

/**
 * Modification du profil, ouverte en touchant sa photo ou son nom dans le wallet :
 * changer la photo (on touche la photo), le nom affiché, le nom d'utilisateur et le compte X,
 * puis le niveau, l'Omero Map et les animations. Reprend aussi les liens de l'ancien panneau « Mon wallet ».
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { Mirage } from "@/components/shared/mirage";
import { LevelsPanel } from "@/components/profile/levels-sheet";
import { getDrawerStats, getWalletProfile, updateWalletProfile, uploadAvatar } from "@/services/wallet-service";

const field = "h-12 w-full rounded-2xl bg-muted/60 px-4 text-[15px] outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/15";

export function ProfileEditSheet({ wallet, open, onClose }: { wallet: string; open: boolean; onClose: () => void }) {
  const { tr } = useT();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const file = useRef<HTMLInputElement>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [display, setDisplay] = useState("");
  const [xh, setXh] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    getWalletProfile(wallet).then((p) => {
      setAvatar(p?.avatar_src ?? null);
      setUsername(p?.username ?? "");
      setDisplay(p?.display_name ?? "");
      setXh(p?.twitter_handle ?? "");
      setLoaded(true);
    });
    getDrawerStats().then((s) => setRef(s.referral_code ?? null));
  }, [open, wallet]);

  if (!open || typeof document === "undefined") return null;

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setUploading(true);
    const r = await uploadAvatar(f, wallet);
    setUploading(false);
    if ("error" in r) { toast.error(tr(r.error)); return; }
    setAvatar(r.url);
    toast.success(tr("Avatar updated"));
    router.refresh();
  }

  async function save() {
    setSaving(true);
    const r = await updateWalletProfile(wallet, { username: username.trim() || undefined, display_name: display.trim() || undefined, twitter_handle: xh.trim() || undefined });
    setSaving(false);
    if (r.error) { toast.error(tr(r.error)); return; }
    toast.success(tr("Profile updated"));
    router.refresh();
  }

  async function invite() {
    if (!ref) return;
    await navigator.clipboard.writeText(`${window.location.origin}/?ref=${ref}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const row = "flex h-12 items-center justify-between rounded-2xl bg-muted/60 px-4 text-[15px] font-semibold transition-colors hover:bg-muted";

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-md overflow-y-auto scrollbar-none rounded-t-[28px] border-t border-border bg-background px-4 pb-8 pt-3 md:rounded-[28px] md:border">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[18px] font-bold">{tr("Edit profile")}</span>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </div>

        {!loaded ? <div className="flex justify-center py-12"><Mirage className="size-5 text-muted-foreground" /></div> : (
          <>
            {/* Photo : on la touche pour la changer */}
            <div className="flex flex-col items-center">
              <button type="button" onClick={() => file.current?.click()} disabled={uploading} aria-label={tr("Change photo")} className="relative rounded-full disabled:opacity-60">
                {avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatar} alt="" className="size-24 rounded-full object-cover" />
                  // eslint-disable-next-line @next/next/no-img-element
                  : <img src="/omdot-icon.png" alt="" className="size-24 rounded-full bg-muted object-cover p-3" />}
                {uploading && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40"><Mirage className="size-5 text-white" /></span>}
              </button>
              <button type="button" onClick={() => file.current?.click()} disabled={uploading} className="mt-2 text-[14px] font-bold text-foreground">{tr("Change photo")}</button>
              <input ref={file} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            </div>

            {/* Noms et compte X */}
            <div className="mt-5 space-y-3">
              <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Display name")}</span>
                <input value={display} onChange={(e) => setDisplay(e.target.value)} placeholder={tr("Display name")} className={field} /></label>
              <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Username")}</span>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@username" className={field} /></label>
              <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Twitter / X handle")}</span>
                <input value={xh} onChange={(e) => setXh(e.target.value)} placeholder="@yourhandle" className={field} /></label>
              <button onClick={save} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[15px] font-bold text-background disabled:opacity-60">
                {saving && <Mirage className="size-4" />}{tr("Save")}
              </button>
            </div>

            {/* Niveau, Omero Map et animations */}
            <p className="mb-3 mt-7 text-[16px] font-bold">{tr("Levels")}</p>
            <LevelsPanel wallet={wallet} avatar={avatar} />

            {/* Liens de l'ancien panneau « Mon wallet » */}
            <div className="mt-7 space-y-2">
              <Link href={`/profile/${wallet}`} onClick={onClose} className={row}>{tr("My profile")}</Link>
              <button onClick={invite} disabled={!ref} className={`${row} w-full disabled:opacity-50`}>{copied ? tr("Copied!") : tr("Invite")}</button>
              <Link href="/dashboard/pools" onClick={onClose} className={row}>{tr("Create a market")}</Link>
              {isAdmin && <Link href="/admin" onClick={onClose} className={row}>{tr("Admin Panel")}</Link>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
