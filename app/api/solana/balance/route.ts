import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

const RPC_URL = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  }

  try {
    const conn = new Connection(RPC_URL, "confirmed");
    const lamports = await conn.getBalance(new PublicKey(wallet));
    return NextResponse.json({ lamports, sol: lamports / 1e9 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to fetch balance";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
