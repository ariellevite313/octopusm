/**
 * Serveur : itinéraire Jupiter (/swap/v2/build) et montage de la transaction (v0) à faire signer par l'utilisateur.
 * Clé facultative JUP_API_KEY (en-tête x-api-key).
 */
import bs58 from "bs58";
import {
  AddressLookupTableAccount, ComputeBudgetProgram, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { solanaConnection } from "@/lib/solana/rpc";
import { SWAP_FEE_WALLET, ataOf, createAtaIdempotent, feeMintFor, type SwapInput } from "./core";

const JUP_BUILD = "https://api.jup.ag/swap/v2/build";
const CU_MAX = 1_400_000;

type JIx = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };
type BuildRes = {
  inAmount: string; outAmount: string; otherAmountThreshold: string; slippageBps: number; priceImpactPct?: string;
  routePlan?: { percent?: number; swapInfo?: { label?: string } }[];
  computeBudgetInstructions: JIx[]; setupInstructions: JIx[]; swapInstruction: JIx; cleanupInstruction: JIx | null; otherInstructions: JIx[];
  addressesByLookupTableAddress: Record<string, string[]> | null;
  blockhashWithMetadata: { blockhash: number[] | string; lastValidBlockHeight: number };
  error?: string; errorCode?: string;
};

export type SwapQuote = {
  inAmount: string; outAmount: string; minOut: string; slippageBps: number; feeBps: number; feeMint: string | null;
  priceImpactPct: number | null; route: string[];
};

const toIx = (i: JIx) => new TransactionInstruction({
  programId: new PublicKey(i.programId),
  keys: i.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
  data: Buffer.from(i.data, "base64"),
});

export class SwapError extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

async function build(input: SwapInput, taker: string, feeBps: number): Promise<BuildRes> {
  const feeMint = feeMintFor(input.inputMint, input.outputMint);
  const params = new URLSearchParams({
    inputMint: input.inputMint, outputMint: input.outputMint, amount: input.amount, taker,
    slippageBps: String(input.slippageBps),
  });
  if (feeBps > 0 && feeMint) {
    params.set("platformFeeBps", String(feeBps));
    params.set("feeAccount", ataOf(new PublicKey(SWAP_FEE_WALLET), new PublicKey(feeMint)).toBase58());
  }
  const key = process.env.JUP_API_KEY;
  let r: Response;
  try {
    r = await fetch(`${JUP_BUILD}?${params}`, { headers: key ? { "x-api-key": key } : undefined, signal: AbortSignal.timeout(10_000), cache: "no-store" });
  } catch { throw new SwapError("Swap service unreachable, try again", 503); }
  const j = (await r.json().catch(() => ({}))) as BuildRes;
  if (!r.ok || j.error) {
    const msg = String(j.error ?? j.errorCode ?? "");
    if (/no.?route|NO_ROUTES/i.test(msg)) throw new SwapError("No route for this pair right now");
    if (r.status === 401 || r.status === 403) throw new SwapError("Swap service not configured", 503);
    if (r.status === 429) throw new SwapError("Too many requests, try again in a few seconds", 429);
    throw new SwapError("Could not get a price for this swap");
  }
  return j;
}

function quoteOf(j: BuildRes, feeBps: number, feeMint: string | null): SwapQuote {
  const pi = j.priceImpactPct != null ? Number(j.priceImpactPct) : NaN;
  return {
    inAmount: j.inAmount, outAmount: j.outAmount, minOut: j.otherAmountThreshold, slippageBps: j.slippageBps,
    feeBps, feeMint: feeBps > 0 ? feeMint : null,
    priceImpactPct: Number.isFinite(pi) ? pi * 100 : null,
    route: [...new Set((j.routePlan ?? []).map((p) => p.swapInfo?.label).filter((x): x is string => !!x))].slice(0, 4),
  };
}

/** Prix seulement (sans transaction). `taker` peut être absent : on utilise alors l'adresse de la plateforme. */
export async function swapQuote(input: SwapInput, feeBps: number, taker?: string): Promise<SwapQuote> {
  const j = await build(input, taker ?? SWAP_FEE_WALLET, feeBps);
  return quoteOf(j, feeBps, feeMintFor(input.inputMint, input.outputMint));
}

/** Prix + transaction non signée (base64), pour le portefeuille `taker`. */
export async function swapTransaction(input: SwapInput, feeBps: number, taker: string): Promise<SwapQuote & { tx: string; lastValidBlockHeight: number }> {
  const j = await build(input, taker, feeBps);
  const feeMint = feeMintFor(input.inputMint, input.outputMint);
  const user = new PublicKey(taker);

  const alts = Object.entries(j.addressesByLookupTableAddress ?? {}).map(([k, addrs]) => new AddressLookupTableAccount({
    key: new PublicKey(k),
    state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses: addrs.map((a) => new PublicKey(a)) },
  }));
  const bh = j.blockhashWithMetadata.blockhash;
  const recentBlockhash = typeof bh === "string" ? bh : bs58.encode(Uint8Array.from(bh));

  const body: TransactionInstruction[] = [
    ...(feeBps > 0 && feeMint ? [createAtaIdempotent(user, new PublicKey(SWAP_FEE_WALLET), new PublicKey(feeMint))] : []),
    ...j.setupInstructions.map(toIx),
    toIx(j.swapInstruction),
    ...(j.cleanupInstruction ? [toIx(j.cleanupInstruction)] : []),
    ...j.otherInstructions.map(toIx),
  ];
  const price = j.computeBudgetInstructions.map(toIx);
  const compile = (units: number) => new VersionedTransaction(new TransactionMessage({
    payerKey: user, recentBlockhash, instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units }), ...price, ...body],
  }).compileToV0Message(alts));

  // Simulation : limite de calcul ajustée (1,2 × consommé), sinon 400 000
  let units = 400_000;
  try {
    const sim = await solanaConnection().simulateTransaction(compile(CU_MAX), { sigVerify: false, replaceRecentBlockhash: true });
    if (sim.value.err) {
      const logs = (sim.value.logs ?? []).join(" ");
      if (/insufficient (lamports|funds)/i.test(logs)) throw new SwapError("Insufficient balance for this swap");
      if (/slippage|0x1771/i.test(logs)) throw new SwapError("Price moved too much, raise the slippage or try again");
      throw new SwapError("This swap would fail right now, try again");
    }
    if (sim.value.unitsConsumed) units = Math.min(CU_MAX, Math.ceil(sim.value.unitsConsumed * 1.2));
  } catch (e) { if (e instanceof SwapError) throw e; }

  const tx = compile(units);
  return { ...quoteOf(j, feeBps, feeMint), tx: Buffer.from(tx.serialize()).toString("base64"), lastValidBlockHeight: j.blockhashWithMetadata.lastValidBlockHeight };
}
