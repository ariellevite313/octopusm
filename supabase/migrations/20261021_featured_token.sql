-- Token recommandé affiché à côté du nom (logo seulement). Uniquement un token lancé sur OMdotfun.
alter table wallets add column if not exists featured_token_id uuid references launchpad_tokens (id) on delete set null;
