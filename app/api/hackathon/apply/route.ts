/**
 * POST /api/hackathon/apply
 * Candidature d'un token OM au hackathon. Rien n'est cru du client :
 *  - le wallet vient de la session ET doit signer un message (preuve de contrôle) ;
 *  - le token doit exister sur OM, être actif, et son créateur lu sur la chaîne doit être ce wallet ;
 *  - le site doit répondre en https.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireWallet } from "@/lib/social/session";
import { verifyWalletSignature } from "@/lib/launch/wallet-signature";
import { verifyTokenCreator } from "@/lib/launch/verify-creator";
import { HACKATHON, hackathonPhase } from "@/lib/hackathon/config";
import { validateApplication, siteIsReachable, type ApplicationInput } from "@/lib/hackathon/apply";

type Body = ApplicationInput & { mintAddress?: string; issuedAt?: number; signature?: string };

const sameWallet = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function POST(req: Request) {
  const who = await requireWallet();
  if ("error" in who) return who.error;

  const phase = hackathonPhase();
  if (phase === "soon") return NextResponse.json({ error: `Applications open on ${HACKATHON.startsAt.slice(0, 10)}` }, { status: 403 });
  if (phase === "ended") return NextResponse.json({ error: "Applications are closed" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || typeof body.mintAddress !== "string" || typeof body.signature !== "string" || typeof body.issuedAt !== "number") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const valid = validateApplication(body, who.wallet);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: token } = await db
    .from("launchpad_tokens")
    .select("id, status, chain, creator_wallet, mint_address, pool_address, arc_launch_id, creator_verified")
    .ilike("mint_address", body.mintAddress.trim())
    .maybeSingle();
  if (!token) return NextResponse.json({ error: "This token was not launched on OM" }, { status: 404 });
  if (!["active", "graduating", "graduated"].includes(token.status)) return NextResponse.json({ error: "This token is not active yet" }, { status: 409 });
  if (!sameWallet(String(token.creator_wallet ?? ""), who.wallet)) {
    return NextResponse.json({ error: "Connect the wallet that launched this token" }, { status: 403 });
  }

  // Preuve de contrôle du wallet : signature du message d'action
  const sig = await verifyWalletSignature({
    chain: who.wallet.startsWith("0x") ? "evm" : "solana",
    action: "hackathon-apply", targetId: body.mintAddress.trim(), wallet: who.wallet,
    issuedAt: body.issuedAt, signature: body.signature,
  });
  if (!sig.ok) return NextResponse.json({ error: "Invalid or expired signature" }, { status: 403 });

  // Créateur relu sur la chaîne (les tokens lancés avant la vérification sont vérifiés ici)
  if (!token.creator_verified) {
    const verdict = await verifyTokenCreator(token);
    if (verdict !== "ok") return NextResponse.json({ error: "Creator could not be verified on-chain" }, { status: 403 });
    await db.from("launchpad_tokens").update({ creator_verified: true, creator_verified_at: new Date().toISOString() }).eq("id", token.id);
  }

  if (!(await siteIsReachable(valid.value.siteUrl))) {
    return NextResponse.json({ error: "Your website does not respond over https" }, { status: 422 });
  }

  const v = valid.value;
  const { error } = await db.from("hackathon_projects").insert({
    token_id: token.id, applicant: who.wallet, name: v.name, description: v.description, site_url: v.siteUrl,
    github_url: v.githubUrl, x_handle: v.xHandle, video_url: v.videoUrl, category: v.category, team_wallets: v.teamWallets,
  });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "This token is already registered" }, { status: 409 });
    console.error("[hackathon/apply]", error.message);
    return NextResponse.json({ error: "Could not register the project" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
