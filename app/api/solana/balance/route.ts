import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL        = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const TOKEN_PROGRAM  = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

function tryPublicKey(str: string): PublicKey | null {
  try { return new PublicKey(str); } catch { return null; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  const mint   = searchParams.get("mint");

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  }

  const walletPk = tryPublicKey(wallet);
  if (!walletPk) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  if (mint) {
    const mintPk = tryPublicKey(mint);
    if (!mintPk) {
      return NextResponse.json({ error: "Invalid mint address" }, { status: 400 });
    }

    try {
      const conn     = new Connection(RPC_URL, "confirmed");
      const accounts = await conn.getTokenAccountsByOwner(walletPk, { mint: mintPk }, "confirmed");
      if (accounts.value.length === 0) {
        return NextResponse.json(
          { raw: 0, decimals: 6, ui: 0 },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      const info = await conn.getTokenAccountBalance(accounts.value[0].pubkey);
      return NextResponse.json(
        {
          raw:      parseInt(info.value.amount, 10),
          decimals: info.value.decimals,
          ui:       info.value.uiAmount ?? 0,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to fetch token balance";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Native SOL balance
  try {
    const conn     = new Connection(RPC_URL, "confirmed");
    const lamports = await conn.getBalance(walletPk);
    return NextResponse.json(
      { lamports, sol: lamports / 1e9 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch balance";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
