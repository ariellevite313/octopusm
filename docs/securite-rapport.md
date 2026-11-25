# Rapport de sécurité OMdot.fun

Revue du 25 novembre 2026. Aucune clé, aucun secret n'a été lu, affiché ou demandé.

## Résultat des 27 points

| # | Point | État |
|---|---|---|
| 1 | Historique git sans secrets | OK. Aucune clé privée, aucun jeton `sk-`, `AKIA`, `xox` dans l'historique. Seuls les fichiers `.env*.example` sont suivis |
| 2 | Aucune clé dans le code | OK. Aucune correspondance dans les fichiers suivis |
| 3 | Variables d'environnement | OK. `.env` et `.env.*` ignorés par git. Aucune variable `NEXT_PUBLIC_` ne contient de secret. `SERVICE_ROLE`, `CRON_SECRET` et `PRIVATE_KEY` absents des composants |
| 4 | Prix et paiements vérifiés côté serveur | OK. Les transactions sont relues sur la chaîne (lancement, frais, swaps, prédictions). Les montants sont recalculés et comparés |
| 5 | Validation des formulaires | OK. Types, bornes, longueurs vérifiés dans les routes |
| 6 | XSS | OK. Seuls 3 `dangerouslySetInnerHTML`, tous sur du contenu fixe du site. CSP active, `object-src 'none'` |
| 7 | Requêtes paramétrées | OK. Client Supabase uniquement, pas de SQL assemblé à la main |
| 8 | Fichiers envoyés | OK. Type réel lu dans les octets (`sniffImage`), taille limitée, nom aléatoire, modération d'image |
| 9 | Liens qui expirent | OK pour les approbations et jetons OAuth. Pas de lien privé permanent |
| 10 | Vraie authentification | OK. Session Supabase vérifiée côté serveur, wallet lié au compte |
| 11 | Mots de passe hachés | Sans objet : pas de mot de passe, connexion par wallet ou X (Privy) |
| 12 | Routes admin fermées | OK. `requireAdminApi` / `requireAdmin` partout, middleware sur `/admin`. L'ancienne route de debug renvoie 404 |
| 13 | Cookies sécurisés | OK. Cookies de session gérés par Supabase SSR (HttpOnly, SameSite Lax, Secure en HTTPS) |
| 14 | CSRF | **Corrigé.** Contrôle de l'en-tête Origin sur toutes les écritures `/api` (hors OAuth, v1, cron, MCP). Une page d'un autre site reçoit 403 |
| 15 | HTTPS | OK. HSTS 1 an avec sous-domaines |
| 16 | En-têtes de sécurité | OK. CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy |
| 17 | CORS | OK. `*` seulement sur les routes publiques faites pour ça (OAuth, MCP, métadonnées de token, API v1 en lecture) |
| 18 | Limites de requêtes | **Renforcé.** 10 routes d'écriture ajoutées (publier, répondre, aimer, pourboire, signaler, suivre, créer une communauté, article, chill, rejoindre). 60 routes au total |
| 19 | Mode debug coupé | OK. `unsafe-eval` seulement en développement, route debug supprimée |
| 20 | Dépendances | À surveiller. `npm audit` : 50 alertes (30 hautes, 20 moyennes), toutes dans des paquets de wallet (`@reown/appkit`, via Privy et wagmi). Aucune correction sans mise à jour de Privy. Pas de correction forcée pour ne pas casser la connexion |
| 21 | Paquets inutilisés | À nettoyer (voir ci-dessous) |
| 22 | Fichiers exposés | OK. `public/` ne contient que des images et le manifest. Les `.sql` suivis sont des scripts et tests, hors `public/` |
| 23 | Journal d'activité | **Ajouté.** Table `admin_audit_log` : chaque écriture admin enregistre qui, quelle route, quand, depuis quelle IP |
| 24 | Attaque simulée | Faite par revue de code : écriture depuis un autre site (bloquée par le contrôle d'origine), envoi d'un faux fichier image (refusé), appel admin sans session (401), spam de publications (429) |
| 25 | Dernier contrôle | 649 tests passent, types propres |
| 26 | Déploiement | Voir les commandes dans le message |
| 27 | Rapport des failles | Ce document |

## Failles et risques restants

1. **Dépendances de wallet (moyen)**. Alertes `@reown/appkit-*` dans Privy et wagmi. À corriger en mettant à jour `@privy-io/react-auth` quand une version propre sort.
2. **CSP avec `unsafe-inline` pour les scripts (faible)**. Demandé par Next.js pour ses scripts intégrés. Une CSP à jetons (nonce) est possible plus tard.
3. **Paquets probablement inutilisés** : `@farcaster/mini-app-solana`, `@farcaster/miniapp-sdk`, `@hookform/resolvers`, `@phosphor-icons/react`, `@solana/wallet-adapter-react`, `@stripe/stripe-js`, `@tabler/icons-react`, `@tabler/icons-webfont`, `date-fns`, `html-to-image`. À vérifier à la main avant de retirer.
4. **Routes d'écriture sans limite par IP** : une trentaine de routes (alertes, wallets suivis, notifications, etc.) sont protégées par la connexion mais n'ont pas de plafond. Faible risque.
5. **Chaque serveur partage le compteur de limites** via `rateHit`. Si le compteur n'est pas joignable, la limite est ignorée.
