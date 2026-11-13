"use client";

/**
 * « Chill ton sac » : montrer un token qu'on détient dans le fil. Ceux qui l'achètent ou le vendent depuis le post
 * paient les frais OM habituels (0,3 %), dont 40 % partent directement au détenteur dans la même transaction.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { SwapBox } from "@/components/swap/swap-box";
import { TerminalLineChart } from "@/components/terminal/line-chart";
import type { Bag } from "@/lib/bags";
import { USDC_MINT } from "@/lib/swap/core";
import { EvmSwapBox } from "@/components/swap/evm-swap-box";
import { EVM_CHAINS, isEvmChain, type EvmChain } from "@/lib/swap/evm";
import { GT_NET } from "@/lib/terminal";
import { useAuth } from "@/providers/auth-provider";
import { connectEvmTrader, restoreEvmTrader, type TradingAccount } from "@/lib/wallet/evm-trading";
import { refMessage } from "@/lib/swap/chill-evm-msg";

const MIN_USD = 1;
const TokenSwapDBC = dynamic(() => import("@/components/launchpad/token-swap-dbc").then((m) => m.TokenSwapDBC), { ssr: false });

/** Achat / vente depuis un post « sac » : par la bonding curve pour un token OM pas encore gradué, sinon par le moteur de swap. */
function BagTrade({ mint, symbol, logo, side, postId, chain, onDone }: { mint: string; symbol: string; logo: string | null; side: "buy" | "sell"; postId?: string; chain?: string | null; onDone: () => void }) {
  const { tr } = useT();
  const [curve, setCurve] = useState<string | null | undefined>(undefined);
  useEffect(() => { if (isEvmChain(chain)) return; fetch(`/api/swap/token?mint=${mint}`).then((r) => r.json()).then((j) => setCurve(j.token?.om_curve ?? null)).catch(() => setCurve(null)); }, [mint, chain]);
  if (isEvmChain(chain)) return (
    <div>
      {postId && <p className="mb-3 text-xs text-muted-foreground">{tr("Includes a 0.3% OM fee, 40% of it goes to the holder who posted this bag.")}</p>}
      <EvmSwapBox chain={chain} token={mint} refPost={postId} />
    </div>
  );
  if (curve === undefined) return <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (curve) return (
    <div>
      {postId && <p className="mb-3 text-xs text-muted-foreground">{tr("Includes a 0.3% OM fee, 40% of it goes to the holder who posted this bag.")}</p>}
      <TokenSwapDBC poolAddress={curve} mintAddress={mint} ticker={symbol} logoUrl={logo ?? undefined} refPost={postId} />
    </div>
  );
  return <SwapBox mint={mint} initialSide={side} refPost={postId} onSwapped={onDone} />;
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { tr } = useT();
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 md:items-center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border-t border-border bg-background px-4 pb-8 pt-2 md:rounded-[28px] md:border">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[17px] font-bold">{title}</span>
          <button onClick={onClose} aria-label={tr("Close")} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Logo({ src, sym, size = "size-11" }: { src: string | null; sym: string; size?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" className={`${size} shrink-0 rounded-full bg-muted object-cover`} />
    : <span className={`${size} flex shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold`}>{sym.slice(0, 1)}</span>;
}

const usd = (n: number | null) => n == null ? "-" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;
const price = (n: number | null) => n == null ? "-" : n >= 1 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : n >= 0.0001 ? `$${n.toFixed(6).replace(/0+$/, "")}` : `$${n.toPrecision(3)}`;

type PickBag = { id: string; symbol: string; name: string; logo: string | null; value: number | null };
type Net = "solana" | EvmChain;
type Eth = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

/** Fenêtre de création : choisir le réseau (Solana ou EVM), un token de ses BAGS et écrire un message. */
export function ChillComposer({ onClose }: { onClose: () => void }) {
  const { tr } = useT();
  const router = useRouter();
  const { walletAddress, isAuthenticated } = useAuth();
  const sessionEvm = isAuthenticated && !!walletAddress && walletAddress.startsWith("0x");
  const [net, setNet] = useState<Net>(sessionEvm ? "base" : "solana");
  const [bags, setBags] = useState<PickBag[] | null>(null);
  const [manual, setManual] = useState(false);
  const [paste, setPaste] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<PickBag | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // Wallet EVM : celui de la session, ou un wallet EVM relié (extension ou WalletConnect) quand on est connecté avec Solana
  const [trader, setTrader] = useState<TradingAccount | null>(null);
  useEffect(() => { if (!sessionEvm) void restoreEvmTrader().then(setTrader); }, [sessionEvm]);
  const evmAddr = sessionEvm ? walletAddress! : trader?.address ?? null;

  useEffect(() => {
    setBags(null); setErr(null); setPick(null); setManual(false);
    if (net === "solana") {
      fetch("/api/bags").then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => {
        if (j.chain === "arc") { setErr(tr("Connect a Solana wallet")); setBags([]); return; }
        setBags((j.main as Bag[]).filter((b) => b.id !== "native" && b.id !== USDC_MINT && (b.value ?? 0) >= MIN_USD));
      }).catch(() => { setErr(tr("Could not read the wallet right now")); setBags([]); });
      return;
    }
    if (!evmAddr) { setBags([]); return; }
    fetch(`/api/bags/evm?chain=${net}&address=${evmAddr}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => { setBags(j.bags ?? []); setManual(!!j.manual); })
      .catch(() => { setErr(tr("Could not read the wallet right now")); setBags([]); setManual(true); });
  }, [net, evmAddr, tr]);

  async function connect() {
    try { setTrader(await connectEvmTrader()); } catch (e) { const m = (e as Error).message ?? ""; if (!/reject|cancel|denied|declined|closed/i.test(m)) toast.error(tr(m) || tr("Could not connect")); }
  }

  async function findPasted() {
    const t = paste.trim().toLowerCase();
    if (!evmAddr || !/^0x[0-9a-f]{40}$/.test(t)) { setErr(tr("Paste a token contract address")); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/bags/evm?chain=${net}&address=${evmAddr}&token=${t}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Token not found");
      if ((j.bag.value ?? 0) < MIN_USD) throw new Error(`Hold at least $${MIN_USD} of this token to show it`);
      setPick(j.bag as PickBag);
    } catch (e) { setErr(tr((e as Error).message)); }
    setBusy(false);
  }

  async function post() {
    if (!pick) return;
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { mint: pick.id, body: text };
      if (net !== "solana") {
        payload.chain = net;
        if (!sessionEvm) {
          // Compte Solana : le wallet EVM signe un message pour prouver qu'il est à la personne
          const eth = trader?.provider as unknown as Eth | undefined;
          if (!eth?.request || !evmAddr) throw new Error("Connect an EVM wallet");
          const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const msg = refMessage(net, pick.id, nonce);
          const hex = "0x" + Array.from(new TextEncoder().encode(msg)).map((x) => x.toString(16).padStart(2, "0")).join("");
          payload.signature = await eth.request({ method: "personal_sign", params: [hex, evmAddr] });
          payload.nonce = nonce; payload.holder = evmAddr;
        }
      }
      const r = await fetch("/api/chill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Could not publish");
      toast.success(tr("Your bag is live"));
      onClose();
      router.push(`/post/${j.id}`);
    } catch (e) {
      const m = (e as Error).message ?? "";
      if (!/reject|cancel|denied|declined/i.test(m)) toast.error(tr(m) || tr("Could not publish"));
    }
    setBusy(false);
  }

  return (
    <Sheet title={tr("Chill your bag")} onClose={onClose}>
      <p className="text-sm text-muted-foreground">{tr("Show a token you hold. When people buy or sell it from your post, you earn 40% of the OM fee, paid instantly.")}</p>
      <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        {(["solana", ...(Object.keys(EVM_CHAINS) as EvmChain[])] as Net[]).map((n) => (
          <button key={n} onClick={() => setNet(n)} className={`h-8 shrink-0 rounded-lg px-3 text-[13px] font-semibold ${net === n ? "bg-foreground text-background" : "border border-border text-muted-foreground hover:text-foreground"}`}>{n === "solana" ? "Solana" : EVM_CHAINS[n].name}</button>
        ))}
      </div>
      {net !== "solana" && <p className="mt-2 text-xs text-muted-foreground">{tr("On EVM networks the 40% is added up for you and sent to your wallet.")}</p>}
      {!pick ? (
        <div className="mt-4">
          {net !== "solana" && !evmAddr ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">{tr("Connect an EVM wallet to show a token from {chain}", { chain: EVM_CHAINS[net].name })}</p>
              <button onClick={connect} className="mt-3 h-11 rounded-2xl bg-foreground px-6 text-[15px] font-bold text-background">{tr("Connect an EVM wallet")}</button>
            </div>
          ) : bags === null ? <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            : (
              <>
                {bags.length === 0 && !manual && <p className="py-8 text-center text-sm text-muted-foreground">{err ?? tr("No eligible token: hold at least $1 of a Solana token.")}</p>}
                {bags.map((b) => (
                  <button key={b.id} onClick={() => setPick(b)} className="flex w-full items-center gap-3 rounded-2xl px-1 py-2.5 text-left hover:bg-muted/50">
                    <Logo src={b.logo} sym={b.symbol} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-bold">{b.symbol}</p>
                      <p className="truncate text-[13px] text-muted-foreground">{b.name}</p>
                    </div>
                    <span className="num shrink-0 text-[15px] font-bold">{usd(b.value)}</span>
                  </button>
                ))}
                {net !== "solana" && (manual || bags.length > 0) && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs text-muted-foreground">{bags.length ? tr("Not in the list? Paste the token address") : tr("Paste the address of the token you hold")}</p>
                    <div className="flex gap-2">
                      <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="0x..." className="h-11 min-w-0 flex-1 rounded-2xl bg-muted/50 px-3 font-mono text-[14px] outline-none placeholder:text-muted-foreground" />
                      <button onClick={findPasted} disabled={busy} className="h-11 rounded-2xl bg-foreground px-4 text-[14px] font-bold text-background disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : tr("Find")}</button>
                    </div>
                    {err && <p className="mt-2 text-xs font-semibold text-down">{err}</p>}
                  </div>
                )}
              </>
            )}
        </div>
      ) : (
        <div className="mt-4">
          <button onClick={() => setPick(null)} className="flex w-full items-center gap-3 rounded-2xl bg-muted/50 p-3 text-left">
            <Logo src={pick.logo} sym={pick.symbol} />
            <div className="min-w-0 flex-1"><p className="truncate font-bold">${pick.symbol}</p><p className="num text-[13px] text-muted-foreground">{usd(pick.value)}</p></div>
            <span className="text-xs font-semibold text-muted-foreground">{tr("Change")}</span>
          </button>
          <textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1000))} rows={4} placeholder={tr("Why do you hold it?")}
            className="mt-3 w-full resize-none rounded-2xl bg-muted/50 p-3 text-[15px] outline-none placeholder:text-muted-foreground" />
          <button onClick={post} disabled={busy} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground font-bold text-background disabled:opacity-50">
            {busy && <Loader2 className="size-4 animate-spin" />}{tr("Post my bag")}
          </button>
        </div>
      )}
    </Sheet>
  );
}

type Market = { pool: string | null; price: number | null; change24h: number | null; mcap: number | null };

/** Carte du token dans un post « sac » : prix, petit graphique, et Acheter / Vendre liés à l'auteur. */
export function BagCard({ postId, bag, authorName, mine }: { postId: string; bag: { mint: string; symbol: string; name: string; logo: string | null; chain?: string | null }; authorName: string; mine: boolean }) {
  const { tr } = useT();
  const [m, setM] = useState<Market | null>(null);
  const [side, setSide] = useState<"buy" | "sell" | null>(null);
  useEffect(() => { fetch(`/api/bags/token?mint=${bag.mint}${bag.chain ? `&chain=${bag.chain}` : ""}`).then((r) => r.json()).then((j) => setM(j.market ?? null)).catch(() => {}); }, [bag.mint]);
  const c = m?.change24h ?? null;

  return (
    <div className="mt-3 rounded-3xl bg-muted/40 p-3.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3">
        <Logo src={bag.logo} sym={bag.symbol} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-bold text-foreground">${bag.symbol}</p>
          <p className="truncate text-[13px] text-muted-foreground">{bag.name} · {tr("MC")} {usd(m?.mcap ?? null)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-[16px] font-bold text-foreground">{price(m?.price ?? null)}</p>
          {c != null && <p className={`num text-[12px] font-semibold ${c >= 0 ? "text-up" : "text-down"}`}>{c >= 0 ? "+" : ""}{c.toFixed(2)}%</p>}
        </div>
      </div>
      {(m?.pool || m?.price) && <div className="-mx-1 mt-2"><TerminalLineChart pool={m.pool ?? ""} range="1D" heightClass="h-[110px]" fallbackPrice={m.price} network={(bag.chain && GT_NET[bag.chain as keyof typeof GT_NET]) || "solana"} /></div>}
      <p className="mt-2 text-[12px] text-muted-foreground">{mine ? tr("You earn 40% of the OM fee on trades from this post") : tr("{name} holds it and earns 40% of the OM fee on trades from this post", { name: authorName })}</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setSide("sell")} className="h-11 flex-1 rounded-full bg-muted text-[15px] font-bold text-foreground">{tr("Sell")}</button>
        <button onClick={() => setSide("buy")} className="h-11 flex-1 rounded-full bg-foreground text-[15px] font-bold text-background">{tr("Buy")}</button>
      </div>
      {side && (
        <Sheet title={`$${bag.symbol}`} onClose={() => setSide(null)}>
          <BagTrade mint={bag.mint} symbol={bag.symbol} logo={bag.logo} side={side} chain={bag.chain} postId={mine ? undefined : postId} onDone={() => setSide(null)} />
        </Sheet>
      )}
    </div>
  );
}
