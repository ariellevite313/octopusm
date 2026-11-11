"use client";

/** Statistiques d'un post : qui a envoyé des OMERO (onglet Tips) et qui a liké (onglet Likes). */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { Heart, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { shortAddress } from "@/lib/format";
import { OmeroHeadIcon } from "@/components/shared/omero-head-icon";

type Person = { wallet: string; name: string | null; avatar: string | null; amount?: number };

export function SupportersSheet({ postId, initialTab = "tips", onClose }: { postId: string; initialTab?: "tips" | "likes"; onClose: () => void }) {
  const { tr } = useT();
  const [tab, setTab] = useState<"tips" | "likes">(initialTab);
  const [data, setData] = useState<Record<string, { people: Person[]; total?: number; supporters?: number } | undefined>>({});
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (data[tab]) return;
    let off = false;
    fetch(`/api/posts/${postId}/supporters?tab=${tab}`, { cache: "no-store" }).then((r) => r.json())
      .then((j) => { if (!off) setData((d) => ({ ...d, [tab]: { people: j.people ?? [], total: j.total, supporters: j.supporters } })); })
      .catch(() => { if (!off) setData((d) => ({ ...d, [tab]: { people: [] } })); });
    return () => { off = true; };
  }, [tab, postId, data]);

  const cur = data[tab];
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-[28px] border-t border-border bg-card px-5 pb-6 pt-2 text-foreground shadow-2xl">
        <button onClick={onClose} aria-label={tr("Close")} className="mx-auto mb-3 flex h-6 w-full shrink-0 items-center justify-center">
          <span className="h-1.5 w-11 rounded-full bg-muted-foreground/30" />
        </button>
        <p className="text-lg font-bold">{tr("Post activity")}</p>
        <p className="text-[13px] text-muted-foreground">{tr("Who supported this post")}</p>

        <div className="my-3 grid shrink-0 grid-cols-2 gap-1 rounded-2xl bg-muted p-1">
          {(["tips", "likes"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold ${tab === t ? "bg-background text-foreground" : "text-muted-foreground"}`}>
              {t === "tips" ? <OmeroHeadIcon filled className="size-4" /> : <Heart className="size-4" />}
              {t === "tips" ? tr("Tips") : tr("Likes")}
            </button>
          ))}
        </div>

        {tab === "tips" && cur && (
          <div className="mb-2 grid shrink-0 grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{tr("OMERO received")}</p>
              <p className="flex items-center gap-1.5 text-lg font-extrabold">
                <Image src="/octo-coin.png" alt="" width={18} height={18} className="size-[18px] rounded-full object-cover" unoptimized />
                {(cur.total ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{tr("Supporters")}</p>
              <p className="text-lg font-extrabold">{(cur.supporters ?? 0).toLocaleString()}</p>
            </div>
          </div>
        )}

        <div className="min-h-[120px] overflow-y-auto">
          {!cur ? (
            <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : cur.people.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{tab === "tips" ? tr("No tips yet. Be the first.") : tr("No likes yet.")}</p>
          ) : (
            <ul>
              {cur.people.map((p, i) => (
                <li key={p.wallet} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
                  {tab === "tips" && <span className="num w-5 shrink-0 text-[13px] font-bold text-muted-foreground">{i + 1}</span>}
                  <Link href={`/profile/${p.wallet}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
                    {p.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatar} alt="" className="size-9 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold">{(p.name ?? p.wallet)[0]?.toUpperCase()}</span>
                    )}
                    <span className="truncate text-sm font-bold">{p.name ?? shortAddress(p.wallet)}</span>
                  </Link>
                  {tab === "tips" && (
                    <span className="flex shrink-0 items-center gap-1.5 text-sm font-extrabold">
                      <Image src="/octo-coin.png" alt="" width={18} height={18} className="size-[18px] rounded-full object-cover" unoptimized />
                      <span className="num">{(p.amount ?? 0).toLocaleString()}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
