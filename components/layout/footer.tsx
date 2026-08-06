import Link from "next/link";

const CLT_CA = "DjdyfQGdtiejPhaSgraS1qaiWVhgrEFTSnd9bVnYBAGS";

export function Footer() {
  return (
    <footer className="mt-12 px-4 pb-6">
      <div className="mx-auto max-w-7xl rounded-2xl px-6 py-10" style={{ background: "#0a0a0f" }}>

        {/* Main grid */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 mb-9">

          {/* Brand col */}
          <div className="col-span-2 sm:col-span-1">
            <div className="mb-4 flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/octomarket-logo.png"
                alt="OMdotfun"
                width={36}
                height={36}
                className="rounded-xl"
                style={{ background: "#1a1a2e", border: "0.5px solid #333" }}
              />
              <p className="text-base font-semibold text-white">OMdotfun</p>
            </div>
            <p className="mb-5 text-sm leading-relaxed" style={{ color: "#888", maxWidth: 200 }}>
              Where knowledge meets prediction on-chain.
            </p>
            <div className="flex gap-2">
              {[
                { href: "https://x.com/omdotfun",   icon: "ti-brand-x" },
                { href: "https://t.me/Omdotfun",    icon: "ti-brand-telegram" },
              ].map((s) => (
                <Link
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-8 items-center justify-center rounded-lg transition-colors"
                  style={{ background: "#1a1a2e", border: "0.5px solid #2a2a3e", color: "#666" }}
                >
                  <i className={`ti ${s.icon} text-base`} aria-hidden />
                </Link>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div>
            <p className="mb-3.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#444" }}>
              Platform
            </p>
            <ul className="space-y-1">
              {[
                { href: "https://x.com/omdotfun",       icon: "ti-brand-x",        label: "@omdotfun" },
                { href: "https://x.com/octomarketfun",  icon: "ti-brand-x",        label: "@octomarketfun" },
                { href: "https://t.me/Omdotfun",        icon: "ti-brand-telegram", label: "News & Updates" },
                { href: "https://t.me/OmdotfunTuto",    icon: "ti-brand-telegram", label: "Tutorials" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-0.5 text-sm transition-colors"
                    style={{ color: "#666" }}
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
            <p className="mb-3.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#444" }}>
              ClawdTrust <span className="normal-case tracking-normal font-normal opacity-60">Partner</span>
            </p>
            <ul className="space-y-1">
              {[
                { href: "https://x.com/clawdtrust",  icon: "ti-brand-x", label: "@clawdtrust" },
                { href: "https://clawdtrust.com",     icon: "ti-world",   label: "clawdtrust.com" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 py-0.5 text-sm transition-colors"
                    style={{ color: "#666" }}
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
                  className="flex items-center gap-2 py-0.5 text-sm transition-colors"
                  style={{ color: "#666" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/dexcrenner.png" alt="Dexscreener" width={14} height={14} className="rounded-sm" />
                  Dexscreener
                </Link>
              </li>
            </ul>
            <div
              className="mt-3 inline-block rounded-md px-2 py-1 font-mono text-[10px]"
              style={{ background: "#111", border: "0.5px solid #222", color: "#444" }}
            >
              {CLT_CA.slice(0, 6)}…{CLT_CA.slice(-4)}
            </div>
          </div>

          {/* Team */}
          <div>
            <p className="mb-3.5 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#444" }}>
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
                    className="flex items-center gap-2 py-0.5 text-sm transition-colors"
                    style={{ color: "#666" }}
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
        <div
          className="flex items-center justify-between pt-4"
          style={{ borderTop: "0.5px solid #1a1a1a" }}
        >
          <p className="text-[11px]" style={{ color: "#444" }}>
            © {new Date().getFullYear()} OMdotfun — All rights reserved
          </p>
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium"
            style={{ color: "#9945FF", border: "0.5px solid #9945FF33" }}
          >
            <i className="ti ti-circle-filled text-[8px]" aria-hidden />
            Built on Solana
          </div>
        </div>

      </div>
    </footer>
  );
}
