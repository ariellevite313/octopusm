"use client";

/** Discovery : ce qui bouge sur OM en un coup d'œil (tokens tendance, nouveaux lancements, prédictions chaudes) et les autres sections. */
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Award, Bot, CandlestickChart, Palette, Gem, Megaphone } from "lucide-react";
import { BurningFire } from "@/components/shared/burning-fire";
import { VerifiedTokenBadge } from "@/components/shared/verified-token-badge";
import { SolanaMark, ArcMark } from "@/components/shared/solana-mark";
import { Mirage } from "@/components/shared/mirage";
import { useT } from "@/lib/i18n";

type Tok = { id: string; name: string; ticker: string; logo_url: string | null; mint_address: string | null; arc_launch_id: string | null; chain: string | null; is_verified?: boolean; market_cap_usd: number | null; volume_24h_usd?: number | null; created_at?: string };
type Mkt = { id: string; type: string; title: string; href: string; img?: string; volume_usdc: number; bet_token: "usdc" | "clawdtrust"; options: { id: string; label: string; pct: number }[] };

const usd = (n: number | null | undefined) => {
  const v = Number(n) || 0;
  return v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;
};
const slugOf = (t: Tok) => (t.chain === "arc" ? (t.mint_address ?? t.arc_launch_id ?? t.id) : (t.mint_address ?? t.id));

function TokenRow({ t, rank, metric }: { t: Tok; rank?: number; metric: string }) {
  return (
    <Link href={`/launchpad/${slugOf(t)}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-muted/50">
      {rank != null && <span className="num w-5 text-center text-[13px] font-bold text-muted-foreground">{rank}</span>}
      <span className="relative size-10 shrink-0 overflow-hidden rounded-xl bg-muted">
        {t.logo_url && <Image src={t.logo_url} alt="" fill className="object-cover" unoptimized />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[15px] font-bold text-foreground">
          <span className="truncate">{t.ticker}</span>
          {t.chain === "arc" ? <ArcMark className="size-3.5 shrink-0" /> : <SolanaMark className="size-3.5 shrink-0" />}
          {t.is_verified && <VerifiedTokenBadge className="size-3.5" />}
        </span>
        <span className="block truncate text-[12px] text-muted-foreground">{t.name}</span>
      </span>
      <span className="text-right">
        <span className="num block text-[14px] font-bold text-foreground">{metric}</span>
        <span className="num block text-[11px] text-muted-foreground">{usd(t.market_cap_usd)}</span>
      </span>
    </Link>
  );
}

function Card({ title, icon, href, children }: { title: string; icon?: React.ReactNode; href?: string; children: React.ReactNode }) {
  const { tr } = useT();
  return (
    <section className="rounded-[28px] border border-border bg-card p-4">
      <div className="mb-1 flex items-center justify-between px-2">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-foreground">{icon}{title}</h2>
        {href && <Link href={href} className="flex items-center gap-1 text-[13px] font-semibold text-muted-foreground hover:text-foreground">{tr("See all")}<ArrowRight className="size-3.5" /></Link>}
      </div>
      {children}
    </section>
  );
}

export function Discover() {
  const { tr } = useT();
  const [hot, setHot] = useState<Tok[] | null>(null);
  const [fresh, setFresh] = useState<Tok[] | null>(null);
  const [mk, setMk] = useState<Mkt[] | null>(null);

  useEffect(() => {
    const j = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    j("/api/launchpad/trending?limit=8").then((d) => setHot(d?.tokens ?? []));
    j("/api/launchpad/tokens?sort=new&limit=8").then((d) => setFresh(d?.tokens ?? []));
    j("/api/markets/trending").then((d) => setMk(Array.isArray(d) ? d.slice(0, 6) : []));
  }, []);

  const spin = <div className="flex justify-center py-8"><Mirage className="size-5 text-muted-foreground" /></div>;
  const empty = <p className="py-8 text-center text-sm text-muted-foreground">{tr("Nothing here yet.")}</p>;

  const shortcuts = [
    { href: "/terminal", label: tr("Terminal"), text: tr("Trade 9 chains"), icon: CandlestickChart },
    { href: "/hackathon", label: tr("Hackathon"), text: tr("Win up to $100,000"), icon: Award },
    { href: "/nft", label: tr("NFT"), text: tr("Solana collections"), icon: Gem },
    { href: "/studio", label: tr("Studio"), text: tr("Omero memes and avatars"), icon: Palette },
    { href: "/janus", label: tr("Janus"), text: tr("Your trading AI"), icon: Bot },
    { href: "/ambassadors", label: tr("Ambassadors"), text: tr("Earn by sharing"), icon: Megaphone },
  ];

  return (
    <div className="space-y-4">
      <div className="px-1">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">{tr("Discover")}</h1>
        <p className="mt-1 text-[15px] text-muted-foreground">{tr("What is moving on OMdotfun right now.")}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
        {shortcuts.map((s) => (
          <Link key={s.href} href={s.href} className="rounded-2xl border border-border bg-card p-3.5 transition-colors hover:bg-muted/50">
            <s.icon className="size-5 text-foreground" />
            <p className="mt-2 text-[14px] font-bold text-foreground">{s.label}</p>
            <p className="text-[12px] text-muted-foreground">{s.text}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={tr("Trending tokens")} icon={<BurningFire className="!text-[17px]" />} href="/launchpad">
          {hot === null ? spin : hot.length === 0 ? empty : hot.map((t, i) => <TokenRow key={t.id} t={t} rank={i + 1} metric={`${usd(t.volume_24h_usd)} 24h`} />)}
        </Card>
        <Card title={tr("New launches")} href="/launchpad">
          {fresh === null ? spin : fresh.length === 0 ? empty : fresh.map((t) => <TokenRow key={t.id} t={t} metric={t.created_at ? new Date(t.created_at).toLocaleDateString() : ""} />)}
        </Card>
      </div>

      <Card title={tr("Hot predictions")} href="/prediction">
        {mk === null ? spin : mk.length === 0 ? empty : (
          <div className="grid gap-2 lg:grid-cols-2">
            {mk.map((m) => (
              <Link key={m.id} href={m.href} className="rounded-2xl px-2 py-2.5 transition-colors hover:bg-muted/50">
                <p className="line-clamp-2 text-[14px] font-semibold text-foreground">{m.title}</p>
                <div className="mt-2 flex gap-1.5">
                  {m.options.slice(0, 3).map((o) => (
                    <span key={o.id} className="num truncate rounded-full bg-muted px-2.5 py-1 text-[12px] font-semibold text-foreground">{o.label} {Math.round(o.pct)}%</span>
                  ))}
                </div>
                <p className="num mt-1.5 text-[11px] text-muted-foreground">{m.bet_token === "usdc" ? `$${Math.round(m.volume_usdc).toLocaleString()}` : `${Math.round(m.volume_usdc).toLocaleString()} CLT`}</p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
