"use client";

/**
 * Page Janus : chaque utilisateur active Janus en connectant son IA (Claude, ChatGPT, Grok) par le MCP d'OMdotfun.
 * Janus a son propre wallet (adresse permanente, plafonds fixés par l'humain, pause, retrait vers l'humain uniquement)
 * et exécute les sorties automatiques fixées par l'humain. La gestion réutilise les cartes des applications connectées.
 */
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { ConnectedApps } from "@/components/oauth/connected-apps";

export function JanusPage() {
  const { tr } = useT();
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/mcp/connect` : "https://omdot.fun/mcp/connect";
  const copy = () => navigator.clipboard.writeText(url).then(() => { setCopied(true); toast.success(tr("Link copied")); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  const perks: [string, string][] = [
    [tr("Its own wallet"), tr("One permanent address for you. It never changes, even if you clear your history.")],
    [tr("Your limits"), tr("You set the maximum per action and per day. Pause or withdraw at any time, funds only go back to you.")],
    [tr("Your exits, 24/7"), tr("Set stop loss, take profit and profit protection: Janus executes them every minute, even when you sleep.")],
    [tr("Safe by default"), tr("Only you give orders. If the wallet stays idle for 30 days, its balance comes back to you.")],
  ];
  return (
    <div className="mx-auto max-w-2xl px-4 pb-28 pt-6 md:pb-12">
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/janus/badge.png" alt="Janus" className="size-16 rounded-full" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Janus</h1>
          <p className="text-[15px] text-muted-foreground">{tr("Your AI on OMdotfun")}</p>
        </div>
      </div>
      <p className="mt-4 text-[15px] leading-relaxed text-foreground">{tr("Connect your AI (Claude, ChatGPT, Grok) and it becomes Janus: it reads the markets for you, trades with its own wallet within your limits, and executes your exits.")}</p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {perks.map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[15px] font-bold text-foreground">{t}</p>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{d}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <p className="text-[16px] font-bold text-foreground">{tr("Activate Janus")}</p>
        <ol className="mt-2 space-y-1.5 text-[14px] text-muted-foreground">
          <li><span className="font-bold text-foreground">1.</span> {tr("In your assistant, add this connector address, then click Connect.")}</li>
          <li><span className="font-bold text-foreground">2.</span> {tr("Come back here and create the Janus wallet for your AI.")}</li>
          <li><span className="font-bold text-foreground">3.</span> {tr("Fund it, set your limits and your exits. Janus does the rest.")}</li>
        </ol>
        <button onClick={copy} className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3 text-left font-mono text-sm text-foreground">
          <span className="truncate">{url}</span>
          {copied ? <Check className="size-4 shrink-0" /> : <Copy className="size-4 shrink-0 text-muted-foreground" />}
        </button>
      </div>

      <div className="mt-8"><ConnectedApps janus /></div>
    </div>
  );
}
