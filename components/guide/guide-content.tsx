"use client";

/** Guide d'utilisation d'OMdot.fun : les étapes pour bien démarrer, section par section. */
import Link from "next/link";
import { useT, Rich } from "@/lib/i18n";
import { T } from "@/lib/i18n-mark";

type Step = { title: string; steps: string[]; link?: { href: string; label: string } };

const GUIDE: Step[] = [
  {
    title: T("1. Create your account"),
    steps: [
      T("Tap Connect and choose your wallet: Phantom, Solflare or another Solana wallet, or MetaMask for Arc and the EVM networks."),
      T("No wallet? Choose Continue with X: a wallet is created for you and linked to your X account."),
      T("Sign the message to prove the wallet is yours. It costs nothing and moves no funds."),
      T("Choose a username and a photo, then add a short bio on your profile."),
    ],
    link: { href: "/faq", label: T("Read the FAQ") },
  },
  {
    title: T("2. Post on the feed"),
    steps: [
      T("Tap the + button, write your post and add up to 2 images."),
      T("Type $TICKER to attach a token, #hashtag to join a topic, @name to mention someone, or paste a market link to show it."),
      T("Like, reply, repost or quote. You can tip a post you like with Omero."),
      T("Chill your bag: show a token you hold. When someone trades it from your post, you earn 40% of the platform fee."),
    ],
    link: { href: "/", label: T("Open the feed") },
  },
  {
    title: T("3. Join or create a community"),
    steps: [
      T("Open Communities, find one that interests you and tap Join."),
      T("Post inside it: choose the community in Post to, or post from its page."),
      T("Tap the pin button to show the community on your profile."),
      T("Create your own for 100 Omero. You become the admin and can name moderators."),
    ],
    link: { href: "/communities", label: T("See communities") },
  },
  {
    title: T("4. Trade in the Terminal"),
    steps: [
      T("Pick a token in Trending, Crypto, New or Top volume, or search it by name or address."),
      T("Use the filter button to choose the networks."),
      T("Check the chart, the top 100 holders and the bundle detection before you buy."),
      T("Enter an amount and tap Buy or Sell, then sign in your wallet. Fees: 0% on OMdot.fun tokens, 0.03% on major assets, 0.3% on the others."),
    ],
    link: { href: "/terminal", label: T("Open the Terminal") },
  },
  {
    title: T("5. Launch a token"),
    steps: [
      T("Open Launchpad, then Launch a token. Choose Solana or Arc."),
      T("Add a name, a ticker, an image and your links. You can make a first buy."),
      T("Sign the transaction. You receive 500 Omero and a share of every trade on your token."),
      T("Share it on the feed and claim your creator fees from My tokens."),
    ],
    link: { href: "/launchpad/create", label: T("Launch a token") },
  },
  {
    title: T("6. Predict"),
    steps: [
      T("Open Predictions: prediction markets, pools and Up/Down rounds."),
      T("Choose an outcome, enter your amount and confirm. Each outcome shows its price and its chances."),
      T("Create your own market and earn a share when people predict on it."),
      T("Claim your winnings when the market is resolved."),
    ],
    link: { href: "/prediction", label: T("See the markets") },
  },
  {
    title: T("7. Earn Omero"),
    steps: [
      T("Do your daily tasks: post, share a market, invite someone."),
      T("Invite friends with your link: you get 10% of the platform fee on each of their trades."),
      T("Open the weekly box: your activity of the week gives Omero, and sometimes SOL, depending on your rank."),
      T("Climb the leaderboards: creators, traders, predicts and Chill your bag."),
    ],
    link: { href: "/dashboard/tasks", label: T("See my tasks") },
  },
  {
    title: T("8. Connect your AI"),
    steps: [
      T("Open AI agents and connect Claude, ChatGPT or Grok to OMdot.fun."),
      T("Your AI can read the platform, and post or reply for you if you approve it in Connected apps."),
      T("Give it its own wallet if you want: it trades, predicts and launches alone, within the limits you set. Withdrawals only go back to you."),
    ],
    link: { href: "/agents", label: T("Connect an AI") },
  },
  {
    title: T("Stay safe"),
    steps: [
      T("Never share your secret phrase or private key. OMdot.fun will never ask for it."),
      T("Check the blue badge and the holders of a token before buying. Unverified tokens show a warning."),
      T("Only use omdot.fun and our official accounts listed in the FAQ."),
    ],
  },
];

export default function GuideContent() {
  const { tr } = useT();
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8 pb-24">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">{tr("User guide")}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{tr("Everything you need to get started on OMdot.fun, step by step.")}</p>
      </div>
      {GUIDE.map((g) => (
        <section key={g.title} className="rounded-3xl border border-border p-5">
          <h2 className="text-[18px] font-bold text-foreground">{tr(g.title)}</h2>
          <ol className="mt-3 space-y-2.5">
            {g.steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-foreground">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold">{i + 1}</span>
                <span><Rich>{tr(s)}</Rich></span>
              </li>
            ))}
          </ol>
          {g.link && <Link href={g.link.href} className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-[14px] font-bold text-background">{tr(g.link.label)}</Link>}
        </section>
      ))}
    </main>
  );
}
