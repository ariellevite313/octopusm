-- Token launch requests submitted from /launch page
create table if not exists public.token_launches (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  wallet_address  text not null,
  token_name      text not null,
  symbol          text not null,
  description     text,
  mint_address    text not null,
  logo_name       text,
  whitepaper_name text,
  project_x_url       text,
  project_telegram_url text,
  project_discord_url  text,
  developer_wallets    text[] default '{}',
  launch_option   text not null check (launch_option in ('free', 'standard')),
  fee_amount_sol  numeric(10, 4) not null,
  initial_buy_enabled boolean default true,
  initial_buy_percent int default 1 check (initial_buy_percent between 1 and 5),
  status          text not null default 'pending'
                    check (status in ('pending', 'paid', 'submitted', 'rejected')),
  bags_request_id text,
  tx_signature    text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- RLS
alter table public.token_launches enable row level security;

-- Users can read their own launches
create policy "users_read_own_launches"
  on public.token_launches for select
  using (auth.uid() = user_id);

-- Users can insert their own launches
create policy "users_insert_own_launches"
  on public.token_launches for insert
  with check (auth.uid() = user_id);

-- Admins can do everything
create policy "admins_all_launches"
  on public.token_launches for all
  using (
    exists (
      select 1 from public.admins
      where wallet_address = (
        select (raw_user_meta_data->>'wallet_address')
        from auth.users where id = auth.uid()
      )
    )
  );

-- Index
create index if not exists idx_token_launches_user_id on public.token_launches(user_id);
create index if not exists idx_token_launches_status  on public.token_launches(status);

-- Updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_token_launches_updated_at on public.token_launches;
create trigger trg_token_launches_updated_at
  before update on public.token_launches
  for each row execute function public.set_updated_at();
