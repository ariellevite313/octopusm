# Indexer DRC-20 d'OMdotfun

Lit la chaîne Dogecoin avec un nœud Dogecoin Core, repère les inscriptions Doginals et applique les règles DRC-20
(deploy, mint, transfer en deux temps). Les tokens, soldes, holders et l'historique vont dans la base Supabase d'OMdotfun,
d'où OM les affiche.

- `src/chain.ts` : blocs et transactions bruts (en-têtes AuxPoW compris), scripts, adresses D…
- `src/doginals.ts` : inscriptions (`ord`, morceaux, contenu sur plusieurs transactions)
- `src/drc20.ts` : règles DRC-20 (ticker de 4 caractères insensible à la casse, `dec` 18 par défaut, mint plafonné)
- `src/engine.ts` : traitement d'un bloc (déplacement des inscriptions de transfert, sat par sat)
- `src/db-store.ts`, `sql/drc20.sql` : base de données, un bloc écrit en une seule transaction
- `src/main.ts` : la boucle (6 confirmations, reprise automatique)

Tests : `npm test` (dont deux vrais blocs Dogecoin : 4 700 000 et 4 760 020 avec 994 mints réels).

## Installation sur un serveur gratuit (Oracle Cloud « Always Free »)

Machine ARM (Ampere) de 4 cœurs / 24 Go, Ubuntu, avec un disque de 200 Go.

1. **Nœud Dogecoin** : télécharge Dogecoin Core (version ARM64) depuis dogecoin.com, mets-le dans `/opt/dogecoin`,
   copie `deploy/dogecoin.conf` dans `/home/doge/.dogecoin/` en changeant `rpcuser` et `rpcpassword`,
   puis active `deploy/dogecoind.service` (systemd).
   `prune=1` : le nœud n'efface rien de lui-même ; c'est l'indexer qui efface les blocs déjà lus (`PRUNE_KEEP`).
   Le disque reste ainsi sous les 200 Go.
2. **Base** : dans Supabase (SQL Editor), lance `sql/drc20.sql`.
3. **Indexer** : copie ce dossier dans `/opt/drc20-indexer`, `npm install`, copie `.env.example` en `.env` et remplis-le
   sur le serveur (jamais dans le code ni dans un message), puis active `deploy/drc20-indexer.service`.
4. Suivi : `journalctl -u drc20-indexer -f`.

Le nœud télécharge la chaîne pendant que l'indexer avance derrière lui. Compter 1 à 3 jours pour rattraper le présent.

## Limites connues

- Un transfert dont l'inscription n'est pas la première entrée de la transaction demande le montant des entrées précédentes.
  Sans index des transactions (impossible avec l'élagage), l'indexer les connaît pour les 30 derniers blocs ;
  au-delà il suppose la sortie 0 (cas le plus courant) et l'écrit dans le journal (`approx`).
- Les inscriptions réparties sur plusieurs transactions restent en mémoire : un redémarrage au milieu en perd une.
  Ça ne touche pas le DRC-20 (contenu de moins de 1 Ko, toujours en une transaction).

## Sécurité (mise à jour)

- **Clé limitée** : n'utilise plus la clé `service_role`. Lance la migration `supabase/migrations/20261129_drc20_indexer_role.sql`,
  puis sur ton serveur : `SUPABASE_JWT_SECRET=... node scripts-make-key.mjs` et mets le résultat dans `SUPABASE_KEY` du `.env`.
  Cette clé peut seulement lire les tables DRC-20 et écrire les blocs.
- **Montants exacts des transferts** : l'indexer garde en mémoire les sorties des 200 derniers blocs (`RECENT_BLOCKS`).
  Au-delà, une inscription de transfert est supposée sur la sortie 0. Avec un nœud non élagué et `txindex=1`,
  mets `TXINDEX=1` : les anciens montants sont alors lus sur le nœud (placement toujours exact).
- **Ticker malformé** (caractère nul, moitié de caractère Unicode) : ignoré, il ne bloque plus l'indexer.
