"use client";

/**
 * Classement sur ordinateur : podium 2-1-3 puis tableau large et aéré.
 * Utilisé en plus de la liste mobile (qui reste inchangée), visible seulement à partir de lg.
 */
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useT } from "@/lib/i18n";

export type BoardRow = {
  key: string;
  href: string;
  rank: number;
  name: string;
  /** adresse courte sous le nom */
  sub: string;
  avatar: string | null;
  badge?: ReactNode;
  /** montant affiché, ex. « +$1,200.00 » */
  score: string;
  /** texte de la pastille, ex. « 12 wins » */
  chip: string;
};

const LAUREL = ["#f5b301", "#c9c9d3", "#e0712b"];

function walletGradient(addr: string) {
  let h = 0;
  for (let i = 0; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) >>> 0;
  const a = h % 360, b = (a + 40 + (h >> 9) % 80) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 70% 40%))`;
}

function Laurel({ rank }: { rank: number }) {
  const c = LAUREL[rank - 1];
  return (
    <span className="relative flex h-10 w-[50px] items-center justify-center" aria-hidden="true">
      <svg viewBox="0 0 44 36" className="absolute inset-0 h-full w-full">
        {[0, 1, 2].map((i) => (
          <g key={i} fill={c}>
            <ellipse cx={9 - i * 1.2} cy={24 - i * 7} rx="2.2" ry="4.4" transform={`rotate(${-30 + i * 18} ${9 - i * 1.2} ${24 - i * 7})`} />
            <ellipse cx={35 + i * 1.2} cy={24 - i * 7} rx="2.2" ry="4.4" transform={`rotate(${30 - i * 18} ${35 + i * 1.2} ${24 - i * 7})`} />
          </g>
        ))}
        <path d="M10 31 Q22 36 34 31" stroke={c} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      <span className="num relative text-xl font-black" style={{ color: c }}>{rank}</span>
    </span>
  );
}

function Avatar({ row, className, text }: { row: BoardRow; className: string; text: string }) {
  if (row.avatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={row.avatar} alt={row.name} className={`${className} shrink-0 object-cover`} />
    );
  }
  return (
    <div className={`${className} flex shrink-0 items-center justify-center font-extrabold text-white ${text}`} style={{ background: walletGradient(row.key) }}>
      {(row.name[0] ?? "?").toUpperCase()}
    </div>
  );
}

function Chip({ logo, label }: { logo: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted py-0.5 pl-0.5 pr-3 text-xs font-semibold text-muted-foreground">
      <Image src={logo} alt="" width={20} height={20} className="rounded-full" />
      {label}
    </span>
  );
}

function PodiumCard({ row, logo, center }: { row: BoardRow; logo: string; center?: boolean }) {
  return (
    <Link
      href={row.href}
      className={`relative flex flex-col items-center overflow-hidden rounded-[28px] border bg-card px-5 shadow-[var(--shadow-lg)] transition-transform hover:-translate-y-0.5 ${
        center ? "border-foreground/30 pb-9 pt-10" : "border-border pb-7 pt-7"
      }`}
    >
      {/* Lumière qui se déplace, fond sombre seulement */}
      <span
        aria-hidden="true"
        className="podium-glow pointer-events-none absolute inset-0 hidden dark:block"
        style={{ "--glow": LAUREL[row.rank - 1], animationDelay: `${-row.rank * 2.5}s` } as CSSProperties}
      />
      <Laurel rank={row.rank} />
      <Avatar row={row} className={center ? "my-4 size-[116px] rounded-[32px]" : "my-4 size-[92px] rounded-[26px]"} text={center ? "text-[42px]" : "text-[34px]"} />
      <p className={`flex max-w-full items-center gap-1.5 font-bold tracking-tight text-foreground ${center ? "text-[23px]" : "text-xl"}`}>
        <span className="truncate">{row.name}</span>{row.badge}
      </p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{row.sub}</p>
      <p className={`num mb-2.5 mt-4 font-extrabold text-up ${center ? "text-4xl" : "text-[28px]"}`}>{row.score}</p>
      <Chip logo={logo} label={row.chip} />
    </Link>
  );
}

export function DesktopBoard({ rows, logo, countLabel, scoreLabel }: { rows: BoardRow[]; logo: string; countLabel: string; scoreLabel: string }) {
  const { tr } = useT();
  const podium = rows.length >= 3;
  const rest = podium ? rows.slice(3) : rows;
  return (
    <div className="hidden lg:block">
      {podium && (
        <div className="mb-9 grid grid-cols-[1fr_1.18fr_1fr] items-end gap-5">
          <PodiumCard row={rows[1]} logo={logo} />
          <PodiumCard row={rows[0]} logo={logo} center />
          <PodiumCard row={rows[2]} logo={logo} />
        </div>
      )}
      {rest.length > 0 && (
        <div className="overflow-hidden rounded-[28px] border border-border bg-card shadow-[var(--shadow-lg)]">
          <div className="grid h-[58px] grid-cols-[96px_1fr_180px_190px] items-center px-9 text-xs font-bold uppercase tracking-[0.09em] text-muted-foreground">
            <span>{tr("Rank")}</span>
            <span>{tr("Player")}</span>
            <span className="text-right">{countLabel}</span>
            <span className="text-right">{scoreLabel}</span>
          </div>
          {rest.map((r) => (
            <Link key={r.key} href={r.href} className="grid h-[84px] grid-cols-[96px_1fr_180px_190px] items-center border-t border-border px-9 transition-colors hover:bg-muted/40">
              <span className="num text-[17px] font-semibold text-muted-foreground">{r.rank}.</span>
              <span className="flex min-w-0 items-center gap-4">
                <Avatar row={r} className="size-[52px] rounded-2xl" text="text-[19px]" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[17px] font-semibold tracking-tight text-foreground"><span className="truncate">{r.name}</span>{r.badge}</span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{r.sub}</span>
                </span>
              </span>
              <span className="text-right"><Chip logo={logo} label={r.chip} /></span>
              <span className="num text-right text-[19px] font-bold text-up">{r.score}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
