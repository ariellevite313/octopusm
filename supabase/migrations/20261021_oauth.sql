-- Connexion « en un clic » des assistants IA (Claude, ChatGPT…) au MCP via OAuth 2.1 (PKCE).
-- Les jetons sont stockés hachés (sha256), jamais en clair.
create table if not exists oauth_clients (
  client_id     text primary key,
  client_name   text not null,
  redirect_uris text[] not null,
  created_at    timestamptz not null default now()
);

create table if not exists oauth_codes (
  code_hash      text primary key,
  client_id      text not null references oauth_clients (client_id) on delete cascade,
  wallet         text not null,
  redirect_uri   text not null,
  code_challenge text not null,
  scopes         text[] not null,
  expires_at     timestamptz not null,
  used           boolean not null default false
);

create table if not exists oauth_tokens (
  id                 uuid primary key default gen_random_uuid(),
  client_id          text not null references oauth_clients (client_id) on delete cascade,
  wallet             text not null,
  scopes             text[] not null,
  access_hash        text not null unique,
  access_expires_at  timestamptz not null,
  refresh_hash       text not null unique,
  refresh_expires_at timestamptz not null,
  revoked            boolean not null default false,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz
);
create index if not exists idx_oauth_tokens_wallet on oauth_tokens (wallet);

alter table oauth_clients enable row level security;
alter table oauth_codes   enable row level security;
alter table oauth_tokens  enable row level security;
