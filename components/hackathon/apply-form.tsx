"use client";

import { useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/providers/auth-provider";
import { HACKATHON, hackathonPhase } from "@/lib/hackathon/config";
import { MAX_TEAM } from "@/lib/hackathon/apply";
import { CATEGORY_LABEL } from "./use-hackathon";
import { signAction } from "./sign";

const input = "h-12 w-full rounded-2xl bg-muted px-4 text-[15px] text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-foreground/30";

export function ApplyForm() {
  const { tr } = useT();
  const { isAuthenticated, walletAddress, walletType } = useAuth();
  const phase = hackathonPhase();
  const [f, setF] = useState({ mintAddress: "", name: "", description: "", siteUrl: "", githubUrl: "", xHandle: "", videoUrl: "", category: "ai_agents", team: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  if (done) {
    return (
      <div>
        <p className="text-[24px] font-bold text-foreground">{tr("Your project is registered.")}</p>
        <p className="mt-2 text-[15px] text-muted-foreground">{tr("It now appears on the hackathon home and in the leaderboard.")}</p>
        <Link href="/hackathon/classement" className="mt-6 flex h-12 w-fit items-center justify-center rounded-2xl bg-foreground px-6 text-[15px] font-bold text-background">{tr("See the leaderboard")}</Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddress) return;
    setBusy(true); setErr(null);
    try {
      const mint = f.mintAddress.trim();
      const { issuedAt, signature } = await signAction({ walletType, wallet: walletAddress, action: "hackathon-apply", targetId: mint });
      const res = await fetch("/api/hackathon/apply", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mintAddress: mint, name: f.name, description: f.description, siteUrl: f.siteUrl, githubUrl: f.githubUrl || undefined,
          xHandle: f.xHandle, videoUrl: f.videoUrl || undefined, category: f.category,
          teamWallets: f.team.split(/[\s,]+/).filter(Boolean), issuedAt, signature,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? "Something went wrong");
      setDone(true);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <h1 className="text-[28px] font-bold text-foreground">{tr("Apply to the hackathon")}</h1>
      {phase === "soon" && <p className="text-[15px] text-muted-foreground">{tr("Applications open on {date}. Launch your token on OM before.", { date: HACKATHON.startsAt.slice(0, 10) })}</p>}
      {phase === "ended" && <p className="text-[15px] text-muted-foreground">{tr("Applications are closed.")}</p>}

      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Token contract address (CA)")}</span>
        <input required className={input} value={f.mintAddress} onChange={set("mintAddress")} placeholder="…om" /></label>
      <p className="-mt-2 text-[13px] text-muted-foreground">{tr("Not launched yet?")} <Link href="/launchpad/create" className="font-semibold text-foreground">{tr("Launch my token on OM")}</Link></p>
      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Project name")}</span><input required className={input} value={f.name} onChange={set("name")} maxLength={60} /></label>
      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("What does it do?")}</span>
        <textarea required className={`${input} h-28 py-3`} value={f.description} onChange={set("description")} maxLength={600} /></label>
      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Website (https, required)")}</span><input required type="url" className={input} value={f.siteUrl} onChange={set("siteUrl")} placeholder="https://" /></label>
      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("X profile")}</span><input required className={input} value={f.xHandle} onChange={set("xHandle")} placeholder="@project" /></label>
      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Category")}</span>
        <select className={input} value={f.category} onChange={set("category")}>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{tr(v)}</option>)}</select></label>
      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Other team wallets (up to {n}, optional)", { n: MAX_TEAM - 1 })}</span>
        <input className={input} value={f.team} onChange={set("team")} placeholder={tr("separated by spaces")} /></label>
      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("GitHub (optional)")}</span><input type="url" className={input} value={f.githubUrl} onChange={set("githubUrl")} placeholder="https://github.com/…" /></label>
      <label className="block"><span className="mb-1.5 block text-[13px] font-semibold text-muted-foreground">{tr("Video (optional)")}</span><input type="url" className={input} value={f.videoUrl} onChange={set("videoUrl")} placeholder="https://" /></label>

      {err && <p className="text-[14px] text-down">{err}</p>}
      {!isAuthenticated ? (
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("open-wallet-connect"))} className="btn-primary flex h-12 w-full items-center justify-center rounded-2xl text-[15px]">{tr("Connect Wallet")}</button>
      ) : (
        <button type="submit" disabled={busy || phase !== "live"} className="flex h-12 w-full items-center justify-center rounded-2xl bg-foreground text-[15px] font-bold text-background disabled:opacity-50">
          {busy ? tr("Signing and checking…") : tr("Sign and apply")}
        </button>
      )}
      <p className="text-[12px] text-muted-foreground">{tr("You sign a message with your wallet. No transaction, no fee.")}</p>
    </form>
  );
}
