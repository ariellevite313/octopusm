"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n";
import type { BoardRow } from "@/lib/hackathon/leaderboard";
import { CATEGORY_LABEL, compact } from "./use-hackathon";

const GRADIENTS = [
  "linear-gradient(135deg,#0d3b66,#2a9d8f 55%,#0b1d3a)",
  "linear-gradient(135deg,#3b1d6e,#7a4bd1 55%,#1a0f3a)",
  "linear-gradient(135deg,#0b3a53,#3fa7d6 55%,#0a1f33)",
  "linear-gradient(135deg,#4a1d3a,#c2548a 55%,#25101c)",
  "linear-gradient(135deg,#3a2f0b,#c9a227 55%,#1d1705)",
  "linear-gradient(135deg,#1c3b1f,#58a55c 55%,#0e1d10)",
];
const hash = (s: string) => [...s].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Carte « dossier » d'un projet : logo du token, catégorie, holders, volume. */
export function ProjectCard({ row, description }: { row: BoardRow; description?: string }) {
  const { tr } = useT();
  const g = GRADIENTS[hash(row.projectId) % GRADIENTS.length];
  return (
    <Link href={row.mint ? `/launchpad/${row.mint}` : "/launchpad"} className="relative block h-[250px] w-[250px] shrink-0 rounded-[30px] bg-black p-[7px]">
      <span className="absolute inset-[7px] rounded-[24px]" style={{ background: g }} />
      <span className="absolute right-[22px] top-[20px] z-10 text-[13px] text-white/90">{tr(CATEGORY_LABEL[row.category] ?? row.category)}</span>
      <span className={`absolute right-[22px] top-[42px] z-10 text-[13px] font-bold ${row.graduated ? "text-[#7dffb0]" : "text-white/70"}`}>{row.graduated ? tr("Graduated") : tr("Rank {n}", { n: row.rank })}</span>
      <span className="absolute inset-x-[7px] bottom-[7px] h-[188px] rounded-b-[24px] bg-[#1a1a1c]" style={{ clipPath: "path('M0 26 Q0 0 24 0 H100 Q116 0 126 12 L140 28 Q146 34 160 34 H216 Q236 34 236 58 V188 H0 Z')" }} />
      {row.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.logoUrl} alt="" className="absolute left-[22px] top-[20px] z-10 size-14 rounded-2xl border-2 border-white/50 object-cover" />
      ) : (
        <span className="absolute left-[22px] top-[20px] z-10 flex size-14 items-center justify-center rounded-2xl border-2 border-white/50 bg-black/30 text-lg font-extrabold text-white">{row.name.slice(0, 2).toUpperCase()}</span>
      )}
      <span className="absolute left-6 top-[84px] z-10 max-w-[200px] truncate text-[21px] font-bold text-white">{row.name}</span>
      {description ? <span className="absolute left-6 top-[122px] z-10 line-clamp-2 w-[200px] text-[12px] text-white/60">{description}</span> : null}
      <span className="num absolute bottom-6 left-6 z-10 text-[28px] font-bold leading-none text-white">{compact(row.holders)}<small className="ml-1 text-[13px] font-normal text-white/60">{tr("holders")}</small></span>
      <span className="absolute bottom-6 right-6 z-10 text-right text-[11px] text-white/60">{tr("Volume")}<b className="num block text-[14px] text-white">${compact(row.volumeUsd)}</b></span>
    </Link>
  );
}
