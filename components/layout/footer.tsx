import Image from "next/image";
import Link from "next/link";

const OMDOT_LINKS = [
  { href: "https://x.com/omdotfun",      icon: "ti-brand-x",        label: "@omdotfun" },
  { href: "https://x.com/octomarketfun", icon: "ti-brand-x",        label: "@octomarketfun" },
  { href: "https://t.me/Omdotfun",       icon: "ti-brand-telegram", label: "News & Updates" },
  { href: "https://t.me/OmdotfunTuto",   icon: "ti-brand-telegram", label: "Tutorials" },
];

const CLT_LINKS = [
  { href: "https://x.com/clawdtrust",                                                                    icon: "ti-brand-x",     label: "@clawdtrust" },
  { href: "https://clawdtrust.com",                                                                       icon: "ti-world",       label: "clawdtrust.com" },
  { href: "https://dexscreener.com/solana/egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc",                 icon: "ti-chart-candle", label: "Dexscreener" },
];

const CLT_CA = "DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS";

const TEAM_LINKS = [
  { href: "https://x.com/cyrdoge",    label: "CyrDOGE" },
  { href: "https://x.com/0xadamback", label: "Adam" },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto max-w-7xl px-4 py-8">

        {/* Brand header */}
        <div className="mb-6 flex items-center gap-2.5">
          <Image
            src="/octomarket-logo.png"
            alt="OMdotfun"
            width={32}
            height={32}
            className="rounded-full"
          />
          <div>
            <p className="text-sm font-semibold text-foreground">OMdotfun</p>
            <p className="text-[11px] text-muted-foreground">Prediction markets on Solana</p>
          </div>
        </div>

        {/* 2 columns on mobile, 3 on desktop */}
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 mb-6">

          {/* Col 1 — OMdotfun */}
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              OMdotfun
            </p>
            <ul className="space-y-0.5">
              {OMDOT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <i className={`ti ${l.icon} text-sm`} aria-hidden />
                    <span className="truncate">{l.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 2 — ClawdTrust */}
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              ClawdTrust{" "}
              <span className="normal-case tracking-normal font-normal opacity-60">Partner</span>
            </p>
            <ul className="space-y-0.5">
              {CLT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <i className={`ti ${l.icon} text-sm`} aria-hidden />
                    <span className="truncate">{l.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {/* Token CA */}
            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-muted/30 px-2 py-0.5">
              <span className="font-mono text-[9px] text-muted-foreground">
                {CLT_CA.slice(0, 4)}…{CLT_CA.slice(-4)}
              </span>
            </div>
          </div>

          {/* Col 3 — Team (full width on mobile, 3rd col on desktop) */}
          <div className="col-span-2 sm:col-span-1">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Team
            </p>
            <ul className="flex flex-row gap-4 sm:flex-col sm:gap-0 sm:space-y-0.5">
              {TEAM_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <i className="ti ti-brand-x text-sm" aria-hidden />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border pt-4 flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} OMdotfun
          </p>
          <p className="text-[11px] text-muted-foreground">Built on Solana</p>
        </div>

      </div>
    </footer>
  );
}
