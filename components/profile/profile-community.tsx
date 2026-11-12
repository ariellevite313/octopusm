"use client";

/** Profil : bio (modifiable par son propriétaire) et bloc « Communauté » épinglée, comme sur X. */
import { useState } from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { compactCount } from "@/lib/social/tips";
import { useIsMine } from "./profile-social";

export function ProfileBio({ wallet, bio: initial }: { wallet: string; bio: string | null }) {
  const { tr } = useT();
  const mine = useIsMine(wallet);
  const [bio, setBio] = useState(initial ?? "");
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(bio);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio: draft.trim() }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    setBio(draft.trim()); setEdit(false);
  }

  if (edit) return (
    <div className="mt-3">
      <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 160))} rows={3} autoFocus className="w-full resize-none rounded-2xl border border-border bg-transparent p-3 text-[15px] outline-none focus:border-foreground/40" placeholder={tr("Tell people who you are")} />
      <div className="mt-2 flex items-center gap-2">
        <span className="num text-xs text-muted-foreground">{draft.length}/160</span>
        <button onClick={() => setEdit(false)} className="ml-auto rounded-full border border-border px-4 py-1.5 text-[13px] font-bold">{tr("Cancel")}</button>
        <button onClick={save} disabled={busy} className="rounded-full bg-foreground px-4 py-1.5 text-[13px] font-bold text-background disabled:opacity-50">{tr("Save")}</button>
      </div>
    </div>
  );
  if (!bio && !mine) return null;
  return (
    <div className="mt-3 flex items-start gap-2">
      {bio ? <p className="whitespace-pre-line text-[15px] text-foreground">{bio}</p> : <p className="text-[15px] text-muted-foreground">{tr("Add a bio")}</p>}
      {mine && <button onClick={() => { setDraft(bio); setEdit(true); }} aria-label={tr("Edit bio")} className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>}
    </div>
  );
}

export type PinnedCommunity = { slug: string; name: string; logo_src: string | null; category: string; member_count: number; faces: string[] };

export function ProfileCommunity({ c }: { c: PinnedCommunity | null }) {
  const { tr } = useT();
  if (!c) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-[15px] font-bold text-foreground">{tr("Communities")}</p>
      <Link href={`/c/${c.slug}`} className="flex items-center gap-3 rounded-2xl border border-border p-3 hover:bg-muted/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.logo_src ? <img src={c.logo_src} alt="" className="size-16 shrink-0 rounded-2xl object-cover" /> : <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-muted text-xl font-bold">{c.name[0]?.toUpperCase()}</span>}
        <div className="min-w-0">
          <p className="truncate text-[16px] font-bold text-foreground">{c.name}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="flex -space-x-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {c.faces.slice(0, 4).map((f, i) => <img key={i} src={f} alt="" className="size-5 rounded-full border border-background object-cover" />)}
            </span>
            <span className="text-[13px]"><span className="font-bold text-foreground">{compactCount(c.member_count)}</span> <span className="text-muted-foreground">{c.member_count === 1 ? tr("Member") : tr("Members")}</span></span>
          </div>
        </div>
      </Link>
    </div>
  );
}
