import { describe, expect, it } from "vitest";
import { Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { assertOrderTx } from "@/lib/swap/jup-trigger";
import { SWAP_FEE_WALLET } from "@/lib/swap/core";

const bh = "11111111111111111111111111111111";
function tx(payer: Keypair, to: PublicKey | null, sign = true) {
  const ix = [SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: to ?? Keypair.generate().publicKey, lamports: 1000 })];
  const v = new VersionedTransaction(new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: bh, instructions: ix }).compileToV0Message());
  if (sign) v.sign([payer]);
  return Buffer.from(v.serialize()).toString("base64");
}

describe("garde-fou de l'envoi direct des ordres", () => {
  const me = Keypair.generate();
  const fee = new PublicKey(SWAP_FEE_WALLET);
  it("accepte la transaction signée avec les frais OM", () => {
    expect(() => assertOrderTx(tx(me, fee), me.publicKey.toBase58())).not.toThrow();
  });
  it("refuse une transaction sans les frais OM", () => {
    expect(() => assertOrderTx(tx(me, null), me.publicKey.toBase58())).toThrow();
  });
  it("refuse la transaction d'un autre wallet", () => {
    expect(() => assertOrderTx(tx(Keypair.generate(), fee), me.publicKey.toBase58())).toThrow();
  });
  it("refuse une transaction non signée ou illisible", () => {
    expect(() => assertOrderTx(tx(me, fee, false), me.publicKey.toBase58())).toThrow();
    expect(() => assertOrderTx("AAAA", me.publicKey.toBase58())).toThrow();
  });
});
