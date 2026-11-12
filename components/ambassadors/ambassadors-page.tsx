"use client";

/** Page /ambassadors : le programme, les places restantes et le formulaire de candidature. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Coins, Gift, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { useT } from "@/lib/i18n";
import { AMBASSADOR_MAX, AMBASSADOR_MIN_FOLLOWERS, AMBASSADOR_SHARE_PCT, AMBASSADOR_WELCOME_OMERO, NORMAL_REFERRAL_PCT } from "@/lib/ambassadors";

type Status = { taken: number; max: number; application: { status: string } | null; ambassador: boolean; apply_until: string | null; results_at: string | null };

export function AmbassadorsPage() {
  const { tr } = useT();
  const { isAuthenticated } = useAuth();
  const [st, setSt] = useState<Status | null>(null);
  const [f, setF] = useState({ x_handle: "", telegram: "", other_links: "", followers: "", country: "", language: "", crypto_since: "", communities: "", events: "", content_links: "", other_programs: "", motivation: "", target_month: "" });
  const [accept, setAccept] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/ambassadors", { cache: "no-store" }).then((r) => r.json()).then(setSt).catch(() => {});
  useEffect(() => { load(); }, [isAuthenticated]);

  async function apply() {
    if (!isAuthenticated) { window.dispatchEvent(new CustomEvent("open-wallet-connect")); return; }
    setBusy(true);
    const r = await fetch("/api/ambassadors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, followers: Number(f.followers) || 0, target_month: Number(f.target_month) || 0, accept }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.error(tr(j.error ?? "Something went wrong")); return; }
    toast.success(tr("Application sent. We will get back to you."));
    load();
  }

  const left = st ? Math.max(0, st.max - st.taken) : AMBASSADOR_MAX;
  const until = st?.apply_until ? new Date(st.apply_until).getTime() : 0;
  const open = until > now;
  const daysLeft = Math.max(0, Math.ceil((until - now) / 86_400_000));
  const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long" }) : "");
  const input = "w-full rounded-2xl border border-border bg-transparent px-3.5 py-3 text-[15px] outline-none focus:border-foreground/40";
  const perks = [
    { icon: Coins, title: tr("{n}% of the fees", { n: AMBASSADOR_SHARE_PCT }), text: tr("On every trade of the people you bring, instead of {n}% for a normal referral. Credited automatically, trade by trade.", { n: NORMAL_REFERRAL_PCT }) },
    { icon: Gift, title: tr("{n} Omero for your referrals", { n: AMBASSADOR_WELCOME_OMERO }), text: tr("Each person who signs up with your link receives a welcome bonus and joins your community.") },
    { icon: BadgeCheck, title: tr("Ambassador badge"), text: tr("Shown on your profile and on your posts, with early access to new features.") },
    { icon: Users, title: tr("Your official community"), text: tr("Lead the OMdotfun community of your country or your language.") },
  ];

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8 pb-24">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">{tr("Ambassador program")}</h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{tr("{max} places only. Bring real users to OMdotfun and earn more on their activity. Nothing is paid in advance: you earn only on real trades.", { max: AMBASSADOR_MAX })}</p>
        <p className="text-[15px] font-semibold text-foreground">
          {tr("{n} places left", { n: left })}
          {open && <> · {daysLeft <= 1 ? tr("Last day to apply") : tr("{n} days left to apply", { n: daysLeft })} ({tr("until {date}", { date: fmtDate(st?.apply_until ?? null) })})</>}
        </p>
        {st?.results_at && <p className="text-[14px] text-muted-foreground">{tr("Selected ambassadors are announced on {date}.", { date: fmtDate(st.results_at) })}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {perks.map((p) => (
          <div key={p.title} className="rounded-3xl border border-border p-4">
            <p.icon className="size-6 text-foreground" />
            <p className="mt-2 text-[16px] font-bold text-foreground">{p.title}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">{p.text}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-border p-5">
        <p className="text-[17px] font-bold text-foreground">{tr("Rules")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-muted-foreground">
          <li>{tr("At least {n} real followers on X or Telegram, with engagement.", { n: AMBASSADOR_MIN_FOLLOWERS.toLocaleString() })}</li>
          <li>{tr("You must be 18 or older.")}</li>
          <li>{tr("No self-referral, no fake volume, no promise of gains. Fraud removes the status and the rewards.")}</li>
          <li>{tr("An inactive ambassador (no new active user for 2 months) gives the place to someone else.")}</li>
        </ul>
      </div>

      {!st ? <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        : st.ambassador ? (
          <div className="rounded-3xl bg-muted/50 p-5 text-center">
            <p className="text-[17px] font-bold text-foreground">{tr("You are an OMdotfun ambassador")}</p>
            <Link href="/dashboard/referrals" className="mt-3 inline-block rounded-full bg-foreground px-5 py-2.5 text-[14px] font-bold text-background">{tr("My referral link")}</Link>
          </div>
        ) : st.application?.status === "pending" ? (
          <div className="rounded-3xl bg-muted/50 p-5 text-center text-[15px] font-semibold text-foreground">{tr("Your application is being reviewed")}</div>
        ) : st.application && st.application.status !== "rejected" ? (
          <div className="rounded-3xl bg-muted/50 p-5 text-center text-[15px] text-muted-foreground">{tr("You already applied")}</div>
        ) : left === 0 ? (
          <div className="rounded-3xl bg-muted/50 p-5 text-center text-[15px] text-muted-foreground">{tr("All places are taken for now.")}</div>
        ) : !open ? (
          <div className="rounded-3xl bg-muted/50 p-5 text-center text-[15px] text-muted-foreground">{tr("Applications are closed. Results soon.")}</div>
        ) : (
          <div className="space-y-3 rounded-3xl border border-border p-5">
            <p className="text-[17px] font-bold text-foreground">{tr("Apply")}</p>
            <p className="pt-1 text-[14px] font-bold text-foreground">{tr("Your networks")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={f.x_handle} onChange={(e) => setF({ ...f, x_handle: e.target.value })} placeholder={tr("X account (@name)") + " *"} className={input} />
              <input value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} placeholder={tr("Telegram or Discord")} className={input} />
              <input value={f.other_links} onChange={(e) => setF({ ...f, other_links: e.target.value })} placeholder={tr("YouTube, TikTok or other links")} className={`${input} sm:col-span-2`} />
              <input value={f.followers} onChange={(e) => setF({ ...f, followers: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder={tr("Number of followers") + " *"} className={input} />
              <input value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} placeholder={tr("Country")} className={input} />
              <input value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} placeholder={tr("Language of your audience")} className={`${input} sm:col-span-2`} />
            </div>
            <p className="pt-1 text-[14px] font-bold text-foreground">{tr("Your experience")}</p>
            <div className="grid gap-3">
              <input value={f.crypto_since} onChange={(e) => setF({ ...f, crypto_since: e.target.value })} placeholder={tr("In crypto since (year)")} className={input} />
              <textarea value={f.communities} onChange={(e) => setF({ ...f, communities: e.target.value.slice(0, 800) })} rows={2} placeholder={tr("Communities you run or moderate")} className={`${input} resize-none`} />
              <textarea value={f.events} onChange={(e) => setF({ ...f, events: e.target.value.slice(0, 800) })} rows={2} placeholder={tr("Events you organized (AMA, spaces, meetups)")} className={`${input} resize-none`} />
              <textarea value={f.content_links} onChange={(e) => setF({ ...f, content_links: e.target.value.slice(0, 800) })} rows={2} placeholder={tr("Links to content you created")} className={`${input} resize-none`} />
              <input value={f.other_programs} onChange={(e) => setF({ ...f, other_programs: e.target.value.slice(0, 500) })} placeholder={tr("Other ambassador programs you joined")} className={input} />
            </div>
            <p className="pt-1 text-[14px] font-bold text-foreground">{tr("Your plan")}</p>
            <textarea value={f.motivation} onChange={(e) => setF({ ...f, motivation: e.target.value.slice(0, 1000) })} rows={4} placeholder={tr("How will you bring users to OMdotfun?") + " *"} className={`${input} resize-none`} />
            <input value={f.target_month} onChange={(e) => setF({ ...f, target_month: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder={tr("New users you aim for each month")} className={input} />
            <label className="flex items-start gap-3 text-[14px] text-foreground">
              <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-1 size-4 accent-current" />
              <span>{tr("I am 18 or older. I will not promise gains, create fake volume or refer myself, and I follow the OMdotfun policy.")}</span>
            </label>
            <button onClick={apply} disabled={busy || (isAuthenticated && !accept)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground text-[15px] font-bold text-background disabled:opacity-50">
              {busy && <Loader2 className="size-4 animate-spin" />}{isAuthenticated ? tr("Send my application") : tr("Connect to apply")}
            </button>
          </div>
        )}
    </main>
  );
}
