-- Phase 1 du nouveau parrainage : état actuel. LECTURE SEULE, ne modifie rien.
-- Usage : docker exec -i supabase-db psql -U supabase_admin -d postgres < scripts/sql/referral-analysis.sql

\echo '== 1. Parrains et filleuls =='
SELECT count(*)                         AS filleuls_total,
       count(DISTINCT referrer_wallet)  AS parrains_total
FROM referrals;

-- Activité d'un filleul : achats de tokens (trade_rewards) et prédictions (payments non rejetés)
CREATE TEMP VIEW act AS
  SELECT trader AS wallet, volume_usd::numeric AS usd, created_at FROM trade_rewards WHERE kind = 'referral'
  UNION ALL
  SELECT user_wallet, COALESCE(amount_usdc, 0)::numeric, created_at FROM payments
   WHERE status <> 'rejected' AND COALESCE(token, 'usdc') = 'usdc';

\echo '== 2. Filleuls actifs (au moins 1 trade ou 1 prédiction) : tout le temps / 30 jours =='
SELECT count(DISTINCT r.referred_wallet) FILTER (WHERE a.wallet IS NOT NULL)                                  AS actifs_total,
       count(DISTINCT r.referred_wallet) FILTER (WHERE a.created_at > now() - interval '30 days')            AS actifs_30j
FROM referrals r LEFT JOIN act a ON lower(a.wallet) = lower(r.referred_wallet);

\echo '== 3. Taux de conversion inscription -> premier trade ou prédiction =='
SELECT round(100.0 * count(DISTINCT r.referred_wallet) FILTER (WHERE a.wallet IS NOT NULL) / NULLIF(count(DISTINCT r.referred_wallet), 0), 1) AS conversion_pct
FROM referrals r LEFT JOIN act a ON lower(a.wallet) = lower(r.referred_wallet);

\echo '== 4. Volume moyen par filleul actif (USD) =='
SELECT round(avg(v), 2) AS volume_moyen, round(percentile_cont(0.5) WITHIN GROUP (ORDER BY v)::numeric, 2) AS volume_median, round(sum(v), 2) AS volume_total
FROM (SELECT lower(a.wallet) w, sum(a.usd) v FROM act a JOIN referrals r ON lower(r.referred_wallet) = lower(a.wallet) GROUP BY 1) t;

\echo '== 5. Gains moyens par parrain (USDC versés, tout le temps) =='
SELECT count(*) AS parrains_payes, round(avg(g), 4) AS gain_moyen, round(max(g), 4) AS gain_max, round(sum(g), 4) AS total_verse
FROM (SELECT referrer_wallet, sum(amount_usdc) g FROM referral_commissions GROUP BY 1) t;

\echo '== 6. Frais de la plateforme sur les achats des filleuls, et coût du parrainage actuel (30 jours) =='
SELECT round(sum(platform_fee_usd), 4) AS frais_plateforme_30j,
       round(sum(amount_usdc), 4)      AS verse_aux_parrains_30j,
       round(100 * sum(amount_usdc) / NULLIF(sum(platform_fee_usd), 0), 1) AS part_reversee_pct
FROM trade_rewards WHERE kind = 'referral' AND created_at > now() - interval '30 days';

\echo '== 7. Simulation du nouveau barème sur les 30 derniers jours (N1 15 %, N2 5 %) =='
WITH t AS (
  SELECT tr.platform_fee_usd fee, r2.referrer_wallet AS n2
  FROM trade_rewards tr
  JOIN referrals r1 ON lower(r1.referred_wallet) = lower(tr.trader)
  LEFT JOIN referrals r2 ON lower(r2.referred_wallet) = lower(r1.referrer_wallet)
  WHERE tr.kind = 'referral' AND tr.created_at > now() - interval '30 days'
)
SELECT round(sum(fee), 4)                                         AS frais_plateforme,
       round(sum(fee) * 0.10, 4)                                  AS cout_actuel_10pct,
       round(sum(fee) * 0.15, 4)                                  AS cout_n1_15pct,
       round(sum(fee) FILTER (WHERE n2 IS NOT NULL) * 0.05, 4)    AS cout_n2_5pct,
       round(sum(fee) * 0.15 + COALESCE(sum(fee) FILTER (WHERE n2 IS NOT NULL), 0) * 0.05, 4) AS cout_nouveau_total,
       round(sum(fee) * 0.20, 4)                                  AS cout_si_20pct_60j
FROM t;

\echo '== 8. Coût du bonus « 2 USDC au premier trade » sur les 30 derniers jours =='
SELECT count(*) AS nouveaux_premiers_trades_30j, count(*) * 2 AS cout_bonus_usdc
FROM (SELECT lower(a.wallet) w, min(a.created_at) first_at FROM act a JOIN referrals r ON lower(r.referred_wallet) = lower(a.wallet) GROUP BY 1) t
WHERE first_at > now() - interval '30 days';

\echo '== 9. Top 20 parrains (gains versés) =='
SELECT referrer_wallet, round(sum(amount_usdc), 4) AS gains_usdc, count(DISTINCT referred_wallet) AS filleuls_payants
FROM referral_commissions GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
