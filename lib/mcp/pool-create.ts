/**
 * Création d'un marché de prédiction (pool) par un agent, non custodial :
 *  1. pool_fee_prepare  : le serveur construit la transaction des frais (0,5 USDC ou 500 000 CLT, mémo kind=pool_creation), l'agent la signe.
 *  2. pool_fee_submit   : relais optionnel de cette transaction signée (programmes limités : token, ATA, mémo).
 *  3. create_pool_market: crée le marché avec la signature de la transaction ; images par lien ou base64, stockées par le serveur.
 * Le marché est créé « pending » : il passe en revue par un admin comme sur le site. Solana seulement pour l'instant.
 */
import { Connection, PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from "@solana/web3.js";
import { createAdminClient } from "@/lib/supabase/server";
import { TREASURY_ADDRESS, USDC_MINT, CLT_MINT } from "@/lib/market/betting";
import { POOL_CREATION_FEE_USDC, POOL_CREATION_FEE_CLT } from "@/lib/market/pool-fee";
import { createPoolMarket } from "@/lib/market/create-pool";
import { sniffImage, moderateImage } from "@/lib/moderation";
import { fetchImage, ImageUrlError } from "@/lib/mcp/fetch-image";
import { rateHit } from "@/lib/rate-limit";
import { createUnderMandate } from "@/lib/mcp/mandate";

export class PoolError extends Error {}

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ASSOC_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const COMPUTE_PROGRAM = "ComputeBudget111111111111111111111111111111";
const ALLOWED = new Set([TOKEN_PROGRAM, ASSOC_PROGRAM, MEMO_PROGRAM, COMPUTE_PROGRAM, "11111111111111111111111111111111"]);
const SOL_ADDR = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const conn = () => new Connection(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
type P = Record<string, unknown>;

const str = (p: P, k: string, max: number, required = false): string | undefined => {
  const v = p[k];
  if (v === undefined || v === null || v === "") { if (required) throw new PoolError(`params.${k} is required`); return undefined; }
  if (typeof v !== "string") throw new PoolError(`params.${k} must be a string`);
  if (v.length > max) throw new PoolError(`params.${k} is too long`);
  return v;
};

function feeToken(p: P): "usdc" | "clawdtrust" {
  const t = str(p, "fee_token", 12) ?? "usdc";
  if (t !== "usdc" && t !== "clawdtrust") throw new PoolError("params.fee_token must be usdc or clawdtrust");
  return t;
}

/** Étape 1 : transaction des frais de création, à signer par l'agent. */
export async function poolFeePrepare(wallet: string, p: P) {
  if (!SOL_ADDR.test(wallet)) throw new PoolError("Agent market creation supports Solana wallets for now (Arc wallets: use the website)");
  const title = str(p, "title", 200, true)!;
  const token = feeToken(p);
  if (!(await rateHit(`poolfee:${wallet}`, 10, 3600_000))) throw new PoolError("Too many requests, try again later");
  const mint = new PublicKey(token === "clawdtrust" ? CLT_MINT : USDC_MINT);
  const decimals = token === "clawdtrust" ? 9 : 6;
  const amount = token === "clawdtrust" ? POOL_CREATION_FEE_CLT : POOL_CREATION_FEE_USDC;
  const payer = new PublicKey(wallet);
  const treasury = new PublicKey(TREASURY_ADDRESS);
  const tokenProg = new PublicKey(TOKEN_PROGRAM), assoc = new PublicKey(ASSOC_PROGRAM);
  const ata = (owner: PublicKey) => PublicKey.findProgramAddressSync([owner.toBuffer(), tokenProg.toBuffer(), mint.toBuffer()], assoc)[0];
  const from = ata(payer), to = ata(treasury);
  const c = conn();
  const { blockhash } = await c.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer, recentBlockhash: blockhash });
  if (!(await c.getAccountInfo(to, "confirmed"))) {
    tx.add(new TransactionInstruction({
      programId: assoc, data: Buffer.from([1]),
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true }, { pubkey: to, isSigner: false, isWritable: true },
        { pubkey: treasury, isSigner: false, isWritable: false }, { pubkey: mint, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false }, { pubkey: tokenProg, isSigner: false, isWritable: false },
      ],
    }));
  }
  const memo = ["om?v=1", "kind=pool_creation", `wallet=${wallet}`, `title=${encodeURIComponent(title.slice(0, 80))}`].join("&");
  tx.add(new TransactionInstruction({ programId: new PublicKey(MEMO_PROGRAM), keys: [{ pubkey: payer, isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") }));
  const data = Buffer.alloc(10);
  data[0] = 12;
  data.writeBigUInt64LE(BigInt(Math.round(amount * 10 ** decimals)), 1);
  data[9] = decimals;
  tx.add(new TransactionInstruction({
    programId: tokenProg, data,
    keys: [{ pubkey: from, isSigner: false, isWritable: true }, { pubkey: mint, isSigner: false, isWritable: false }, { pubkey: to, isSigner: false, isWritable: true }, { pubkey: payer, isSigner: true, isWritable: false }],
  }));
  return {
    chain: "solana",
    fee: { amount, token: token === "clawdtrust" ? "CLT" : "USDC" },
    tx_base64: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    next: "Sign tx_base64 with the wallet key within about 60 seconds, then send it yourself or call the pool_fee_submit action with { signed_tx_base64 }. Then call create_pool_market with the returned signature as creation_tx.",
  };
}

/** Étape 2 (optionnelle) : relaie la transaction de frais signée. */
export async function poolFeeSubmit(wallet: string, p: P) {
  const b64 = str(p, "signed_tx_base64", 4000, true)!;
  const raw = Buffer.from(b64, "base64");
  let programs: string[] = [];
  let signer = "";
  try {
    const vtx = VersionedTransaction.deserialize(raw);
    programs = vtx.message.compiledInstructions.map((ix) => vtx.message.staticAccountKeys[ix.programIdIndex]?.toBase58() ?? "");
    signer = vtx.message.staticAccountKeys[0]?.toBase58() ?? "";
  } catch {
    try { const t = Transaction.from(raw); programs = t.instructions.map((ix) => ix.programId.toBase58()); signer = t.feePayer?.toBase58() ?? ""; } catch { throw new PoolError("Invalid transaction"); }
  }
  if (signer !== wallet) throw new PoolError("The fee payer must be the agent wallet");
  if (!programs.includes(MEMO_PROGRAM) || programs.some((x) => !ALLOWED.has(x))) throw new PoolError("Only the market creation fee transaction can be submitted here");
  const sig = await conn().sendRawTransaction(raw, { skipPreflight: false, maxRetries: 3 }).catch((e: unknown) => {
    throw new PoolError(e instanceof Error ? e.message.slice(0, 160) : "Transaction failed");
  });
  return { signature: sig, explorer: `https://solscan.io/tx/${sig}`, next: "Wait a few seconds, then call create_pool_market with creation_tx = this signature." };
}

async function storeImage(wallet: string, link: string | undefined, b64: string | undefined): Promise<string | null> {
  if (!link && !b64) return null;
  let buf: Buffer;
  if (b64) buf = Buffer.from(b64, "base64");
  else {
    try { buf = (await fetchImage(link!, 2 * 1024 * 1024)).buf; } catch (e) { if (e instanceof ImageUrlError) throw new PoolError(e.message); throw e; }
  }
  if (buf.length === 0 || buf.length > 2 * 1024 * 1024) throw new PoolError("Each image must be 1 byte to 2 MB");
  const mime = sniffImage(buf);
  if (!mime) throw new PoolError("Images must be PNG, JPEG, WebP or GIF");
  if ((await moderateImage(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, mime)) === "blocked") throw new PoolError("This image is not allowed");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const path = `agents/${wallet}/${Date.now()}-${Math.random().toString(36).slice(2)}.${mime.split("/")[1].replace("jpeg", "jpg")}`;
  const { error } = await admin.storage.from("market-images").upload(path, buf, { contentType: mime, upsert: false });
  if (error) throw new PoolError("Could not store the image");
  return admin.storage.from("market-images").getPublicUrl(path).data.publicUrl as string;
}

/** Étape 3 : crée le marché (statut pending, revue par un admin). */
export async function createPoolAction(wallet: string, p: P, origin: string) {
  if (!SOL_ADDR.test(wallet)) throw new PoolError("Agent market creation supports Solana wallets for now (Arc wallets: use the website)");
  const mk = str(p, "match_key", 200);
  const title = mk ? "Football match" : str(p, "title", 200, true)!;
  const creation_tx = str(p, "creation_tx", 200, true)!;
  const rawOpts = mk ? [{ label: "Home" }, { label: "Draw" }, { label: "Away" }] : p.options;
  if (!Array.isArray(rawOpts) || rawOpts.length < 2 || rawOpts.length > 8) throw new PoolError("params.options must have 2 to 8 items");
  if (!(await rateHit(`poolcreate:${wallet}`, 10, 3600_000))) throw new PoolError("Too many markets created, try again later");
  const options: { label: string; image_url: string | null }[] = [];
  for (const o of rawOpts as P[]) {
    if (!o || typeof o !== "object" || typeof o.label !== "string") throw new PoolError("Each option needs a label");
    options.push({ label: o.label, image_url: await storeImage(wallet, str(o, "image_url", 2000), str(o, "image_base64", 3_000_000)) });
  }
  const cover = await storeImage(wallet, str(p, "cover_image_url", 2000), str(p, "cover_image_base64", 3_000_000));
  const res = await createPoolMarket(wallet, {
    title, description: str(p, "description", 1000) ?? null, cover_image_src: cover, options,
    category: str(p, "category", 30), betting_closes_at: mk ? new Date(Date.now() + 2 * 3600_000).toISOString() : str(p, "betting_closes_at", 40, true),
    bet_token: str(p, "bet_token", 12) ?? "usdc", creation_fee_token: feeToken(p), creation_tx,
    match_key: str(p, "match_key", 200) ?? null,
  });
  const j = (await res.json().catch(() => ({}))) as { id?: string; slug?: string; error?: string };
  if (res.status >= 400) throw new PoolError(j.error ?? `Request failed (${res.status})`);
  return {
    ok: true, id: j.id, slug: j.slug, status: "pending", url: `${origin}/pools/${j.slug}`,
    note: "The market is pending admin review, like on the website. Once it is live, share it with create_post by putting the url in the text: the post shows the market card with the betting options.",
  };
}

/** Brouillon pour un humain : images stockées, rien n'est payé. L'humain ouvre le lien, relit, paie les frais et crée le marché lui-même. */
export async function requestPoolMarket(wallet: string, p: P, origin: string) {
  const matchKey = str(p, "match_key", 200);
  if (matchKey) return requestMatchPool(wallet, matchKey, str(p, "bet_token", 12) ?? "usdc", origin);
  const title = str(p, "title", 200, true)!;
  if (title.trim().length < 5) throw new PoolError("params.title must be at least 5 characters");
  const rawOpts = p.options;
  if (!Array.isArray(rawOpts) || rawOpts.length < 2 || rawOpts.length > 8) throw new PoolError("params.options must have 2 to 8 items");
  const closes = str(p, "betting_closes_at", 40, true)!;
  const ms = new Date(closes).getTime();
  if (isNaN(ms) || ms < Date.now() + 60 * 60 * 1000) throw new PoolError("params.betting_closes_at must be at least 1 hour from now (ISO date)");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  if (!(await rateHit(`pooldraft:${wallet}`, 10, 3600_000))) throw new PoolError("Too many requests, try again later");
  const options: { label: string; image_url: string | null }[] = [];
  for (const o of rawOpts as P[]) {
    if (!o || typeof o !== "object" || typeof o.label !== "string" || o.label.trim().length < 2) throw new PoolError("Each option needs a label of at least 2 characters");
    options.push({ label: o.label.trim().slice(0, 80), image_url: await storeImage(wallet, str(o, "image_url", 2000), str(o, "image_base64", 3_000_000)) });
  }
  const labels = options.map((o) => o.label.toLowerCase());
  if (new Set(labels).size !== labels.length) throw new PoolError("Options must be unique");
  const cover = await storeImage(wallet, str(p, "cover_image_url", 2000), str(p, "cover_image_base64", 3_000_000));
  const bet = str(p, "bet_token", 12) ?? "usdc";
  if (bet !== "usdc" && bet !== "clawdtrust") throw new PoolError("params.bet_token must be usdc or clawdtrust");
  const params = { title: title.trim().slice(0, 200), description: str(p, "description", 1000) ?? "", cover_image: cover, options, category: str(p, "category", 30) ?? "mentions", betting_closes_at: new Date(ms).toISOString(), bet_token: bet };
  // Programme actif avec marchés restants : création directe, sans validation humaine
  const direct = await createUnderMandate(wallet, params, origin);
  if (direct) return direct;
  const { data, error } = await admin.from("agent_intents").insert({ agent_wallet: wallet, kind: "create_pool", target_id: null, params }).select("id, expires_at").single();
  if (error) throw new PoolError("Could not create the draft");
  return {
    review_url: `${origin}/pools/new/${data.id}`, expires_at: data.expires_at,
    note: "Nothing is created or paid yet. Send this link to your human: they review the market, pay the 0.5 USDC creation fee with their own wallet and create it. It then goes to admin review.",
  };
}

/** Pool de football : titre « A vs B », options Domicile / Nul / Extérieur, logo de la compétition et écussons des équipes, clôture au coup d'envoi. */
async function requestMatchPool(wallet: string, key: string, bet: string, origin: string) {
  if (bet !== "usdc" && bet !== "clawdtrust") throw new PoolError("params.bet_token must be usdc or clawdtrust");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data: m } = await admin.from("live_matches").select("key, kickoff, status, league_logo, home, home_logo, away, away_logo").eq("key", key).maybeSingle();
  if (!m || m.status !== "scheduled" || new Date(m.kickoff).getTime() < Date.now() + 60 * 60 * 1000) throw new PoolError("This match is not available (it must start in more than 1 hour). See list_upcoming_matches.");
  if (!(await rateHit(`pooldraft:${wallet}`, 10, 3600_000))) throw new PoolError("Too many requests, try again later");
  const params = {
    title: `${m.home} vs ${m.away}`, description: "", cover_image: m.league_logo ?? null, category: "sports", bet_token: bet, match_key: m.key,
    options: [{ label: m.home, image_url: m.home_logo ?? null }, { label: "Draw", image_url: null }, { label: m.away, image_url: m.away_logo ?? null }],
    betting_closes_at: new Date(m.kickoff).toISOString(),
  };
  const direct = await createUnderMandate(wallet, params, origin);
  if (direct) return direct;
  const { data, error } = await admin.from("agent_intents").insert({ agent_wallet: wallet, kind: "create_pool", target_id: null, params }).select("id, expires_at").single();
  if (error) throw new PoolError("Could not create the draft");
  return { review_url: `${origin}/pools/new/${data.id}`, expires_at: data.expires_at, note: "Nothing is created or paid yet. Send this link to your human: they pay the creation fee with their own wallet." };
}
