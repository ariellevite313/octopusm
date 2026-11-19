/**
 * Résolution d'un pool (marché de prédiction mutuel) : gains des gagnants, frais du créateur, commissions de parrainage,
 * récompense de partage. Utilisée par l'admin et par la résolution automatique des pools de token.
 * Retourne le corps et le statut HTTP de la réponse (même comportement que l'ancienne route admin).
 */
import { revalidatePath } from "next/cache";
import { distributePoolShare } from "@/lib/social/share-rewards";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolvePool(sb: any, marketId: string, winning_option_id: string, adminWallet: string | null): Promise<{ status: number; body: Record<string, unknown> }> {
  const out = (body: Record<string, unknown>, init?: { status?: number }) => ({ status: init?.status ?? 200, body });

    const { data: market, error: mErr } = await sb
      .from("mutuel_markets")
      .select("*")
      .eq("id", marketId)
      .single();

    if (mErr || !market) return out({ error: "Market not found" }, { status: 404 });
    // BUG-22 fix: only allow resolution from "closed" status.
    // Resolving an "active" market would leave pending on-chain payments orphaned
    // (admin can't approve them since market.status !== "active" after resolution).
    if (market.status !== "closed")
      return out({ error: "Market must be closed before it can be resolved" }, { status: 400 });

    const options = typeof market.options === "string" ? JSON.parse(market.options) : market.options;
    const validOption = options.some((o: { id: string }) => o.id === winning_option_id);
    if (!validOption)
      return out({ error: "Invalid winning option" }, { status: 400 });

    const { data: allBets, error: bErr } = await sb
      .from("mutuel_bets")
      .select("*")
      .eq("market_id", marketId)
      .eq("status", "approved"); // seules les mises approuvées comptent (pas de pending / rejected)

    if (bErr) return out({ error: bErr.message }, { status: 500 });

    const bets = allBets ?? [];
    // mutuel_markets has no bet_token column — derive token from the bets themselves.
    // All bets in a single market use the same token (enforced at bet placement).
    const token: string = (bets[0]?.token ?? "usdc") as string;
    // Sécurité : jamais de résolution d'un marché aux mises en monnaies mélangées (les montants ne s'additionnent pas)
    if (bets.some((b: { token?: string | null }) => (b.token ?? "usdc") !== token)) {
      return out({ error: "This market has bets in several tokens. Reject the odd ones before resolving." }, { status: 409 });
    }
    const totalPool: number = bets.reduce((s: number, b: { amount: number }) => s + Number(b.amount), 0);

    const winningBets = bets.filter((b: { option_id: string }) => b.option_id === winning_option_id);
    const losingBets  = bets.filter((b: { option_id: string }) => b.option_id !== winning_option_id);
    const winningTotal: number = winningBets.reduce((s: number, b: { amount: number }) => s + Number(b.amount), 0);
    const losingTotal:  number = losingBets.reduce((s: number, b: { amount: number }) => s + Number(b.amount), 0);

    // ── Fee structure ─────────────────────────────────────────────────────────
    // Rule 1 : 1% du volume total → créateur du marché
    // Rule 2 : 10% des fonds des perdants (USDC) / 8% (CLT) → plateforme
    // Rule 3 : 5% sur chaque retrait individuel (appliqué côté /api/pools/winnings)
    const CREATOR_RATE     = 0.01;
    const HOUSE_LOSER_RATE = 0.10; // 10% des perdants (USDC et CLT)
    const creatorShare = totalPool * CREATOR_RATE;
    const commission   = losingTotal * HOUSE_LOSER_RATE;
    const winnersPool  = totalPool - creatorShare - commission;

    // Fairness rule: if nobody bet against the winner, no losers fund the pool,
    // so commission would come out of winners' own pockets. Refund everyone instead.
    const allBetOnWinner = losingBets.length === 0 && winningBets.length > 0;

    // Le marché passe en « resolved » AVANT les gains et les frais : un second appel simultané s'arrête ici.

    // Store applied rates on the market for frontend transparency (BUG-23 fix)
    const ratesNote = allBetOnWinner
      ? "REFUND: all bettors chose the winning option, no commission taken"
      : `RATES:${JSON.stringify({
          creator_pct: CREATOR_RATE,
          house_on_losers_pct: HOUSE_LOSER_RATE,
          withdrawal_fee_pct: 0.05,
          losing_pool: losingTotal,
          creator_share: creatorShare,
          house_share: commission,
          winners_pool: winnersPool,
        })}`;

    const { data: resolvedRows, error: resolveErr } = await sb
      .from("mutuel_markets")
      .update({
        status: "resolved",
        winning_option_id,
        resolved_at: new Date().toISOString(),
        resolved_by_wallet: adminWallet,
        is_refund: allBetOnWinner,
        admin_notes: ratesNote,
      })
      .eq("id", marketId)
      .eq("status", "closed") // verrou : une seule résolution, même avec deux clics simultanés
      .select("id");

    if (resolveErr) return out({ error: resolveErr.message }, { status: 500 });
    if (!resolvedRows?.length) return out({ error: "Market already resolved" }, { status: 409 });

    // M-02 fix: log errors on individual payout updates so partial failures are visible
    const resolveErrors: string[] = [];

    if (allBetOnWinner) {
      for (const bet of winningBets) {
        const { error: updateErr } = await sb.from("mutuel_bets")
          .update({ payout_amount: Number(bet.amount) })
          .eq("id", bet.id);
        if (updateErr) resolveErrors.push(`bet ${bet.id}: ${updateErr.message}`);
      }
    } else if (winningTotal > 0) {
      // Normal: winners split the winners pool proportionally
      for (const bet of winningBets) {
        const share = Number(bet.amount) / winningTotal;
        const payout = Math.floor(share * winnersPool * 1_000_000) / 1_000_000;
        const { error: updateErr } = await sb.from("mutuel_bets").update({ payout_amount: payout }).eq("id", bet.id);
        if (updateErr) resolveErrors.push(`bet ${bet.id}: ${updateErr.message}`);
      }
    }
    // else winningTotal === 0 with losers: house keeps pool, no payouts

    if (resolveErrors.length > 0) {
      console.error("[pools/resolve] Some payout updates failed:", resolveErrors);
    }


    if (allBetOnWinner) {
      return out({
        ok: true,
        refund: true,
        summary: { token, total_pool: totalPool, refunded_count: winningBets.length },
      });
    }

    // ── Creator fee — insert a mutuel_bets row so it appears in the creator's balance ──
    // status "creator_fee" is excluded from volume + loss stats in dashboard-service.ts
    if (market.creator_wallet && creatorShare > 0) {
      const { error: creatorFeeErr } = await sb.from("mutuel_bets").insert({
        market_id:      marketId,
        wallet_address: market.creator_wallet,
        option_id:      "creator_fee",
        amount:         creatorShare,
        token:          token,  // derived from bets above (market has no bet_token column)
        payout_amount:  creatorShare,
        status:         "creator_fee",
      });
      if (creatorFeeErr) {
        // Log but don't block the response — market is already resolved
        console.error("[pools/resolve] creator fee insert failed:", creatorFeeErr.message);
      }
    }

    // ── Referral commissions ───────────────────────────────────────────────
    // Rule A: 1% of each loser's bet amount → referrer of that loser
    // Rule B: 1% of the creator's fee       → referrer of the creator
    // One batch query then one batch insert — no N+1.
    {
      const isClt = token === "clawdtrust" || token === "clt";

      // Collect unique wallets to look up in one query
      const walletsToCheck: string[] = [
        ...losingBets.map((b: any) => b.wallet_address as string),
        ...(market.creator_wallet ? [market.creator_wallet as string] : []),
      ].filter(Boolean);

      if (walletsToCheck.length > 0) {
        const { data: referralRows } = await sb
          .from("referrals")
          .select("referred_wallet, referrer_wallet")
          .in("referred_wallet", walletsToCheck);

        // Build a map: referred_wallet → referrer_wallet
        const referrerMap: Record<string, string> = {};
        for (const r of referralRows ?? []) {
          referrerMap[r.referred_wallet] = r.referrer_wallet;
        }

        const commissionInserts: Array<{
          referrer_wallet: string;
          referred_wallet: string;
          amount_usdc: number;
          amount_clt: number;
        }> = [];

        // Rule A — loser commissions
        for (const bet of losingBets as any[]) {
          const referrer: string | undefined = referrerMap[bet.wallet_address];
          if (!referrer) continue;
          const commission = Math.round(Number(bet.amount) * 0.01 * 1_000_000) / 1_000_000;
          if (commission <= 0) continue;
          commissionInserts.push({
            referrer_wallet: referrer,
            referred_wallet: bet.wallet_address,
            amount_usdc:     isClt ? 0 : commission,
            amount_clt:      isClt ? commission : 0,
          });
        }

        // Rule B — creator fee commission
        if (market.creator_wallet && creatorShare > 0) {
          const creatorReferrer: string | undefined = referrerMap[market.creator_wallet];
          if (creatorReferrer) {
            const commission = Math.round(creatorShare * 0.01 * 1_000_000) / 1_000_000;
            if (commission > 0) {
              commissionInserts.push({
                referrer_wallet: creatorReferrer,
                referred_wallet: market.creator_wallet,
                amount_usdc:     isClt ? 0 : commission,
                amount_clt:      isClt ? commission : 0,
              });
            }
          }
        }

        if (commissionInserts.length > 0) {
          const { error: commErr } = await sb
            .from("referral_commissions")
            .insert(commissionInserts);
          if (commErr) {
            console.error("[pools/resolve] referral_commissions insert failed:", commErr.message);
          }
        }
      }
    }

    // ── Récompense de partage : 20 % de la commission plateforme aux auteurs des posts ──
    await distributePoolShare(sb, market.id, bets as { wallet_address: string; amount: number }[], commission, token === "clawdtrust" || token === "clt");

    revalidatePath("/pools");
    return out({
      ok: true,
      refund: false,
      summary: {
        token,
        total_pool: totalPool,
        losing_pool: losingTotal,
        house_from_losers: commission,
        creator_share: creatorShare,
        winners_pool: winnersPool,
        winner_count: winningBets.length,
        loser_count: losingBets.length,
        rates: {
          creator_pct: CREATOR_RATE,
          house_on_losers_pct: HOUSE_LOSER_RATE,
          withdrawal_fee_pct: 0.05,
        },
      },
    });
  }
