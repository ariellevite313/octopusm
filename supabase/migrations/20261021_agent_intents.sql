-- Propositions d'un agent IA qu'un humain approuve (ou refuse) depuis /approve/<id>.
-- Aucune somme ne bouge ici : l'humain confirme ensuite sur l'écran normal du site, avec son wallet.
create table if not exists agent_intents (
  id           uuid primary key default gen_random_uuid(),
  agent_wallet text not null,
  kind         text not null check (kind in ('bet_pool', 'buy_token', 'sell_token')),
  target_id    uuid not null,
  params       jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending', 'opened', 'rejected')),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_agent_intents_agent on agent_intents (agent_wallet, created_at desc);
alter table agent_intents enable row level security;
