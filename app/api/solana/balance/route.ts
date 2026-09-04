import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  const mint   = searchParams.get("mint"); // optional — if provided, returns SPL token balance

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  }

  try {
    const conn = new Connection(RPC_URL, "confirmed");

    if (mint) {
      // SPL token balance — find token accounts without needing @solana/spl-token
      const walletPk = new PublicKey(wallet);
      const mintPk   = new PublicKey(mint);
      const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
      const accounts = await conn.getTokenAccountsByOwner(walletPk, { mint: mintPk }, "confirmed");
      if (accounts.value.length === 0) {
        return NextResponse.json({ raw: 0, decimals: 6, ui: 0 });
      }
      const info = await conn.getTokenAccountBalance(accounts.value[0].pubkey);
      return NextResponse.json({
        raw:      parseInt(info.value.amount, 10),
        decimals: info.value.decimals,
        ui:       info.value.uiAmount ?? 0,
      });
    }

    // Native SOL balance
    const lamports = await conn.getBalance(new PublicKey(wallet));
    return NextResponse.json({ lamports, sol: lamports / 1e9 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch balance";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
