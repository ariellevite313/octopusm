-- Intégrité des flux d'argent (audit sécurité).
-- 1) Une seule demande de retrait ouverte par wallet et par token (empêche la course de requêtes parallèles).
-- 2) Un hash de transaction ne peut servir qu'une fois, quelle que soit la casse (adresses Arc).
-- Si un index échoue pour cause de doublons existants, lister puis traiter les doublons :
--   select lower(tx_signature), count(*) from payments group by 1 having count(*) > 1;

create unique index if not exists withdrawal_requests_one_open_per_token
  on withdrawal_requests (wallet_address, token)
  where status in ('pending', 'approved');

create unique index if not exists payments_tx_signature_lower_uniq
  on payments (lower(tx_signature))
  where tx_signature is not null;

create unique index if not exists updown_bets_tx_signature_lower_uniq
  on updown_bets (lower(tx_signature))
  where tx_signature is not null;
