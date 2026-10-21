-- Gains sur les trades de tokens :
--  - parrain : part des frais de la plateforme sur les achats de ses filleuls
--  - post    : part des frais de la plateforme sur les achats faits depuis un post (bouton Trade)
-- Les gains sont versés dans referral_commissions (même solde, même retrait que le parrainage).

create table if not exists trade_attributions (
  token_id   uuid not null references launchpad_tokens (id) on delete cascade,
  trader     text not null,
  post_id    uuid not null references posts (id) on delete cascade,
  sharer     text not null,
  created_at timestamptz not null default now(),
  primary key (token_id, trader),
  check (sharer <> trader)
);
create index if not exists idx_trade_attr_sharer on trade_attributions (sharer);

create table if not exists trade_rewards (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('referral', 'post')),
  tx_id            text not null,                 -- signature Solana ou tx_hash:log_index Arc
  beneficiary      text not null,
  trader           text not null,
  token_id         uuid,
  chain            text not null,
  volume_usd       numeric not null,
  platform_fee_usd numeric not null,
  amount_usdc      numeric not null check (amount_usdc > 0),
  created_at       timestamptz not null default now(),
  unique (kind, tx_id)                            -- un trade ne paie qu'une fois par type
);
create index if not exists idx_trade_rewards_beneficiary on trade_rewards (beneficiary, created_at desc);

alter table trade_attributions enable row level security;
alter table trade_rewards      enable row level security;

-- Atomique : écrit le registre ET le solde ensemble, ou rien. Faux si ce trade a déjà payé.
create or replace function award_trade_reward(
  p_kind text, p_tx text, p_beneficiary text, p_trader text, p_token uuid,
  p_chain text, p_volume numeric, p_fee numeric, p_amount numeric
) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  if p_amount is null or p_amount <= 0 or p_beneficiary = p_trader then return false; end if;
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
