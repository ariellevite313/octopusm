/**
 * GET /api/cron/update-arc-holdings
 *
 * Indexe les événements Transfer(from, to, value) de chaque OMToken Arc V2
 * et met à jour la table arc_holdings (wallet, token_id, balance_raw).
 *
 * Stratégie :
 *  1. Pour chaque token Arc V2, lit le dernier bloc indexé dans arc_indexer_state
 *  2. getLogs Transfer depuis lastBlock+1 jusqu'au bloc courant (par chunks de 2000)
 *  3. Collecte toutes les adresses affectées (from + to, sauf address(0))
 *  4. Lit balanceOf on-chain pour chaque adresse affectée
 *  5. Upsert dans arc_holdings + update arc_indexer_state
 *
 * Vercel cron : toutes les minutes.
 * Sécurisé par CRON_SECRET.
 */

import { NextResponse }                          from "next/server";
import { createPublicClient, http, parseAbiItem } from "viem";
import { arc }                                    from "@/lib/arc-chain";
import { OM_TOKEN_ABI }                           from "@/lib/arc-launchpad";
import { createAdminClient }                      from "@/lib/supabase/server";

const RPC_URL    = "https://rpc.mainnet.arc.io";
const CHUNK_SIZE = 2_000n;  // blocs par getLogs (évite les timeouts RPC)
const ZERO_ADDR  = "0x0000000000000000000000000000000000000000";

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

type ArcToken = {
  id:           string;
  mint_address: string;
};

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin  = createAdminClient() as any;
  const client = createPublicClient({ chain: arc, transport: http(RPC_URL) });

  try {
    // ── 1. Récupérer tous les tokens Arc V2 ──────────────────────────────────
    const { data: tokens, error: tokErr } = await admin
      .from("launchpad_tokens")
      .select("id, mint_address, arc_launch_id")
      .eq("chain", "arc")
      .in("status", ["active", "graduating", "graduated"])
      .not("mint_address",  "is", null)
      .not("arc_launch_id", "is", null);

    if (tokErr) throw tokErr;

    // Filtrer V2 uniquement (arc_launch_id ≠ mint_address)
    const v2Tokens: ArcToken[] = (tokens ?? []).filter((t: { arc_launch_id: string; mint_address: string }) =>
      t.arc_launch_id?.toLowerCase() !== t.mint_address?.toLowerCase()
    );

    if (v2Tokens.length === 0) {
      return NextResponse.json({ indexed: 0, tokens: 0 });
    }

    // ── 2. Bloc courant ───────────────────────────────────────────────────────
    const currentBlock = await client.getBlockNumber();

    let totalUpserts = 0;

    for (const token of v2Tokens) {
      const contractAddr = token.mint_address as `0x${string}`;

      // Lire le dernier bloc indexé pour ce token
      const { data: stateRow } = await admin
        .from("arc_indexer_state")
        .select("last_block")
        .eq("token_id", token.id)
        .maybeSingle();

      const fromBlock = stateRow?.last_block
        ? BigInt(stateRow.last_block) + 1n
        : currentBlock - 100_000n > 0n ? currentBlock - 100_000n : 0n;

      if (fromBlock > currentBlock) continue;

      // ── 3. Scan Transfer events par chunks ───────────────────────────────
      const affectedAddresses = new Set<string>();

      let chunkFrom = fromBlock;
      while (chunkFrom <= currentBlock) {
        const chunkTo = chunkFrom + CHUNK_SIZE - 1n < currentBlock
          ? chunkFrom + CHUNK_SIZE - 1n
          : currentBlock;

        try {
          const logs = await client.getLogs({
            address:   contractAddr,
            event:     TRANSFER_EVENT,
            fromBlock: chunkFrom,
            toBlock:   chunkTo,
          });

          for (const log of logs) {
            const from = (log.args.from as string)?.toLowerCase();
            const to   = (log.args.to   as string)?.toLowerCase();
            if (from && from !== ZERO_ADDR) affectedAddresses.add(from);
            if (to   && to   !== ZERO_ADDR) affectedAddresses.add(to);
          }
        } catch {
          // Chunk trop grand ou RPC error — on passe
        }

        chunkFrom = chunkTo + 1n;
      }

      if (affectedAddresses.size === 0) {
        // Aucun transfer — juste mettre à jour le last_block
        await admin.from("arc_indexer_state").upsert({
          token_id:   token.id,
          last_block: currentBlock.toString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: "token_id" });
        continue;
      }

      // ── 4. Lire balanceOf pour chaque adresse affectée ───────────────────
      const addresses = Array.from(affectedAddresses);
      const balances  = await Promise.all(
        addresses.map(async (addr) => {
          try {
            const raw = await client.readContract({
              address:      contractAddr,
              abi:          OM_TOKEN_ABI,
              functionName: "balanceOf",
              args:         [addr as `0x${string}`],
            }) as bigint;
            return { wallet: addr, balance: raw.toString() };
          } catch {
            return null;
          }
        })
      );

      // ── 5. Upsert arc_holdings ────────────────────────────────────────────
      const rows = balances
        .filter(Boolean)
        .map(b => ({
          wallet:      b!.wallet,
          token_id:    token.id,
          balance_raw: b!.balance,
          updated_at:  new Date().toISOString(),
        }));

      if (rows.length > 0) {
        const { error: upsertErr } = await admin
          .from("arc_holdings")
          .upsert(rows, { onConflict: "wallet,token_id" });

        if (!upsertErr) totalUpserts += rows.length;
      }

      // ── 6. Mettre à jour last_block ───────────────────────────────────────
      await admin.from("arc_indexer_state").upsert({
        token_id:   token.id,
        last_block: currentBlock.toString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "token_id" });
    }

    return NextResponse.json({
      indexed:    totalUpserts,
      tokens:     v2Tokens.length,
      blockHigh:  currentBlock.toString(),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
