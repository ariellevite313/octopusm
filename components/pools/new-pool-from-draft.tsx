"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { CreatePoolModal, type PoolDraft } from "./create-pool-modal";

/** Marché proposé par une IA : ouvre le formulaire normal prérempli. L'humain relit, paie les frais avec son wallet et crée le marché. */
export function NewPoolFromDraft({ id }: { id: string }) {
  const { tr } = useT();
  const router = useRouter();
  const [draft, setDraft] = useState<PoolDraft | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pools/draft/${id}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: await r.json().catch(() => ({})) }))
      .then(({ ok, j }) => {
        if (!ok) { setError(j.error ?? "Could not load the draft"); return; }
        const d = j.draft;
        // datetime-local en heure locale
        const dt = new Date(d.betting_closes_at);
        const pad = (n: number) => String(n).padStart(2, "0");
        setDraft({
          title: d.title, description: d.description, coverImage: d.cover_image, options: d.options, category: d.category, betToken: d.bet_token, matchKey: d.match_key ?? null,
          closesAt: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`,
        });
      })
      .catch(() => setError("Could not load the draft"));
  }, [id]);

  if (error) return <p className="py-24 text-center text-sm text-muted-foreground">{tr(error)}</p>;
  if (!draft) return <div className="flex justify-center py-24"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  return <CreatePoolModal initial={draft} onClose={() => router.push("/pools")} onCreated={(m) => router.push(`/pools/${m.slug ?? m.id}`)} />;
}
