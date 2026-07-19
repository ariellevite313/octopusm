-- ─── withdrawal_requests ────────────────────────────────────────────────────
-- Stores user-initiated withdrawal requests (Option B: admin approves & pays)

create type withdrawal_status as enum ('pending', 'approved', 'rejected', 'paid');
create type withdrawal_token  as enum ('usdc', 'clawdtrust');

create table if not exists withdrawal_requests (
  id               uuid primary key default gen_random_uuid(),
  wallet_address   text        not null,
  token            withdrawal_token not null,
  amount           numeric(18, 6) not null check (amount > 0),
  status           withdrawal_status not null default 'pending',
  -- Admin fields
  reviewed_by      text        null,
  reviewed_at      timestamptz null,
  rejection_reason text        null,
  paid_tx          text        null,   -- on-chain tx signature when paid
  paid_at          timestamptz null,
  -- Audit
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Index for user lookups
create index withdrawal_requests_wallet_idx on withdrawal_requests (wallet_address, created_at desc);
-- Index for admin pending queue
create index withdrawal_requests_status_idx on withdrawal_requests (status, created_at desc);

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger withdrawal_requests_updated_at
  before update on withdrawal_requests
  for each row execute procedure set_updated_at();

-- RLS: users can only read their own rows; inserts go through service key (API)
alter table withdrawal_requests enable row level security;

create policy "Users read own withdrawals"
  on withdrawal_requests for select
  using (wallet_address = auth.jwt() ->> 'wallet_address');

-- Admins use service key (bypasses RLS) — no extra policy needed
