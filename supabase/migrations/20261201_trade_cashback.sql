-- Cashback des traders : une part des frais OM de chaque trade revient au trader lui-même.
-- Même registre (trade_rewards) et même solde (referral_commissions, retrait USDC) que les gains de parrainage.

alter table trade_rewards drop constraint if exists trade_rewards_kind_check;
alter table trade_rewards add constraint trade_rewards_kind_check check (kind in ('referral', 'post', 'cashback'));

create or replace function award_trade_reward(
  p_kind text, p_tx text, p_beneficiary text, p_trader text, p_token uuid,
  p_chain text, p_volume numeric, p_fee numeric, p_amount numeric
) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if p_amount is null or p_amount <= 0 then return false; end if;
  -- Jamais pour soi-même, sauf le cashback (qui est par définition pour le trader)
  if p_kind <> 'cashback' and p_beneficiary = p_trader then return false; end if;
  if p_kind = 'cashback' and p_beneficiary <> p_trader then return false; end if;
  -- Garde-fou : un gain ne dépasse jamais 20 % des frais de la plateforme sur ce trade
  if p_fee is null or p_fee <= 0 or p_amount > p_fee * 0.2 then return false; end if;
  insert into trade_rewards (kind, tx_id, beneficiary, trader, token_id, chain, volume_usd, platform_fee_usd, amount_usdc)
  values (p_kind, p_tx, p_beneficiary, p_trader, p_token, p_chain, p_volume, p_fee, p_amount)
  on conflict (kind, tx_id) do nothing;
  get diagnostics ok = row_count;
  if not ok then return false; end if;
  insert into referral_commissions (referrer_wallet, referred_wallet, amount_usdc, amount_clt)
  values (p_beneficiary, 'trade:' || p_kind || ':' || p_tx, p_amount, 0);
  return true;
end $$;
revoke all on function award_trade_reward(text, text, text, text, uuid, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function award_trade_reward(text, text, text, text, uuid, text, numeric, numeric, numeric) to service_role;
