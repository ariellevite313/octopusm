/** GET /api/swap/evm/token?chain=…&token=0x… : symbole, décimales et soldes (natif + token) du portefeuille EVM connecté. */
import { NextResponse } from "next/server";
import { createPublicClient, erc20Abi, http } from "viem";
import { getWalletAddress } from "@/lib/auth/get-wallet";
import { EVM_CHAINS, isAddr, isEvmChain } from "@/lib/swap/evm";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const chain = u.searchParams.get("chain"), token = u.searchParams.get("token");
  if (!isEvmChain(chain) || !isAddr(token)) return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  const client = createPublicClient({ transport: http(EVM_CHAINS[chain].rpc) });
  const t = token as `0x${string}`;
  try {
    const [decimals, symbol] = await Promise.all([
      client.readContract({ address: t, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: t, abi: erc20Abi, functionName: "symbol" }).catch(() => "TOKEN"),
    ]);
    // Wallet EVM de la session ; sinon l'adresse EVM passée par le client (compte de trading, lecture publique)
    const session = await getWalletAddress();
    const given = u.searchParams.get("address");
    const w = session && session.startsWith("0x") ? session : isAddr(given) ? given : null;
    let balances: { native: string; token: string } | null = null;
    if (w && w.startsWith("0x")) {
      const [n, b] = await Promise.all([
        client.getBalance({ address: w as `0x${string}` }),
        client.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [w as `0x${string}`] }),
      ]);
      balances = { native: n.toString(), token: b.toString() };
    }
    return NextResponse.json({ token: { address: token, decimals: Number(decimals), symbol: String(symbol).slice(0, 16) }, chain: { id: EVM_CHAINS[chain].id, native: EVM_CHAINS[chain].native }, balances }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Token not found" }, { status: 404 });
  }
}
