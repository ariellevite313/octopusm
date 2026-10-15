import type { Metadata } from "next";

export const metadata: Metadata = { title: "Agent API", description: "Launch tokens on OMdotfun from code: AI agents, bots and scripts." };

const FLOW = `import { Keypair, Transaction } from "@solana/web3.js";
import bs58 from "bs58";

const BASE = "https://omdot.fun/api/v1/launch";
const kp = Keypair.fromSecretKey(bs58.decode(process.env.AGENT_SECRET_KEY!));
const wallet = kp.publicKey.toBase58();
const post = (url, body) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; });
const sign = (b64) => {
  const tx = Transaction.from(Buffer.from(b64, "base64"));
  tx.partialSign(kp);                       // keeps the server's existing signatures
  return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
};

// 1. create + prepare
const { token_id, mint, tx_a, tx_b } = await post(BASE, {
  wallet, name: "Agent Coin", ticker: "AGNT", description: "Launched by an AI agent", category: "AI",
});

// 2. platform fee + mint (skipped when tx_a is null: the fee was already paid on a retry)
if (tx_a) await post(\`\${BASE}/\${token_id}/submit\`, { wallet, step: "a", signed_tx_base64: sign(tx_a) });

// 3. Meteora pool
const { signature } = await post(\`\${BASE}/\${token_id}/submit\`, { wallet, step: "b", signed_tx_base64: sign(tx_b) });

// 4. go live
const done = await post(\`\${BASE}/\${token_id}/confirm\`, { wallet, tx_signature: signature });
console.log(done.url, mint);`;

export default function AgentsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-foreground">Agent API</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        AI agents, bots and scripts can launch a Solana token on OMdotfun with four HTTP calls. The server never holds your key:
        every transaction is signed by the creator wallet, exactly like a launch from the website.
      </p>

      <h2 className="mt-8 text-lg font-semibold text-foreground">Requirements</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>A Solana keypair with enough SOL for the platform fee and network fees (plus your first buy, if any).</li>
        <li>Meme tokens on Solana only. Scheduled launches, xStock-paired tokens and Arc tokens are web-only for now.</li>
        <li>Rate limit: 3 launches per wallet and 6 per IP per hour.</li>
        <li>Blockhashes expire in about 60 seconds: sign right after each call. To refresh, POST <code>{"{ wallet }"}</code> to <code>/api/v1/launch/&#123;id&#125;</code>.</li>
      </ul>

      <h2 className="mt-8 text-lg font-semibold text-foreground">Endpoints</h2>
      <div className="mt-2 overflow-x-auto rounded-xl border border-border text-sm">
        <table className="w-full">
          <tbody className="divide-y divide-border">
            {[
              ["GET", "/api/v1/launch", "Machine-readable description of the flow"],
              ["POST", "/api/v1/launch", "wallet, name, ticker, description, category?, logo_base64?, logo_mime?, website?, twitter?, telegram?, supply?, first_buy_sol? → token_id, mint, tx_a, tx_b"],
              ["POST", "/api/v1/launch/{id}/submit", "wallet, step (a|b), signed_tx_base64 → signature, status"],
              ["POST", "/api/v1/launch/{id}/confirm", "wallet, tx_signature (step b) → ok, pool_address, url"],
              ["GET", "/api/v1/launch/{id}", "Status of a launch"],
              ["POST", "/api/v1/launch/{id}", "wallet → fresh tx_a / tx_b (new blockhash)"],
            ].map(([m, p, d]) => (
              <tr key={m + p}>
                <td className="px-3 py-2 font-mono text-xs font-semibold text-foreground">{m}</td>
                <td className="px-3 py-2 font-mono text-xs text-foreground">{p}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-foreground">Example (Node.js)</h2>
      <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-muted/40 p-4 text-xs leading-relaxed text-foreground">{FLOW}</pre>

      <p className="mt-6 text-xs text-muted-foreground">
        Categories: Meme, Utility, AI, Gaming, DeFi, NFT, x402. Logo: PNG, JPEG, WebP or GIF, 5 MB max, sent as base64.
        Creators earn 1% of trading fees, as on the website.
      </p>
    </main>
  );
}
