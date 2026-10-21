"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useT, Rich } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

const SECTIONS = [
  { id: "introduction",    label: T("Introduction") },
  { id: "data-collected",  label: T("Information We Collect") },
  { id: "public-profile", label: T("Public profile and agent access") },
  { id: "how-we-use",      label: T("How We Use Your Information") },
  { id: "third-parties",   label: T("Third-Party Services") },
  { id: "cookies",         label: T("Cookies") },
  { id: "retention",       label: T("Data Retention") },
  { id: "security",        label: T("Security") },
  { id: "geo",             label: T("Geographic Restrictions") },
  { id: "your-rights",     label: T("Your Rights") },
  { id: "changes",         label: T("Changes to This Policy") },
  { id: "contact",         label: T("Contact") },
];

function TOC({ active }: { active: string }) {
  const { tr } = useT();
  return (
    <nav className="sticky top-24 hidden lg:block w-56 shrink-0">
      <p className="mb-3 text-[13px] font-semibold text-muted-foreground">
        {tr("On this page")}
      </p>
      <ul className="space-y-1">
        {SECTIONS.map(s => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`block py-1 text-[13px] transition-colors leading-snug ${
                active === s.id
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tr(s.label)}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const linkCls = "text-foreground underline underline-offset-2 hover:no-underline";

function Em({ text, cls }: { text: string; cls: string }) {
  const parts = text.split(/\[\[(.*?)\]\]/);
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className={cls}>{p}</span> : p))}</>;
}

export default function PrivacyPage() {
  const { tr } = useT();
  const [active, setActive] = useState("introduction");

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
      },
      { rootMargin: "-20% 0px -70% 0px" },
    );
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">

      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">OMdotfun</Link>
        <span>/</span>
        <span className="text-foreground">{tr("Privacy Policy")}</span>
      </div>

      <div className="flex gap-16">
        {/* Sidebar */}
        <TOC active={active} />

        {/* Content */}
        <article className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-foreground mb-1">{tr("Privacy Policy")}</h1>
          <p className="text-sm text-muted-foreground mb-12">{tr("Last updated: October 21, 2026")}</p>

          <div className="space-y-14 text-[15px] leading-7 text-muted-foreground">

            <section id="introduction">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Introduction")}</h2>
              <p>
                <Rich linkClass={linkCls}>{tr("OMdotfun (“we”, “our”, “us”) operates the platform at [omdot.fun](https://omdot.fun), a Solana-based token launchpad and prediction market. This Privacy Policy explains what information we collect when you use our platform, how we use it, and your rights regarding that information.")}</Rich>
              </p>
              <p className="mt-4">
                {tr("By connecting your wallet or using any feature of OMdotfun, you agree to the practices described in this policy.")}
              </p>
            </section>

            <section id="data-collected">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Information We Collect")}</h2>

              <h3 className="text-base font-semibold text-foreground mb-2">{tr("Information you provide")}</h3>
              <ul className="list-disc list-outside ml-5 space-y-1.5">
                <li>{tr("Wallet address when you connect your Solana wallet")}</li>
                <li>{tr("EVM wallet address (MetaMask or other) when you connect on Arc")}</li>
                <li>{tr("Display name or username if you choose to set one")}</li>
                <li>{tr("Token details (name, ticker, description, logo) when you create a launchpad token")}</li>
                <li>{tr("Comments and messages you post on the platform")}</li>
                <li>{tr("Social links you add to your token or profile (Twitter, Telegram, website)")}</li>
              </ul>

              <h3 className="text-base font-semibold text-foreground mt-7 mb-2">{tr("Information collected automatically")}</h3>
              <ul className="list-disc list-outside ml-5 space-y-1.5">
                <li>{tr("On-chain transaction data associated with your wallet (public blockchain data)")}</li>
                <li>{tr("IP address and approximate geographic location")}</li>
                <li>{tr("Requests made through the MCP server and Agent API (IP address and rate-limit counters)")}</li>
                <li>{tr("Browser type, device type, and operating system")}</li>
                <li>{tr("Pages visited and features used within the platform")}</li>
                <li>{tr("Referral information if you arrived via a referral link")}</li>
              </ul>

              <h3 className="text-base font-semibold text-foreground mt-7 mb-2">{tr("Blockchain data")}</h3>
              <p>
                {tr("All transactions made on Solana are public by nature. We do not control what is visible on the blockchain. Wallet addresses, token creation events, trades, and bets are permanently recorded on-chain and are accessible to anyone.")}
              </p>
            </section>

            <section id="public-profile">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Public profile and agent access")}</h2>
              <p>
                {tr("Your wallet address, tokens launched, markets created, activity, rank and total earned are shown on your public profile. This public data can also be read by people and AI agents through our website and the MCP server.")}
              </p>
            </section>

            <section id="how-we-use">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("How We Use Your Information")}</h2>
              <ul className="list-disc list-outside ml-5 space-y-1.5">
                <li>{tr("To provide, operate, and improve the OMdotfun platform")}</li>
                <li>{tr("To display your tokens, predictions, and activity on the platform")}</li>
                <li>{tr("To calculate and distribute Omero rewards")}</li>
                <li>{tr("To maintain leaderboards and creator rankings")}</li>
                <li>{tr("To detect and prevent fraud, abuse, or unauthorized access")}</li>
                <li>{tr("To send platform-related notifications (if you opt in)")}</li>
                <li>{tr("To comply with applicable laws and regulations")}</li>
              </ul>
              <p className="mt-4">
                <Em text={tr("We do [[not]] sell your personal information to third parties. We do not use your data for advertising purposes.")} cls="text-foreground font-medium" />
              </p>
            </section>

            <section id="third-parties">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Third-Party Services")}</h2>
              <p className="mb-4">
                {tr("We use the following third-party services to operate the platform. Each has its own privacy policy:")}
              </p>
              <div className="rounded-xl border border-border overflow-hidden">
                {[
                  { name: "Helius",                    desc: T("Solana RPC provider for on-chain data") },
                  { name: "Arc",                       desc: T("EVM network RPC for Arc payments") },
                  { name: "Meteora",                   desc: T("DEX protocol for liquidity pools and token trading") },
                  { name: "GeckoTerminal / DexScreener", desc: T("Market data aggregators for token prices") },
                  { name: "Supabase",                  desc: T("Database and authentication infrastructure") },
                  { name: T("VPS / hosting provider"),    desc: T("Server infrastructure") },
                ].map((s, i, arr) => (
                  <div
                    key={s.name}
                    className={`flex items-start gap-4 px-4 py-3 ${i < arr.length - 1 ? "border-b border-border" : ""}`}
                  >
                    <span className="font-medium text-foreground text-sm w-48 shrink-0">{tr(s.name)}</span>
                    <span className="text-sm">{tr(s.desc)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4">
                {tr("We share only the minimum data necessary with these providers to deliver our services.")}
              </p>
            </section>

            <section id="cookies">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Cookies")}</h2>
              <p>
                {tr("We use minimal cookies and local storage to maintain your session (e.g., remembering your connected wallet and preferences). We do not use third-party advertising cookies or tracking pixels.")}
              </p>
              <p className="mt-4">
                {tr("You can clear cookies at any time through your browser settings. Doing so may require you to reconnect your wallet.")}
              </p>
            </section>

            <section id="retention">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Data Retention")}</h2>
              <p>
                {tr("We retain your account data (wallet address, display name, token and prediction history) for as long as your account is active or as required to provide our services. On-chain data is permanent and cannot be deleted by us or by you.")}
              </p>
              <p className="mt-4">
                {tr("If you request deletion of your off-chain data (comments, display name, profile), we will process your request within 30 days, except where retention is required by law.")}
              </p>
            </section>

            <section id="security">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Security")}</h2>
              <p>
                {tr("We implement industry-standard security measures including encrypted connections (HTTPS), access controls, and secure key management. However, no system is completely secure. We encourage you to protect your own wallet private keys and never share them with anyone — including us.")}
              </p>
              <p className="mt-4 font-medium text-foreground">
                {tr("OMdotfun will never ask for your wallet seed phrase or private key.")}
              </p>
            </section>

            <section id="geo">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Geographic Restrictions")}</h2>
              <p>
                {tr("OMdotfun is not available to users in jurisdictions where prediction markets, token trading, or related financial services are prohibited by law, including but not limited to the United States. By using the platform, you represent that you are not located in a restricted jurisdiction and that your use complies with all applicable local laws.")}
              </p>
            </section>

            <section id="your-rights">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Your Rights")}</h2>
              <p className="mb-4">{tr("Depending on your jurisdiction, you may have the right to:")}</p>
              <ul className="list-disc list-outside ml-5 space-y-1.5">
                <li>{tr("Access the personal data we hold about you")}</li>
                <li>{tr("Request correction of inaccurate data")}</li>
                <li>{tr("Request deletion of your off-chain data")}</li>
                <li>{tr("Object to certain types of processing")}</li>
                <li>{tr("Withdraw consent at any time (where processing is based on consent)")}</li>
              </ul>
              <p className="mt-4">{tr("To exercise these rights, contact us at the address below.")}</p>
            </section>

            <section id="changes">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Changes to This Policy")}</h2>
              <p>
                {tr("We may update this Privacy Policy from time to time. When we do, we will update the “Last updated” date at the top of this page. Continued use of the platform after changes are posted constitutes your acceptance of the updated policy.")}
              </p>
            </section>

            <section id="contact">
              <h2 className="text-xl font-semibold text-foreground mb-4">{tr("Contact")}</h2>
              <p className="mb-4">
                {tr("If you have any questions about this Privacy Policy or your data, please contact us:")}
              </p>
              <div className="rounded-xl border border-border px-5 py-4 space-y-1 text-sm">
                <p className="font-semibold text-foreground">OMdotfun</p>
                <p>
                  <Rich linkClass={linkCls}>{tr("Telegram: [t.me/omdotfun](https://t.me/omdotfun)")}</Rich>
                </p>
                <p>
                  <Rich linkClass={linkCls}>{tr("Website: [omdot.fun](https://omdot.fun)")}</Rich>
                </p>
              </div>
            </section>

          </div>
        </article>
      </div>
    </div>
  );
}
