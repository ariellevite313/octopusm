import Link from "next/link";
import Image from "next/image";

const CLT_CA = "DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS";

export function Footer() {
  return (
    <footer className="hidden md:block mt-12 px-4 pb-6">
      <div className="mx-auto max-w-7xl rounded-2xl px-6 py-10 bg-muted/40 dark:bg-zinc-950">

        {/* Main grid */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 mb-9">

          {/* Brand col */}
          <div className="col-span-2 sm:col-span-1">
            <div className="mb-4 flex items-center gap-2.5">
              <Image
                src="/octomarket-logo.png"
                alt="OMdotfun"
                width={36}
                height={36}
                className="rounded-xl border border-border"
              />
              <p className="text-base font-semibold text-foreground">OMdotfun</p>
            </div>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground" style={{ maxWidth: 200 }}>
              Where knowledge meets prediction on-chain.
            </p>
            <div className="flex gap-2">
              {[
                { href: "https://x.com/omdotfun", icon: "ti-brand-x" },
                { href: "https://t.me/Omdotfun",  icon: "ti-brand-telegram" },
              ].map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-8 items-center justify-center rounded-lg transition-colors bg-background border border-border text-muted-foreground hover:text-foreground"
                >
                  <i className={`ti ${s.icon} text-base`} aria-hidden />
                </Link>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div>
            <p className="mb-3.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Platform
            </p>
            <ul className="space-y-1">
              {[
                { href: "/",              icon: "ti-chart-bar",    label: "Markets",     internal: true },
                { href: "/launchpad",     icon: "ti-rocket",       label: "Launchpad",   internal: true },
                { href: "/leaderboard",   icon: "ti-trophy",       label: "Leaderboard", internal: true },
                { href: "/faq",           icon: "ti-help-circle",  label: "FAQ",         internal: true },
                { href: "https://t.me/Omdotfun",     icon: "ti-brand-telegram", label: "News & Updates", internal: false },
                { href: "https://t.me/OmdotfunTuto", icon: "ti-brand-telegram", label: "Tutorials",      internal: false },
              ].map((l) => (
                <li key={l.href + l.label}>
                  <Link
                    href={l.href}
                    target={l.internal ? undefined : "_blank"}
                    rel={l.internal ? undefined : "noopener noreferrer"}
                    className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <i className={`ti ${l.icon} text-sm`} aria-hidden />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ClawdTrust */}
          <div>
            <p className="mb-3.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              ClawdTrust <span className="normal-case tracking-normal font-normal opacity-60">Partner</span>
            </p>
            <ul className="space-y-1">
              {[
                { href: "https://x.com/clawdtrust", icon: "ti-brand-x", label: "@clawdtrust" },
                { href: "https://clawdtrust.com",    icon: "ti-world",   label: "clawdtrust.com" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <i className={`ti ${l.icon} text-sm`} aria-hidden />
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="https://dexscreener.com/solana/egi97rat7zrxrqvvv7edb5tvxzzxwgdh8vwvkgpfzdfc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Image src="/dexcrenner.png" alt="Dexscreener" width={14} height={14} className="rounded-sm" />
                  Dexscreener
                </Link>
              </li>
            </ul>
            <div className="mt-3 inline-block rounded-md px-2 py-1 font-mono text-[10px] bg-muted border border-border text-muted-foreground">
              {CLT_CA.slice(0, 6)}…{CLT_CA.slice(-4)}
            </div>
          </div>

          {/* Team */}
          <div>
            <p className="mb-3.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              Team
            </p>
            <ul className="space-y-1">
              {[
                { href: "https://x.com/cyrdoge",    label: "CyrDOGE" },
                { href: "https://x.com/0xadamback", label: "Adam" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-0.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <i className="ti ti-brand-x text-sm" aria-hidden />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* Disclaimer */}
        <p className="mb-4 text-[11px] text-muted-foreground/60 leading-relaxed border-t border-border pt-4">
          ⚠️ Trading prediction markets and launching tokens involve a risk of loss. Nothing on this platform constitutes financial advice.
          Always check the current{" "}
          <Link href="/faq" className="underline underline-offset-2 hover:text-muted-foreground transition-colors">
            terms
          </Link>{" "}
          before acting.
        </p>

        {/* Bottom bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <p className="text-[11px] text-muted-foreground">
              © {new Date().getFullYear()} OMdotfun — All rights reserved
            </p>
            <Link
              href="/privacy"
              className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
            >
              Privacy Policy
            </Link>
            <Link
              href="/policy"
              className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors underline underline-offset-2"
            >
              ŌM Policy
            </Link>
          </div>
          <div className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium text-violet-500 border border-violet-500/20">
            <i className="ti ti-circle-filled text-[8px]" aria-hidden />
            Built on Solana
          </div>
        </div>

      </div>
    </footer>
  );
}
