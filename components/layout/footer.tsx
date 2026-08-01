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
      <div className="mx-auto max-w-7xl px-4 py-10">

        {/* Brand header */}
        <div className="mb-8 flex items-center gap-3">
          <Image
            src="/octomarket-logo.png"
            alt="OMdotfun"
            width={40}
            height={40}
            className="rounded-full"
          />
          <div>
            <p className="text-base font-semibold text-foreground">OMdotfun</p>
            <p className="text-xs text-muted-foreground">Prediction markets on Solana</p>
          </div>
        </div>

        {/* Three columns */}
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3 mb-8">

          {/* Col 1 — OMdotfun */}
          <div>
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              OMdotfun
            </p>
            <ul className="space-y-1">
              {OMDOT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <i className={`ti ${l.icon} text-base`} aria-hidden />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 2 — ClawdTrust */}
          <div>
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              ClawdTrust{" "}
              <span className="normal-case tracking-normal font-normal opacity-60">Partner</span>
            </p>
            <ul className="space-y-1">
              {CLT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <i className={`ti ${l.icon} text-base`} aria-hidden />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            {/* Token CA */}
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1">
              <span className="font-mono text-[10px] text-muted-foreground">
                {CLT_CA.slice(0, 6)}…{CLT_CA.slice(-4)}
              </span>
            </div>
          </div>

          {/* Col 3 — Team */}
          <div>
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Team
            </p>
            <ul className="space-y-1">
              {TEAM_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <i className="ti ti-brand-x text-base" aria-hidden />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border pt-6 flex flex-col items-center justify-between gap-2 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} OMdotfun. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">Built on Solana</p>
        </div>

      </div>
    </footer>
  );
}
