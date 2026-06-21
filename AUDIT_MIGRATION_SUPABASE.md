# Audit Complet & Plan de Migration Supabase — Octopus Market

> **Date d'audit :** 21 juin 2026  
> **Statut :** Pré-migration — AUCUN fichier modifié  
> **En attente de validation avant toute implémentation**

---

## Table des matières

1. [Vue d'ensemble du projet](#1-vue-densemble-du-projet)
2. [Cartographie complète du stockage actuel](#2-cartographie-complète-du-stockage-actuel)
3. [Entités métier & modèle de données actuel](#3-entités-métier--modèle-de-données-actuel)
4. [Relations entre les données](#4-relations-entre-les-données)
5. [API internes & flux de synchronisation](#5-api-internes--flux-de-synchronisation)
6. [Schéma Supabase recommandé](#6-schéma-supabase-recommandé)
7. [Scripts SQL de création](#7-scripts-sql-de-création)
8. [Politiques RLS (Row Level Security)](#8-politiques-rls-row-level-security)
9. [Détection des problèmes & risques](#9-détection-des-problèmes--risques)
10. [Plan de migration détaillé](#10-plan-de-migration-détaillé)
11. [Liste des fichiers à modifier](#11-liste-des-fichiers-à-modifier)
12. [Estimation de la difficulté](#12-estimation-de-la-difficulté)
13. [Stratégie de déploiement sans interruption](#13-stratégie-de-déploiement-sans-interruption)

---

## 1. Vue d'ensemble du projet

### Stack technique
- **Framework :** React 19 + TypeScript + Vite
- **UI :** Tailwind CSS v4, Radix UI, shadcn/ui
- **Blockchain :** Solana (@solana/web3.js), Phantom Wallet
- **State management :** Zustand, TanStack Query (installés mais peu utilisés — le stockage est principalement custom)
- **Internationalisation :** i18next + contexte React personnalisé (EN/FR)
- **Paiements on-chain :** USDC sur Solana + vérification de transactions RPC

### Domaines fonctionnels

| Module | Description |
|---|---|
| **Prediction Market** | Paris sur événements (sports, crypto, politique…) avec paiement USDC on-chain |
| **Launch Token** | Tokenisation de projets via l'API Bags.fm |
| **Explore AI / List My AI** | Catalogue d'outils IA avec listing payant (Starter 10$/mois, Builder 100$/an) |
| **Admin Control Center** | Gestion des marchés, paiements, utilisateurs, journaux |
| **CyrDoge / Aido** | Agent IA conversationnel avec mémoire persistante |
| **Octopus Tokens Board** | Tableau des tokens lancés sur la plateforme |
| **Wallet Dashboard** | Tableau de bord SOL/USDC de l'utilisateur connecté |

### Authentification actuelle
Il n'y a **pas de système d'authentification standard** (pas de JWT, pas de session serveur). L'identité est uniquement basée sur l'**adresse publique du wallet Solana**. L'accès admin est déterminé par une comparaison de l'adresse wallet avec `predictionMarketTreasuryAddress` (`EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCZ`).

---

## 2. Cartographie complète du stockage actuel

### 2.1 localStorage (15 clés identifiées)

| Clé localStorage | Contenu | Fichier source |
|---|---|---|
| `octopus-market-theme` | `"light"` ou `"dark"` | `use-theme-mode.ts` |
| `octopus-market-locale-v1` | `"en"` ou `"fr"` | `octopus-locale.tsx` |
| `octopus-market-ai-listings-v2` | `AIListingSubmission[]` (max 300) | `ai-listing-store.ts` |
| `octopus-market-ai-listings-reset-version` | Version string de reset | `ai-listing-store.ts` |
| `octopus-market-admin-notifications-v2` | `AdminPaymentNotification[]` (max 250) | `octopus-admin.ts` |
| `octopus-market-connected-wallets-v1` | `ConnectedWalletSession[]` (max 500) | `octopus-admin.ts` |
| `octopus-market-prediction-history-v4` | `PredictionHistoryEntry[]` (max 400) | `prediction-market-store.ts` |
| `octopus-market-prediction-resolutions-v3` | `Record<marketId, PredictionResolutionRecord>` | `prediction-market-store.ts` |
| `octopus-market-admin-created-markets-v2` | `AdminCreatedPredictionMarket[]` (max 100) | `prediction-market-store.ts` |
| `octopus-market-payment-requests-v1` | `PaymentRequest[]` (max 120) | `solana-pay.ts` |
| `octopus-market-tool-social-v3` | `Record<toolName, ToolSocialRecord>` | `ai-market-social-store.ts` |
| `octopus-market-aido-agent-memory-v3` | `CyrDogeMemory` | `cyrdoge-memory.ts` |
| `octopus-market-wallet-snapshot-cache-v1` | `Record<address, SolanaWalletBalanceSnapshot>` | `solana-wallet.ts` |
| `octopus-market-central-wallets-fallback-v3` | `RegistryWalletRecord[]` (max 2000) | `octopus-central-registry.ts` |
| `octopus-market-central-payments-fallback-v3` | `RegistryPaymentRecord[]` (max 2000) | `octopus-central-registry.ts` |
| `octopus-market-central-bets-fallback-v1` | `RegistryBetRecord[]` (max 2000) | `octopus-central-registry.ts` |
| `octopus-market-central-history-fallback-v3` | `RegistryHistoryRecord[]` (max 2000) | `octopus-central-registry.ts` |
| `octopus-market-central-admin-logs-fallback-v1` | `RegistryAdminLogRecord[]` (max 2000) | `octopus-central-registry.ts` |

### 2.2 sessionStorage (1 clé)

| Clé | Contenu | Fichier source |
|---|---|---|
| `octopus-market-admin-session-v1` | `AdminSessionRecord` (token + walletAddress + expiresAt) | `octopus-admin-auth.ts` |

### 2.3 IndexedDB

- **Nom de la base :** `octopus-market-central-registry` (version 4)
- **Object stores :** `wallets` (clé: `address`), `payments` (clé: `id`), `bets` (clé: `id`), `history` (clé: `id`), `adminLogs` (clé: `id`)
- **Rôle :** stockage principal du Central Registry avec localStorage en fallback
- **Fichier source :** `octopus-central-registry.ts`

### 2.4 Mécanismes de synchronisation cross-tab

- **BroadcastChannel** : `octopus-market-central-registry`, `octopus-market-admin-storage`, `octopus-market-prediction-channel`, `octopus-market-tool-social-channel`
- **CustomEvents** sur `window` : `octopus-market-central-registry-update`, `octopus-market-admin-storage`, `octopus-market-prediction-storage`, `octopus-market-ai-listings-updated`, `octopus-market-tool-social-updated`
- **EventSource (SSE)** pour chaque domaine (voir section 5)

### 2.5 API REST internes (endpoints identifiés)

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/central-registry` | GET | Récupère tout le registry |
| `/api/central-registry/stream` | GET (SSE) | Stream temps réel |
| `/api/central-registry/upsert` | POST | Upsert un enregistrement |
| `/api/central-registry/clear` | POST | Vide un store |
| `/api/admin-notifications` | GET | Liste les notifications |
| `/api/admin-notifications/stream` | GET (SSE) | Stream temps réel |
| `/api/admin-notifications/state` | POST | Remplace tout l'état |
| `/api/prediction-markets` | GET | Lit les marchés + résolutions |
| `/api/prediction-markets/stream` | GET (SSE) | Stream temps réel |
| `/api/prediction-markets/state` | POST | Remplace l'état complet |
| `/api/prediction-markets/create` | POST | Crée un marché (admin) |
| `/api/prediction-markets/resolve` | POST | Résout un marché (admin) |
| `/api/prediction-markets/delete` | POST | Supprime un marché (admin) |
| `/api/tool-social` | GET | Lit les données sociales |
| `/api/tool-social/stream` | GET (SSE) | Stream temps réel |
| `/api/tool-social/import` | POST | Importe les données locales |
| `/api/tool-social/rate` | POST | Note un outil |
| `/api/tool-social/react` | POST | Réagit à un outil |
| `/api/tool-social/comment` | POST | Commente un outil |
| `/api/tool-social/report` | POST | Signale un outil |

---

## 3. Entités métier & modèle de données actuel

### 3.1 Entité : Wallet / Utilisateur
**Fichier :** `octopus-central-registry.ts` → `RegistryWalletRecord`

| Champ | Type | Contrainte | Description |
|---|---|---|---|
| `address` | `string` | PK, NOT NULL | Adresse publique Solana |
| `role` | `"user" \| "admin"` | NOT NULL, default `"user"` | Rôle sur la plateforme |
| `status` | `"active" \| "suspended"` | NOT NULL, default `"active"` | Statut du compte |
| `username` | `string \| undefined` | UNIQUE (soft), min 2 chars | Pseudo choisi (verrouillé après création) |
| `displayName` | `string \| undefined` | — | Nom d'affichage |
| `twitterHandle` | `string \| undefined` | format `@xxx` | Identifiant X/Twitter |
| `avatarSrc` | `string \| undefined` | URL | Photo de profil |
| `registeredAt` | `number \| undefined` | timestamp ms | Date d'enregistrement |
| `firstConnectedAt` | `number` | NOT NULL | Première connexion wallet |
| `lastConnectedAt` | `number` | NOT NULL | Dernière connexion wallet |
| `connectionCount` | `number` | NOT NULL, default 0 | Nombre de connexions |
| `latestActivityAt` | `number` | NOT NULL | Dernière activité |
| `latestActivityLabel` | `string` | NOT NULL | Libellé dernière activité |
| `paymentCount` | `number` | NOT NULL, default 0 | Total paiements |
| `approvedPaymentCount` | `number` | NOT NULL, default 0 | Paiements approuvés |
| `pendingPaymentCount` | `number` | NOT NULL, default 0 | Paiements en attente |
| `rejectedPaymentCount` | `number` | NOT NULL, default 0 | Paiements rejetés |
| `totalPaidUsdc` | `number` | NOT NULL, default 0 | Total USDC payé |
| `totalWonUsdc` | `number` | NOT NULL, default 0 | Total USDC gagné |
| `totalLostUsdc` | `number` | NOT NULL, default 0 | Total USDC perdu |
| `totalClaimedUsdc` | `number` | NOT NULL, default 0 | Total USDC réclamé |

### 3.2 Entité : Notification de paiement admin
**Fichier :** `octopus-admin.ts` → `AdminPaymentNotification`

| Champ | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `string` | PK (`admin-{reference}`) | Identifiant |
| `paymentRequestId` | `string` | NOT NULL | ID de la requête de paiement |
| `paymentReference` | `string` | UNIQUE | Référence on-chain |
| `flow` | `"prediction" \| "launch" \| "listing"` | NOT NULL | Type de flux |
| `title` | `string` | NOT NULL | Titre affiché |
| `subtitle` | `string \| undefined` | — | Sous-titre |
| `categoryLabel` | `string \| undefined` | — | Catégorie du marché |
| `marketId` | `string \| undefined` | FK → markets | ID du marché |
| `selectionId` | `string \| undefined` | — | Option choisie |
| `selectionLabel` | `string \| undefined` | — | Libellé de l'option |
| `username` | `string \| undefined` | — | Pseudo de l'utilisateur |
| `userWallet` | `string` | NOT NULL, FK → wallets | Wallet payeur |
| `recipientWallet` | `string` | NOT NULL | Wallet destinataire |
| `amountUsdc` | `number` | NOT NULL | Montant pari/listing |
| `reserveFeeUsdc` | `number` | NOT NULL | Frais de réservation (1%) |
| `totalPaidUsdc` | `number` | NOT NULL | Total payé |
| `createdAt` | `number` | NOT NULL | Timestamp création |
| `status` | `"pending" \| "approved" \| "rejected"` | NOT NULL, default `"pending"` | Statut admin |
| `reviewedAt` | `number \| undefined` | — | Date de décision |
| `reviewedByWallet` | `string \| undefined` | FK → wallets | Admin décideur |
| `updatedAt` | `number` | NOT NULL | Timestamp mise à jour |

### 3.3 Entité : Marché de prédiction
**Fichier :** `prediction-market-store.ts` → `AdminCreatedPredictionMarket`  
Étend `PredictionMarketQuestion` de `octopus-market-data.ts`

| Champ | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `string` | PK | Identifiant unique |
| `categoryId` | `string` | NOT NULL, FK → categories | Catégorie |
| `title` | `string` | NOT NULL | Titre de la prédiction |
| `marketType` | `"yes-no" \| "threshold" \| "three-way"` | NOT NULL | Type de marché |
| `resolutionLabel` | `string` | NOT NULL | Libellé de résolution |
| `eventDateLabel` | `string \| undefined` | — | Date de l'événement |
| `visualType` | `"vs" \| "simple"` | NOT NULL | Type d'affichage visuel |
| `singleName` | `string \| undefined` | — | Nom pour visuel simple |
| `singleImageSrc` | `string \| undefined` | URL | Image pour visuel simple |
| `leftCompetitorName` | `string \| undefined` | — | Nom concurrent gauche |
| `leftCompetitorImageSrc` | `string \| undefined` | URL | Image concurrent gauche |
| `rightCompetitorName` | `string \| undefined` | — | Nom concurrent droite |
| `rightCompetitorImageSrc` | `string \| undefined` | URL | Image concurrent droite |
| `createdAt` | `number` | NOT NULL | Timestamp création |
| `createdByWallet` | `string` | NOT NULL, FK → wallets | Admin créateur |
| `isAdminCreated` | `true` | NOT NULL | Toujours `true` |

### 3.4 Entité : Option de marché
**Fichier :** `octopus-market-data.ts` → `PredictionMarketOption`  
(stockée en JSONB dans le marché parent)

| Champ | Type | Description |
|---|---|---|
| `id` | `string` | Identifiant de l'option |
| `label` | `string` | Libellé affiché |
| `oddsMultiplier` | `number` | Multiplicateur de gains |
| `description` | `string \| undefined` | Description |
| `logoSrc` | `string \| undefined` | URL logo |
| `initialVolumeUsd` | `number \| undefined` | Volume initial |

### 3.5 Entité : Historique de prédiction
**Fichier :** `prediction-market-store.ts` → `PredictionHistoryEntry`

| Champ | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `string` | PK | Identifiant unique |
| `marketId` | `string` | NOT NULL, FK → markets | Marché associé |
| `marketTitle` | `string` | NOT NULL | Titre du marché (dénormalisé) |
| `categoryLabel` | `string` | NOT NULL | Catégorie (dénormalisé) |
| `selectionId` | `string` | NOT NULL | Option choisie |
| `selectionLabel` | `string` | NOT NULL | Libellé de l'option |
| `amount` | `number` | NOT NULL | Montant du pari |
| `reserveFee` | `number` | NOT NULL | Frais 1% |
| `totalCharged` | `number` | NOT NULL | Total débité |
| `claimFeeRate` | `number` | NOT NULL | Taux frais réclamation (5%) |
| `payoutMultiple` | `number` | NOT NULL | Multiplicateur de payout |
| `grossReward` | `number` | NOT NULL | Gain brut |
| `netReward` | `number` | NOT NULL | Gain net (après 5%) |
| `walletAddress` | `string` | NOT NULL, FK → wallets | Wallet parieur |
| `paymentReference` | `string` | NOT NULL, UNIQUE | Référence on-chain |
| `paymentRequestId` | `string` | NOT NULL | ID de requête de paiement |
| `createdAt` | `number` | NOT NULL | Timestamp création |
| `reportedAt` | `number` | NOT NULL | Timestamp signalement |
| `adminDecisionStatus` | `"pending" \| "approved" \| "rejected" \| undefined` | — | Décision admin |
| `resolutionOutcomeId` | `string \| undefined` | — | Outcome gagnant |
| `resolvedAt` | `number \| undefined` | — | Timestamp résolution |
| `resolvedByWallet` | `string \| undefined` | — | Admin résolveur |
| `resultStatus` | `PredictionResultStatus \| undefined` | COMPUTED | Statut calculé |
| `winningChoiceLabel` | `string \| undefined` | COMPUTED | Libellé du choix gagnant |
| `payoutRecordedAt` | `number \| undefined` | — | Timestamp enregistrement payout |
| `claimedAt` | `number \| undefined` | — | Timestamp réclamation |
| `claimReference` | `string \| undefined` | — | Référence de réclamation |
| `updatedAt` | `number` | NOT NULL | Timestamp mise à jour |

**`PredictionResultStatus`** : `"open" | "pending_review" | "approved_pending_result" | "win" | "lose" | "claimed" | "rejected"`

### 3.6 Entité : Résolution de marché
**Fichier :** `prediction-market-store.ts` → `PredictionResolutionRecord`  
(stocké comme `Record<marketId, record>`)

| Champ | Type | Description |
|---|---|---|
| `outcomeId` | `string` | ID de l'option gagnante |
| `resolvedAt` | `number` | Timestamp de résolution |
| `resolvedByWallet` | `string` | Admin qui a résolu |

### 3.7 Entité : Listing IA
**Fichier :** `ai-listing-store.ts` → `AIListingSubmission`

| Champ | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `string` | PK | Identifiant unique |
| `walletAddress` | `string` | NOT NULL, FK → wallets | Wallet du soumetteur |
| `displayName` | `string` | NOT NULL | Nom affiché |
| `twitterHandle` | `string` | NOT NULL | @handle X/Twitter |
| `iconSrc` | `string` | NOT NULL, URL | URL de l'icône |
| `iconName` | `string` | NOT NULL | Nom du fichier icône |
| `websiteUrl` | `string` | NOT NULL, URL | URL du site |
| `description` | `string` | NOT NULL | Description du produit |
| `socialUrl` | `string` | NOT NULL, URL | URL sociale |
| `guideFileName` | `string` | NOT NULL | Nom du fichier guide |
| `guideFileUrl` | `string` | NOT NULL, URL | URL du guide |
| `planId` | `"free" \| "starter" \| "builder"` | NOT NULL | Plan choisi |
| `billingLabel` | `string` | NOT NULL | Libellé facturation |
| `amountUsd` | `number` | NOT NULL, ≥ 0 | Montant USD |
| `autoRenewEnabled` | `boolean` | NOT NULL | Renouvellement auto |
| `submittedAt` | `number` | NOT NULL | Timestamp soumission |
| `updatedAt` | `number` | NOT NULL | Timestamp MAJ |
| `status` | `"pending" \| "approved" \| "rejected"` | NOT NULL, default `"pending"` | Statut admin |
| `badge` | `"none" \| "blue" \| "gold"` | NOT NULL, default `"none"` | Badge de vérification |
| `adminNotes` | `string \| undefined` | — | Notes admin |
| `paymentReference` | `string \| undefined` | — | Référence paiement |
| `paymentRequestId` | `string \| undefined` | — | ID requête paiement |
| `visibleInExplore` | `boolean` | NOT NULL, default `true` | Visible dans le catalogue |
| `visitorCount` | `number` | NOT NULL, default 0 | Nombre de visiteurs |
| `uniqueVisitorKeys` | `string[]` | NOT NULL, max 2000 | Clés visiteurs uniques |

### 3.8 Entité : Social outil IA
**Fichier :** `ai-market-social-store.ts` → `ToolSocialRecord`

| Champ | Type | Description |
|---|---|---|
| `toolName` | `string` | PK (nom de l'outil) |
| `ratingAverage` | `number` | Moyenne des notes |
| `ratingCount` | `number` | Nombre de notes |
| `userRatings` | `Record<actorKey, 1-5>` | Notes par utilisateur |
| `reactions` | `Record<type, count>` | Compteurs de réactions |
| `userReactions` | `Record<actorKey, type>` | Réaction par utilisateur |
| `comments` | `ToolComment[]` (max 50) | Commentaires |
| `reports` | `number` | Signalements |

**`ToolReactionType`** : `"heart" | "thumbs-up" | "flame"`

### 3.9 Entité : Commentaire outil
**Fichier :** `ai-market-social-store.ts` → `ToolComment`

| Champ | Type | Description |
|---|---|---|
| `id` | `string` | PK local |
| `author` | `string` | Auteur (actorKey = wallet ou username) |
| `content` | `string` | Contenu du commentaire |
| `createdAt` | `number` | Timestamp |

### 3.10 Entité : Journal admin
**Fichier :** `octopus-central-registry.ts` → `RegistryAdminLogRecord`

| Champ | Type | Contrainte | Description |
|---|---|---|---|
| `id` | `string` | PK | Identifiant |
| `adminWallet` | `string` | NOT NULL, FK → wallets | Admin auteur |
| `action` | voir ci-dessous | NOT NULL | Action réalisée |
| `targetId` | `string` | NOT NULL | Cible de l'action |
| `details` | `string` | NOT NULL | Détails textuels |
| `createdAt` | `number` | NOT NULL | Timestamp |

**Actions admin :** `"create_prediction" | "remove_prediction" | "resolve_prediction" | "remove_ai" | "approve_listing" | "reject_listing" | "suspend_user" | "reactivate_user" | "approve_payment" | "reject_payment" | "add_ai"`

### 3.11 Entité : Requête de paiement
**Fichier :** `solana-pay.ts` → `PaymentRequest`

| Champ | Type | Description |
|---|---|---|
| `id` | `string` | PK (`tx-{timestamp}-{hex}`) |
| `kind` | `"listing" \| "launch" \| "prediction"` | Type |
| `walletAddress` | `string` | Wallet payeur |
| `recipient` | `string` | Wallet destinataire |
| `amount` | `number` | Montant |
| `reference` | `string` | Référence base58 unique |
| `currency` | `"SOL" \| "USDC"` | Devise |
| `tokenMint` | `string \| undefined` | Mint USDC |
| `tokenDecimals` | `number \| undefined` | Décimales |
| `label` | `string \| undefined` | Label |
| `message` | `string \| undefined` | Message |
| `memo` | `string \| undefined` | Memo on-chain |
| `encodedUrl` | `string` | URL `solana:...` |
| `qrCodeSrc` | `string` | SVG data URI |
| `signature` | `string \| null` | Signature de transaction |
| `status` | `"created" \| "signed" \| "validated"` | Statut |
| `createdAt` | `number` | Timestamp |
| `rpcUrl` | `string \| undefined` | RPC utilisé |
| `validatedAt` | `number \| undefined` | Timestamp validation |
| `metadata` | `Record<string, string\|number\|boolean>` | Métadonnées |

### 3.12 Entité : Mémoire agent IA (CyrDoge)
**Fichier :** `cyrdoge-memory.ts` → `CyrDogeMemory`

| Champ | Type | Description |
|---|---|---|
| `user.name` | `string \| null` | Nom de l'utilisateur |
| `user.age` | `string \| null` | Âge |
| `user.location` | `string \| null` | Localisation |
| `user.profession` | `string \| null` | Profession |
| `preferences.languagePreference` | `"fr" \| "en" \| null` | Langue |
| `preferences.responseStyle` | `string \| null` | Style de réponse |
| `preferences.tonePreference` | `string \| null` | Ton |
| `preferences.humorPreference` | `string \| null` | Humour |
| `projectsInProgress` | `string[]` (max 6) | Projets en cours |
| `currentGoals` | `string[]` (max 6) | Objectifs actuels |
| `importantInformation` | `string[]` (max 6) | Informations importantes |
| `updatedAt` | `number` | Timestamp MAJ |

### 3.13 Entité : Snapshot wallet Solana
**Fichier :** `solana-wallet.ts` → `SolanaWalletBalanceSnapshot`

| Champ | Type | Description |
|---|---|---|
| `address` | `string` | Adresse wallet |
| `lamports` | `number` | Balance en lamports |
| `balanceSol` | `number` | Balance en SOL |
| `usdcBalance` | `number` | Balance USDC |
| `usdcRawAmount` | `string` | Montant brut USDC |
| `usdcDecimals` | `number` | Décimales USDC |
| `slot` | `number \| null` | Slot Solana |
| `rpcUrl` | `string` | RPC source |
| `fetchedAt` | `number` | Timestamp fetch |

### 3.14 Entité : Token board
**Fichier :** `octopus-market-data.ts` → `OctopusTokenBoardItem`

| Champ | Type | Description |
|---|---|---|
| `id` | `string` | PK |
| `name` | `string` | Nom du token |
| `ticker` | `string` | Ticker |
| `logoSrc` | `string \| undefined` | URL logo |
| `price` | `string` | Prix affiché |
| `volume24h` | `string` | Volume 24h |
| `marketCap` | `string` | Market cap |
| `holders` | `string` | Nombre de holders |
| `status` | `string` | Statut |
| `launchedByWallet` | `string \| undefined` | Wallet du lanceur |
| `launchedByName` | `string \| undefined` | Nom du lanceur |
| `contractAddress` | `string \| undefined` | Adresse du contrat |
| `poolAddress` | `string \| undefined` | Adresse du pool |
| `solscanUrl \| dexScreenerUrl \| birdEyeUrl \| geckoTerminalUrl \| bagsFmUrl` | `string \| undefined` | URLs externes |
| `initialBuyPercent` | `number \| undefined` | % d'achat initial |
| `chartPoints` | `Array<{timestamp, label, close, high, low, volume}>` | Données chart |
| `lastUpdatedLabel` | `string \| undefined` | Libellé dernière MAJ |

---

## 4. Relations entre les données

```
wallets (address PK)
  ├─── payments (userWallet FK)
  ├─── payments (reviewedByWallet FK)
  ├─── prediction_history (walletAddress FK)
  ├─── ai_listings (walletAddress FK)
  ├─── admin_logs (adminWallet FK)
  ├─── prediction_markets (createdByWallet FK)
  └─── ai_memory (walletAddress FK — 1:1)

prediction_markets (id PK)
  ├─── market_options (marketId FK) — options stockées en JSONB actuellement
  ├─── prediction_history (marketId FK)
  └─── prediction_resolutions (marketId FK — 1:1)

payments (paymentReference PK)
  ├─── prediction_history (paymentReference FK)
  └─── ai_listings (paymentReference FK, nullable)

ai_tools (toolName PK)
  ├─── tool_ratings (toolName FK)
  ├─── tool_reactions (toolName FK)
  └─── tool_comments (toolName FK)
```

---

## 5. API internes & flux de synchronisation

### Architecture actuelle (problème central)

Le projet utilise un pattern hybride complexe :

```
[Browser localStorage] ←→ [IndexedDB] ←→ [Server API] ←→ [SSE Stream]
         ↕                                                      ↕
[In-memory module cache] ←────── BroadcastChannel ────────────→
```

Ce système existe parce qu'il n'y a **pas de vraie base de données serveur**. La persistance serveur est simulée via des API REST qui stockent probablement en mémoire ou dans un fichier temporaire.

**Après migration Supabase :** tout ce système sera remplacé par :
- Supabase Realtime (remplace SSE + BroadcastChannel)
- Supabase Database (remplace localStorage + IndexedDB)
- Supabase Auth (remplace le système d'auth wallet custom)

---

## 6. Schéma Supabase recommandé

### Diagramme relationnel

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OCTOPUS MARKET DB                           │
└─────────────────────────────────────────────────────────────────────┘

wallets ──────────────────────────────────────────────────────┐
│ address TEXT PK                                             │
│ role TEXT DEFAULT 'user'                                    │
│ status TEXT DEFAULT 'active'                                │
│ username TEXT UNIQUE                                        │
│ display_name TEXT                                           │
│ twitter_handle TEXT                                         │
│ avatar_src TEXT                                             │
│ registered_at TIMESTAMPTZ                                   │
│ first_connected_at TIMESTAMPTZ NOT NULL                     │
│ last_connected_at TIMESTAMPTZ NOT NULL                      │
│ connection_count INT DEFAULT 0                              │
│ latest_activity_at TIMESTAMPTZ NOT NULL                     │
│ latest_activity_label TEXT NOT NULL                         │
│ payment_count INT DEFAULT 0                                 │
│ approved_payment_count INT DEFAULT 0                        │
│ pending_payment_count INT DEFAULT 0                         │
│ rejected_payment_count INT DEFAULT 0                        │
│ total_paid_usdc NUMERIC(12,6) DEFAULT 0                     │
│ total_won_usdc NUMERIC(12,6) DEFAULT 0                      │
│ total_lost_usdc NUMERIC(12,6) DEFAULT 0                     │
│ total_claimed_usdc NUMERIC(12,6) DEFAULT 0                  │
│ created_at TIMESTAMPTZ DEFAULT now()                        │
│ updated_at TIMESTAMPTZ DEFAULT now()                        │
└──────────────────────────────────────────────────┬──────────┘
                                                   │
          ┌────────────────────────────────────────┤
          │                                        │
          ▼                                        ▼
prediction_markets                            payments
│ id TEXT PK                                  │ id TEXT PK
│ category_id TEXT NOT NULL                   │ payment_request_id TEXT NOT NULL
│ title TEXT NOT NULL                         │ payment_reference TEXT UNIQUE
│ market_type TEXT NOT NULL                   │ flow TEXT NOT NULL
│ resolution_label TEXT NOT NULL              │ title TEXT NOT NULL
│ event_date_label TEXT                       │ subtitle TEXT
│ visual_type TEXT NOT NULL                   │ category_label TEXT
│ single_name TEXT                            │ market_id TEXT FK→prediction_markets
│ single_image_src TEXT                       │ selection_id TEXT
│ left_competitor_name TEXT                   │ selection_label TEXT
│ left_competitor_image_src TEXT              │ username TEXT
│ right_competitor_name TEXT                  │ user_wallet TEXT NOT NULL FK→wallets
│ right_competitor_image_src TEXT             │ recipient_wallet TEXT NOT NULL
│ options JSONB NOT NULL DEFAULT '[]'         │ amount_usdc NUMERIC(12,6) NOT NULL
│ created_at TIMESTAMPTZ DEFAULT now()        │ reserve_fee_usdc NUMERIC(12,6) NOT NULL
│ created_by_wallet TEXT FK→wallets           │ total_paid_usdc NUMERIC(12,6) NOT NULL
│ is_resolved BOOLEAN DEFAULT false           │ status TEXT DEFAULT 'pending'
│ resolution_outcome_id TEXT                  │ reviewed_at TIMESTAMPTZ
│ resolved_at TIMESTAMPTZ                     │ reviewed_by_wallet TEXT FK→wallets
│ resolved_by_wallet TEXT FK→wallets          │ created_at TIMESTAMPTZ DEFAULT now()
│ is_active BOOLEAN DEFAULT true              │ updated_at TIMESTAMPTZ DEFAULT now()
└──────────────────┬──────────────────────────└─────────────────┬────┘
                   │                                            │
                   ▼                                            ▼
         prediction_history ──────────────────────────────────►(FK)
         │ id TEXT PK
         │ market_id TEXT NOT NULL FK→prediction_markets
         │ market_title TEXT NOT NULL
         │ category_label TEXT NOT NULL
         │ selection_id TEXT NOT NULL
         │ selection_label TEXT NOT NULL
         │ amount NUMERIC(12,6) NOT NULL
         │ reserve_fee NUMERIC(12,6) NOT NULL
         │ total_charged NUMERIC(12,6) NOT NULL
         │ claim_fee_rate NUMERIC(5,4) NOT NULL DEFAULT 0.05
         │ payout_multiple NUMERIC(8,4) NOT NULL
         │ gross_reward NUMERIC(12,6) NOT NULL
         │ net_reward NUMERIC(12,6) NOT NULL
         │ wallet_address TEXT NOT NULL FK→wallets
         │ payment_reference TEXT NOT NULL UNIQUE
         │ payment_request_id TEXT NOT NULL
         │ admin_decision_status TEXT DEFAULT 'pending'
         │ resolution_outcome_id TEXT
         │ resolved_at TIMESTAMPTZ
         │ resolved_by_wallet TEXT
         │ result_status TEXT GENERATED (voir vue)
         │ payout_recorded_at TIMESTAMPTZ
         │ claimed_at TIMESTAMPTZ
         │ claim_reference TEXT
         │ reported_at TIMESTAMPTZ NOT NULL
         │ created_at TIMESTAMPTZ DEFAULT now()
         │ updated_at TIMESTAMPTZ DEFAULT now()
         └──────────────────────────────────────

ai_listings
│ id TEXT PK
│ wallet_address TEXT NOT NULL FK→wallets
│ display_name TEXT NOT NULL
│ twitter_handle TEXT NOT NULL
│ icon_src TEXT NOT NULL
│ icon_name TEXT NOT NULL
│ website_url TEXT NOT NULL
│ description TEXT NOT NULL
│ social_url TEXT NOT NULL
│ guide_file_name TEXT NOT NULL
│ guide_file_url TEXT NOT NULL
│ plan_id TEXT NOT NULL DEFAULT 'starter'
│ billing_label TEXT NOT NULL
│ amount_usd NUMERIC(10,2) NOT NULL DEFAULT 0
│ auto_renew_enabled BOOLEAN NOT NULL DEFAULT false
│ status TEXT NOT NULL DEFAULT 'pending'
│ badge TEXT NOT NULL DEFAULT 'none'
│ admin_notes TEXT
│ payment_reference TEXT
│ payment_request_id TEXT
│ visible_in_explore BOOLEAN NOT NULL DEFAULT true
│ visitor_count INT NOT NULL DEFAULT 0
│ submitted_at TIMESTAMPTZ DEFAULT now()
│ updated_at TIMESTAMPTZ DEFAULT now()
└───────────────────────────────────────────────────────────────

ai_tool_social ──────────────────────────────────────────────────────────┐
│ id UUID PK DEFAULT gen_random_uuid()                                   │
│ tool_name TEXT NOT NULL UNIQUE                                         │
│ rating_average NUMERIC(3,1) NOT NULL DEFAULT 0                         │
│ rating_count INT NOT NULL DEFAULT 0                                    │
│ reports INT NOT NULL DEFAULT 0                                         │
│ created_at TIMESTAMPTZ DEFAULT now()                                   │
│ updated_at TIMESTAMPTZ DEFAULT now()                                   │
└───────────────────────────────────────────┬─────────────────────────────┘
                                            │
              ┌─────────────────────────────┤
              │                 ┌───────────┘
              ▼                 ▼
tool_ratings              tool_reactions         tool_comments
│ id UUID PK               │ id UUID PK           │ id TEXT PK
│ tool_name TEXT FK        │ tool_name TEXT FK    │ tool_name TEXT FK
│ actor_key TEXT NOT NULL  │ actor_key TEXT       │ author TEXT NOT NULL
│ rating SMALLINT 1-5      │ reaction_type TEXT   │ content TEXT NOT NULL
│ created_at TIMESTAMPTZ   │ created_at TSTZ      │ created_at TIMESTAMPTZ
│ UNIQUE(tool_name,        └──────────────────────└──────────────────────
│         actor_key)

admin_logs
│ id TEXT PK
│ admin_wallet TEXT NOT NULL FK→wallets
│ action TEXT NOT NULL
│ target_id TEXT NOT NULL
│ details TEXT NOT NULL
│ created_at TIMESTAMPTZ DEFAULT now()
└───────────────────────────────────────

ai_memory (1:1 avec wallets)
│ wallet_address TEXT PK FK→wallets
│ user_name TEXT
│ user_age TEXT
│ user_location TEXT
│ user_profession TEXT
│ language_preference TEXT DEFAULT 'en'
│ response_style TEXT
│ tone_preference TEXT
│ humor_preference TEXT
│ projects_in_progress JSONB DEFAULT '[]'
│ current_goals JSONB DEFAULT '[]'
│ important_information JSONB DEFAULT '[]'
│ updated_at TIMESTAMPTZ DEFAULT now()
└───────────────────────────────────────

token_board
│ id TEXT PK
│ name TEXT NOT NULL
│ ticker TEXT NOT NULL
│ logo_src TEXT
│ price TEXT
│ volume_24h TEXT
│ market_cap TEXT
│ holders TEXT
│ status TEXT NOT NULL DEFAULT 'Tracked'
│ launched_by_wallet TEXT FK→wallets
│ launched_by_name TEXT
│ contract_address TEXT UNIQUE
│ pool_address TEXT
│ solscan_url TEXT
│ dex_screener_url TEXT
│ bird_eye_url TEXT
│ gecko_terminal_url TEXT
│ bags_fm_url TEXT
│ initial_buy_percent NUMERIC(5,2)
│ chart_points JSONB DEFAULT '[]'
│ last_updated_label TEXT
│ created_at TIMESTAMPTZ DEFAULT now()
│ updated_at TIMESTAMPTZ DEFAULT now()
└────────────────────────────────────────

payment_requests (référence locale, peut être optionnel post-migration)
│ id TEXT PK
│ kind TEXT NOT NULL
│ wallet_address TEXT FK→wallets
│ recipient TEXT NOT NULL
│ amount NUMERIC(12,6) NOT NULL
│ reference TEXT NOT NULL UNIQUE
│ currency TEXT NOT NULL DEFAULT 'USDC'
│ token_mint TEXT
│ token_decimals INT
│ label TEXT
│ message TEXT
│ memo TEXT
│ encoded_url TEXT
│ qr_code_src TEXT
│ signature TEXT
│ status TEXT DEFAULT 'created'
│ rpc_url TEXT
│ metadata JSONB DEFAULT '{}'
│ validated_at TIMESTAMPTZ
│ created_at TIMESTAMPTZ DEFAULT now()
└───────────────────────────────────────
```

---

## 7. Scripts SQL de création

```sql
-- ============================================================
-- OCTOPUS MARKET — Scripts de création Supabase
-- Version: 1.0.0
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: wallets (utilisateurs)
-- ============================================================
CREATE TABLE public.wallets (
  address               TEXT PRIMARY KEY,
  role                  TEXT NOT NULL DEFAULT 'user'
                          CHECK (role IN ('user', 'admin')),
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'suspended')),
  username              TEXT UNIQUE,
  display_name          TEXT,
  twitter_handle        TEXT,
  avatar_src            TEXT,
  registered_at         TIMESTAMPTZ,
  first_connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  connection_count      INT NOT NULL DEFAULT 0 CHECK (connection_count >= 0),
  latest_activity_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  latest_activity_label TEXT NOT NULL DEFAULT 'Wallet connected to Octopus Market',
  payment_count         INT NOT NULL DEFAULT 0 CHECK (payment_count >= 0),
  approved_payment_count INT NOT NULL DEFAULT 0,
  pending_payment_count  INT NOT NULL DEFAULT 0,
  rejected_payment_count INT NOT NULL DEFAULT 0,
  total_paid_usdc       NUMERIC(14,6) NOT NULL DEFAULT 0,
  total_won_usdc        NUMERIC(14,6) NOT NULL DEFAULT 0,
  total_lost_usdc       NUMERIC(14,6) NOT NULL DEFAULT 0,
  total_claimed_usdc    NUMERIC(14,6) NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallets_role ON public.wallets(role);
CREATE INDEX idx_wallets_status ON public.wallets(status);
CREATE INDEX idx_wallets_latest_activity_at ON public.wallets(latest_activity_at DESC);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallets_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: prediction_markets
-- ============================================================
CREATE TABLE public.prediction_markets (
  id                       TEXT PRIMARY KEY,
  category_id              TEXT NOT NULL,
  title                    TEXT NOT NULL,
  market_type              TEXT NOT NULL
                             CHECK (market_type IN ('yes-no', 'threshold', 'three-way')),
  resolution_label         TEXT NOT NULL,
  event_date_label         TEXT,
  visual_type              TEXT NOT NULL DEFAULT 'simple'
                             CHECK (visual_type IN ('vs', 'simple')),
  single_name              TEXT,
  single_image_src         TEXT,
  left_competitor_name     TEXT,
  left_competitor_image_src TEXT,
  right_competitor_name    TEXT,
  right_competitor_image_src TEXT,
  options                  JSONB NOT NULL DEFAULT '[]',
  created_by_wallet        TEXT REFERENCES public.wallets(address) ON UPDATE CASCADE,
  is_resolved              BOOLEAN NOT NULL DEFAULT false,
  resolution_outcome_id    TEXT,
  resolved_at              TIMESTAMPTZ,
  resolved_by_wallet       TEXT REFERENCES public.wallets(address) ON UPDATE CASCADE,
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prediction_markets_category ON public.prediction_markets(category_id);
CREATE INDEX idx_prediction_markets_active ON public.prediction_markets(is_active) WHERE is_active = true;
CREATE INDEX idx_prediction_markets_resolved ON public.prediction_markets(is_resolved);
CREATE INDEX idx_prediction_markets_created_at ON public.prediction_markets(created_at DESC);

CREATE TRIGGER prediction_markets_updated_at
  BEFORE UPDATE ON public.prediction_markets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: payments
-- ============================================================
CREATE TABLE public.payments (
  id                   TEXT PRIMARY KEY,
  payment_request_id   TEXT NOT NULL,
  payment_reference    TEXT NOT NULL UNIQUE,
  flow                 TEXT NOT NULL CHECK (flow IN ('prediction', 'launch', 'listing')),
  title                TEXT NOT NULL,
  subtitle             TEXT,
  category_label       TEXT,
  market_id            TEXT REFERENCES public.prediction_markets(id) ON DELETE SET NULL,
  selection_id         TEXT,
  selection_label      TEXT,
  username             TEXT,
  user_wallet          TEXT NOT NULL REFERENCES public.wallets(address) ON UPDATE CASCADE,
  recipient_wallet     TEXT NOT NULL,
  amount_usdc          NUMERIC(14,6) NOT NULL CHECK (amount_usdc >= 0),
  reserve_fee_usdc     NUMERIC(14,6) NOT NULL DEFAULT 0,
  total_paid_usdc      NUMERIC(14,6) NOT NULL CHECK (total_paid_usdc >= 0),
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at          TIMESTAMPTZ,
  reviewed_by_wallet   TEXT REFERENCES public.wallets(address) ON UPDATE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_user_wallet ON public.payments(user_wallet);
CREATE INDEX idx_payments_status ON public.payments(status);
CREATE INDEX idx_payments_flow ON public.payments(flow);
CREATE INDEX idx_payments_market_id ON public.payments(market_id);
CREATE INDEX idx_payments_created_at ON public.payments(created_at DESC);

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: prediction_history
-- ============================================================
CREATE TABLE public.prediction_history (
  id                       TEXT PRIMARY KEY,
  market_id                TEXT NOT NULL REFERENCES public.prediction_markets(id),
  market_title             TEXT NOT NULL,
  category_label           TEXT NOT NULL,
  selection_id             TEXT NOT NULL,
  selection_label          TEXT NOT NULL,
  amount                   NUMERIC(14,6) NOT NULL CHECK (amount >= 0),
  reserve_fee              NUMERIC(14,6) NOT NULL DEFAULT 0,
  total_charged            NUMERIC(14,6) NOT NULL CHECK (total_charged >= 0),
  claim_fee_rate           NUMERIC(5,4) NOT NULL DEFAULT 0.05,
  payout_multiple          NUMERIC(10,4) NOT NULL DEFAULT 1,
  gross_reward             NUMERIC(14,6) NOT NULL DEFAULT 0,
  net_reward               NUMERIC(14,6) NOT NULL DEFAULT 0,
  wallet_address           TEXT NOT NULL REFERENCES public.wallets(address) ON UPDATE CASCADE,
  payment_reference        TEXT NOT NULL UNIQUE,
  payment_request_id       TEXT NOT NULL,
  admin_decision_status    TEXT DEFAULT 'pending'
                             CHECK (admin_decision_status IN ('pending', 'approved', 'rejected')),
  resolution_outcome_id    TEXT,
  resolved_at              TIMESTAMPTZ,
  resolved_by_wallet       TEXT,
  payout_recorded_at       TIMESTAMPTZ,
  claimed_at               TIMESTAMPTZ,
  claim_reference          TEXT,
  reported_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prediction_history_wallet ON public.prediction_history(wallet_address);
CREATE INDEX idx_prediction_history_market ON public.prediction_history(market_id);
CREATE INDEX idx_prediction_history_status ON public.prediction_history(admin_decision_status);
CREATE INDEX idx_prediction_history_payment_ref ON public.prediction_history(payment_reference);
CREATE INDEX idx_prediction_history_created_at ON public.prediction_history(created_at DESC);

CREATE TRIGGER prediction_history_updated_at
  BEFORE UPDATE ON public.prediction_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Vue calculée pour result_status
CREATE OR REPLACE VIEW public.prediction_history_with_status AS
SELECT
  ph.*,
  CASE
    WHEN ph.claimed_at IS NOT NULL THEN 'claimed'
    WHEN ph.admin_decision_status = 'rejected' THEN 'rejected'
    WHEN ph.admin_decision_status != 'approved' THEN 'pending_review'
    WHEN ph.resolution_outcome_id IS NULL THEN 'approved_pending_result'
    WHEN ph.resolution_outcome_id = ph.selection_id THEN 'win'
    ELSE 'lose'
  END AS result_status
FROM public.prediction_history ph;

-- ============================================================
-- TABLE: ai_listings
-- ============================================================
CREATE TABLE public.ai_listings (
  id                   TEXT PRIMARY KEY,
  wallet_address       TEXT NOT NULL REFERENCES public.wallets(address) ON UPDATE CASCADE,
  display_name         TEXT NOT NULL,
  twitter_handle       TEXT NOT NULL,
  icon_src             TEXT NOT NULL,
  icon_name            TEXT NOT NULL,
  website_url          TEXT NOT NULL,
  description          TEXT NOT NULL,
  social_url           TEXT NOT NULL,
  guide_file_name      TEXT NOT NULL,
  guide_file_url       TEXT NOT NULL,
  plan_id              TEXT NOT NULL DEFAULT 'starter'
                         CHECK (plan_id IN ('free', 'starter', 'builder')),
  billing_label        TEXT NOT NULL,
  amount_usd           NUMERIC(10,2) NOT NULL DEFAULT 0,
  auto_renew_enabled   BOOLEAN NOT NULL DEFAULT false,
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected')),
  badge                TEXT NOT NULL DEFAULT 'none'
                         CHECK (badge IN ('none', 'blue', 'gold')),
  admin_notes          TEXT,
  payment_reference    TEXT,
  payment_request_id   TEXT,
  visible_in_explore   BOOLEAN NOT NULL DEFAULT true,
  visitor_count        INT NOT NULL DEFAULT 0,
  submitted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_listings_wallet ON public.ai_listings(wallet_address);
CREATE INDEX idx_ai_listings_status ON public.ai_listings(status);
CREATE INDEX idx_ai_listings_visible ON public.ai_listings(visible_in_explore) WHERE visible_in_explore = true;
CREATE INDEX idx_ai_listings_submitted ON public.ai_listings(submitted_at DESC);

CREATE TRIGGER ai_listings_updated_at
  BEFORE UPDATE ON public.ai_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- TABLE: ai_tool_social
-- ============================================================
CREATE TABLE public.ai_tool_social (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name      TEXT NOT NULL UNIQUE,
  rating_average NUMERIC(3,1) NOT NULL DEFAULT 0,
  rating_count   INT NOT NULL DEFAULT 0,
  reports        INT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER ai_tool_social_updated_at
  BEFORE UPDATE ON public.ai_tool_social
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TABLE: tool_ratings
CREATE TABLE public.tool_ratings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name  TEXT NOT NULL REFERENCES public.ai_tool_social(tool_name) ON DELETE CASCADE ON UPDATE CASCADE,
  actor_key  TEXT NOT NULL,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tool_name, actor_key)
);

CREATE INDEX idx_tool_ratings_tool ON public.tool_ratings(tool_name);

CREATE TRIGGER tool_ratings_updated_at
  BEFORE UPDATE ON public.tool_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TABLE: tool_reactions
CREATE TABLE public.tool_reactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name     TEXT NOT NULL REFERENCES public.ai_tool_social(tool_name) ON DELETE CASCADE ON UPDATE CASCADE,
  actor_key     TEXT NOT NULL,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('heart', 'thumbs-up', 'flame')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tool_name, actor_key)
);

CREATE INDEX idx_tool_reactions_tool ON public.tool_reactions(tool_name);

CREATE TRIGGER tool_reactions_updated_at
  BEFORE UPDATE ON public.tool_reactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TABLE: tool_comments
CREATE TABLE public.tool_comments (
  id         TEXT PRIMARY KEY,
  tool_name  TEXT NOT NULL REFERENCES public.ai_tool_social(tool_name) ON DELETE CASCADE ON UPDATE CASCADE,
  author     TEXT NOT NULL,
  content    TEXT NOT NULL CHECK (length(trim(content)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tool_comments_tool ON public.tool_comments(tool_name);
CREATE INDEX idx_tool_comments_created ON public.tool_comments(created_at DESC);

-- TABLE: admin_logs
CREATE TABLE public.admin_logs (
  id            TEXT PRIMARY KEY,
  admin_wallet  TEXT NOT NULL REFERENCES public.wallets(address) ON UPDATE CASCADE,
  action        TEXT NOT NULL CHECK (action IN (
    'create_prediction', 'remove_prediction', 'resolve_prediction',
    'remove_ai', 'approve_listing', 'reject_listing',
    'suspend_user', 'reactivate_user', 'approve_payment', 'reject_payment', 'add_ai'
  )),
  target_id     TEXT NOT NULL,
  details       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_logs_admin_wallet ON public.admin_logs(admin_wallet);
CREATE INDEX idx_admin_logs_action ON public.admin_logs(action);
CREATE INDEX idx_admin_logs_target ON public.admin_logs(target_id);
CREATE INDEX idx_admin_logs_created ON public.admin_logs(created_at DESC);

-- TABLE: ai_memory (1:1 avec wallets)
CREATE TABLE public.ai_memory (
  wallet_address        TEXT PRIMARY KEY REFERENCES public.wallets(address) ON DELETE CASCADE ON UPDATE CASCADE,
  user_name             TEXT,
  user_age              TEXT,
  user_location         TEXT,
  user_profession       TEXT,
  language_preference   TEXT DEFAULT 'en' CHECK (language_preference IN ('en', 'fr')),
  response_style        TEXT,
  tone_preference       TEXT,
  humor_preference      TEXT,
  projects_in_progress  JSONB NOT NULL DEFAULT '[]',
  current_goals         JSONB NOT NULL DEFAULT '[]',
  important_information JSONB NOT NULL DEFAULT '[]',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- TABLE: token_board
CREATE TABLE public.token_board (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  ticker              TEXT NOT NULL,
  logo_src            TEXT,
  price               TEXT,
  volume_24h          TEXT,
  market_cap          TEXT,
  holders             TEXT,
  status              TEXT NOT NULL DEFAULT 'Tracked',
  launched_by_wallet  TEXT REFERENCES public.wallets(address) ON UPDATE CASCADE,
  launched_by_name    TEXT,
  contract_address    TEXT UNIQUE,
  pool_address        TEXT,
  solscan_url         TEXT,
  dex_screener_url    TEXT,
  bird_eye_url        TEXT,
  gecko_terminal_url  TEXT,
  bags_fm_url         TEXT,
  initial_buy_percent NUMERIC(5,2),
  chart_points        JSONB NOT NULL DEFAULT '[]',
  last_updated_label  TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_token_board_contract ON public.token_board(contract_address);
CREATE INDEX idx_token_board_launched_by ON public.token_board(launched_by_wallet);

CREATE TRIGGER token_board_updated_at
  BEFORE UPDATE ON public.token_board
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- TABLE: payment_requests
CREATE TABLE public.payment_requests (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN ('listing', 'launch', 'prediction')),
  wallet_address  TEXT REFERENCES public.wallets(address) ON UPDATE CASCADE,
  recipient       TEXT NOT NULL,
  amount          NUMERIC(14,6) NOT NULL,
  reference       TEXT NOT NULL UNIQUE,
  currency        TEXT NOT NULL DEFAULT 'USDC' CHECK (currency IN ('SOL', 'USDC')),
  token_mint      TEXT,
  token_decimals  INT,
  label           TEXT,
  message         TEXT,
  memo            TEXT,
  encoded_url     TEXT,
  qr_code_src     TEXT,
  signature       TEXT,
  status          TEXT NOT NULL DEFAULT 'created'
                    CHECK (status IN ('created', 'signed', 'validated')),
  rpc_url         TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  validated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_requests_wallet ON public.payment_requests(wallet_address);
CREATE INDEX idx_payment_requests_reference ON public.payment_requests(reference);
CREATE INDEX idx_payment_requests_status ON public.payment_requests(status);

-- ============================================================
-- FONCTION: refresh_wallet_snapshots
-- Recalcule les compteurs de paiements pour un wallet
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_wallet_payment_stats(p_wallet TEXT)
RETURNS void AS $$
BEGIN
  UPDATE public.wallets SET
    payment_count = (
      SELECT COUNT(*) FROM public.payments WHERE user_wallet = p_wallet
    ),
    approved_payment_count = (
      SELECT COUNT(*) FROM public.payments WHERE user_wallet = p_wallet AND status = 'approved'
    ),
    pending_payment_count = (
      SELECT COUNT(*) FROM public.payments WHERE user_wallet = p_wallet AND status = 'pending'
    ),
    rejected_payment_count = (
      SELECT COUNT(*) FROM public.payments WHERE user_wallet = p_wallet AND status = 'rejected'
    ),
    total_paid_usdc = (
      SELECT COALESCE(SUM(total_paid_usdc), 0) FROM public.payments WHERE user_wallet = p_wallet
    ),
    total_won_usdc = (
      SELECT COALESCE(SUM(net_reward), 0)
      FROM public.prediction_history
      WHERE wallet_address = p_wallet
        AND admin_decision_status = 'approved'
        AND resolution_outcome_id = selection_id
    ),
    total_claimed_usdc = (
      SELECT COALESCE(SUM(net_reward), 0)
      FROM public.prediction_history
      WHERE wallet_address = p_wallet AND claimed_at IS NOT NULL
    ),
    updated_at = now()
  WHERE address = p_wallet;
END;
$$ LANGUAGE plpgsql;
```

---

## 8. Politiques RLS (Row Level Security)

### Principes généraux

L'authentification actuelle est basée sur le wallet Solana. Avec Supabase, il faudra mettre en place un mécanisme de mapping wallet → JWT. **L'approche recommandée** est d'utiliser Supabase Auth avec un provider custom (ou Anonymous + wallet signature), et de stocker l'adresse wallet dans les métadonnées de l'utilisateur Auth.

Pour identifier un admin, on vérifie `wallets.role = 'admin'` pour l'adresse connectée.

```sql
-- ============================================================
-- Activer RLS sur toutes les tables
-- ============================================================
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prediction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tool_social ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_board ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Fonction helper: obtenir l'adresse wallet depuis le JWT
-- (à adapter selon le provider Auth choisi)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_wallet_address()
RETURNS TEXT AS $$
  SELECT (auth.jwt() ->> 'wallet_address')::TEXT;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Fonction helper: vérifier si l'utilisateur connecté est admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wallets
    WHERE address = public.get_wallet_address()
      AND role = 'admin'
      AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- POLICIES: wallets
-- ============================================================

-- Lecture publique des profils actifs (pour l'affichage des pseudos)
CREATE POLICY "wallets_public_read"
  ON public.wallets FOR SELECT
  USING (status = 'active');

-- Un utilisateur peut lire son propre profil même s'il est suspendu
CREATE POLICY "wallets_own_read"
  ON public.wallets FOR SELECT
  USING (address = public.get_wallet_address());

-- Un utilisateur peut créer son propre wallet record
CREATE POLICY "wallets_self_insert"
  ON public.wallets FOR INSERT
  WITH CHECK (address = public.get_wallet_address());

-- Un utilisateur peut modifier uniquement son propre profil (champs non-critiques)
-- Les admins peuvent modifier tous les wallets
CREATE POLICY "wallets_self_update"
  ON public.wallets FOR UPDATE
  USING (
    address = public.get_wallet_address()
    OR public.is_admin()
  );

-- Seuls les admins peuvent lire tous les wallets (y compris suspendus)
CREATE POLICY "wallets_admin_read_all"
  ON public.wallets FOR SELECT
  USING (public.is_admin());

-- ============================================================
-- POLICIES: prediction_markets
-- ============================================================

-- Lecture publique des marchés actifs
CREATE POLICY "markets_public_read"
  ON public.prediction_markets FOR SELECT
  USING (is_active = true);

-- Les admins voient tout
CREATE POLICY "markets_admin_read_all"
  ON public.prediction_markets FOR SELECT
  USING (public.is_admin());

-- Seuls les admins peuvent créer/modifier/supprimer
CREATE POLICY "markets_admin_write"
  ON public.prediction_markets FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "markets_admin_update"
  ON public.prediction_markets FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "markets_admin_delete"
  ON public.prediction_markets FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- POLICIES: payments
-- ============================================================

-- Un utilisateur peut voir ses propres paiements
CREATE POLICY "payments_own_read"
  ON public.payments FOR SELECT
  USING (user_wallet = public.get_wallet_address());

-- Un utilisateur peut créer ses propres paiements
CREATE POLICY "payments_own_insert"
  ON public.payments FOR INSERT
  WITH CHECK (user_wallet = public.get_wallet_address());

-- Les admins voient et modifient tout (pour approve/reject)
CREATE POLICY "payments_admin_read"
  ON public.payments FOR SELECT
  USING (public.is_admin());

CREATE POLICY "payments_admin_update"
  ON public.payments FOR UPDATE
  USING (public.is_admin());

-- ============================================================
-- POLICIES: prediction_history
-- ============================================================

-- Un utilisateur voit uniquement son propre historique
CREATE POLICY "history_own_read"
  ON public.prediction_history FOR SELECT
  USING (wallet_address = public.get_wallet_address());

-- Un utilisateur peut créer ses propres entrées
CREATE POLICY "history_own_insert"
  ON public.prediction_history FOR INSERT
  WITH CHECK (wallet_address = public.get_wallet_address());

-- Un utilisateur peut mettre à jour ses propres entrées (pour claim)
CREATE POLICY "history_own_update"
  ON public.prediction_history FOR UPDATE
  USING (wallet_address = public.get_wallet_address());

-- Les admins voient et modifient tout
CREATE POLICY "history_admin_all"
  ON public.prediction_history FOR ALL
  USING (public.is_admin());

-- ============================================================
-- POLICIES: ai_listings
-- ============================================================

-- Lecture publique des listings approuvés et visibles
CREATE POLICY "listings_public_read"
  ON public.ai_listings FOR SELECT
  USING (status = 'approved' AND visible_in_explore = true);

-- Un utilisateur voit ses propres listings
CREATE POLICY "listings_own_read"
  ON public.ai_listings FOR SELECT
  USING (wallet_address = public.get_wallet_address());

-- Un utilisateur peut créer un listing
CREATE POLICY "listings_own_insert"
  ON public.ai_listings FOR INSERT
  WITH CHECK (wallet_address = public.get_wallet_address());

-- Un utilisateur peut mettre à jour son propre listing (champs non-critiques)
CREATE POLICY "listings_own_update"
  ON public.ai_listings FOR UPDATE
  USING (wallet_address = public.get_wallet_address())
  WITH CHECK (
    wallet_address = public.get_wallet_address()
    -- Les champs status, badge, admin_notes ne peuvent pas être modifiés par l'utilisateur
    -- (à gérer côté application ou via une function SQL)
  );

-- Les admins gèrent tout
CREATE POLICY "listings_admin_all"
  ON public.ai_listings FOR ALL
  USING (public.is_admin());

-- ============================================================
-- POLICIES: ai_tool_social, tool_ratings, tool_reactions, tool_comments
-- ============================================================

-- Lecture publique
CREATE POLICY "tool_social_public_read"
  ON public.ai_tool_social FOR SELECT USING (true);

CREATE POLICY "tool_ratings_public_read"
  ON public.tool_ratings FOR SELECT USING (true);

CREATE POLICY "tool_reactions_public_read"
  ON public.tool_reactions FOR SELECT USING (true);

CREATE POLICY "tool_comments_public_read"
  ON public.tool_comments FOR SELECT USING (true);

-- Tout utilisateur authentifié peut noter/réagir/commenter
CREATE POLICY "tool_ratings_auth_write"
  ON public.tool_ratings FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tool_ratings_auth_update"
  ON public.tool_ratings FOR UPDATE
  USING (actor_key = public.get_wallet_address() OR actor_key = auth.uid()::TEXT);

CREATE POLICY "tool_reactions_auth_write"
  ON public.tool_reactions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tool_reactions_auth_update"
  ON public.tool_reactions FOR UPDATE
  USING (actor_key = public.get_wallet_address() OR actor_key = auth.uid()::TEXT);

CREATE POLICY "tool_comments_auth_insert"
  ON public.tool_comments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Les admins peuvent supprimer des commentaires
CREATE POLICY "tool_comments_admin_delete"
  ON public.tool_comments FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- POLICIES: admin_logs
-- ============================================================

-- Seuls les admins peuvent voir les logs
CREATE POLICY "admin_logs_admin_read"
  ON public.admin_logs FOR SELECT
  USING (public.is_admin());

-- Seuls les admins peuvent créer des logs
CREATE POLICY "admin_logs_admin_insert"
  ON public.admin_logs FOR INSERT
  WITH CHECK (public.is_admin());

-- ============================================================
-- POLICIES: ai_memory
-- ============================================================

-- Un utilisateur accède uniquement à sa propre mémoire
CREATE POLICY "memory_own_all"
  ON public.ai_memory FOR ALL
  USING (wallet_address = public.get_wallet_address());

-- ============================================================
-- POLICIES: token_board
-- ============================================================

-- Lecture publique
CREATE POLICY "token_board_public_read"
  ON public.token_board FOR SELECT USING (true);

-- Seuls les admins peuvent gérer le board
CREATE POLICY "token_board_admin_write"
  ON public.token_board FOR ALL
  USING (public.is_admin());

-- ============================================================
-- POLICIES: payment_requests
-- ============================================================

-- Un utilisateur voit ses propres requêtes de paiement
CREATE POLICY "payment_requests_own_all"
  ON public.payment_requests FOR ALL
  USING (wallet_address = public.get_wallet_address());
```

---

## 9. Détection des problèmes & risques

### 9.1 Problèmes critiques identifiés

#### ① Données dupliquées entre `payments` et `prediction_history`
- `paymentReference` existe dans les deux tables mais sans contrainte FK réelle
- `totalPaidUsdc`, `amountUsdc`, `reserveFeeUsdc` sont répétés
- **Correction :** ajouter `FK prediction_history.payment_reference → payments.payment_reference`

#### ② Compteurs dénormalisés sur `wallets`
- `paymentCount`, `totalPaidUsdc`, etc. sont calculés manuellement à chaque mutation
- Risque d'incohérence si une transaction échoue à mi-chemin
- **Correction :** utiliser des triggers PostgreSQL + la fonction `refresh_wallet_payment_stats`

#### ③ `resultStatus` calculé côté client
- La logique de dérivation de `resultStatus` est dans le code TypeScript (fonction `resolvePredictionEntryStatus`)
- Risque d'incohérence entre clients
- **Correction :** remplacer par la vue `prediction_history_with_status` côté Supabase

#### ④ `uniqueVisitorKeys` stocké en array dans `ai_listings`
- Array pouvant contenir 2000 éléments — très coûteux en stockage
- **Correction :** table dédiée `listing_visitor_keys(listing_id, visitor_key, visited_at)`

#### ⑤ Système d'auth basé sur une adresse hardcodée
- `predictionMarketTreasuryAddress` = `EsR6usyjCzhgL6dZFqHRsw6pDh7CgvfHtkQzCybJMuCW` comparé directement
- Un seul admin possible, pas de gestion multi-admin
- **Correction :** stocker `role = 'admin'` dans la table `wallets` et vérifier via JWT claims

#### ⑥ Données mockées statiques dans le code
- `featuredTools` (ToolItem[]) : données hardcodées dans `octopus-market-data.ts`
- `octopusTokensSeed` : token ClawdTrust hardcodé
- **Correction :** migrer vers la table `token_board` et une table `featured_tools`

#### ⑦ Pas de clé étrangère entre `tool_ratings/reactions/comments` et `ai_listings`
- Le `toolName` utilisé dans les socials peut être n'importe quelle chaîne
- Pas de vérification que l'outil existe
- **Correction :** la table `ai_tool_social.tool_name` doit référencer un identifiant d'outil stable

#### ⑧ `userRatings` et `userReactions` stockés en JSON
- `Record<actorKey, rating>` et `Record<actorKey, reactionType>` dans un seul objet JSON
- Impossible d'indexer ou requêter efficacement
- **Correction :** tables dédiées `tool_ratings` et `tool_reactions` (déjà dans le schéma proposé)

### 9.2 Risques de sécurité

| Risque | Sévérité | Description |
|---|---|---|
| Token admin hardcodé | CRITIQUE | `directAdminSessionToken = "octopus-market-admin-wallet-access"` — chaîne statique prévisible |
| Auth admin côté client | CRITIQUE | La vérification admin se fait entièrement dans le navigateur |
| Clé API Bags.fm exposée | ÉLEVÉ | `bagsFmApiKey` est dans le code source frontend |
| Clé API Helius exposée | ÉLEVÉ | `api-key=3d4f1b3e-bf16-4bf3-96db-2a3785ddacf2` dans l'URL RPC |
| Pas de validation server-side des paiements | ÉLEVÉ | La vérification on-chain est faite côté browser |
| `uniqueVisitorKeys` en tableau local | MOYEN | Facilement contournable |

### 9.3 Incohérences de données actuelles

| Problème | Impact |
|---|---|
| `payment_history` et `bets` dans IndexedDB sont identiques | Doublon inutile |
| `username` unique vérifié en mémoire (lecture de tous les wallets) | O(n) — ne scale pas |
| `registryBetRecord` et `registryHistoryRecord` sont la même chose | Confusion architecturale |
| `solana-wallet.ts` contient du code de paiement | Violation du principe de responsabilité unique |
| Les limites de stockage (max 300, 400, 2000...) sont arbitraires | Données silencieusement tronquées |

---

## 10. Plan de migration détaillé

---

### Phase 1 — Audit et préparation (Semaine 1)

**Objectif :** Figer l'état actuel et préparer l'environnement Supabase

**Actions :**
- ✅ Audit complet (ce document)
- Exporter toutes les données existantes depuis localStorage/IndexedDB des navigateurs de test
- Créer le projet Supabase (production + staging)
- Configurer les variables d'environnement : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Installer `@supabase/supabase-js`
- Décider du provider Auth : **recommandé = Supabase Auth avec JWT custom contenant `wallet_address`**

**Risques :** Aucun (pas de modification du code)

**Critères de validation :**
- Projet Supabase actif avec les deux environnements (staging, production)
- Variables d'env configurées
- Accès au dashboard Supabase confirmé

---

### Phase 2 — Création de la base Supabase (Semaine 2)

**Objectif :** Créer toutes les tables, index, vues et politiques RLS

**Actions :**
- Exécuter les scripts SQL de la section 7 dans le bon ordre
- Activer RLS (section 8)
- Configurer Supabase Realtime sur les tables : `prediction_markets`, `payments`, `prediction_history`, `ai_listings`, `ai_tool_social`, `token_board`
- Créer les fonctions SQL utilitaires (`refresh_wallet_payment_stats`, `set_updated_at`, etc.)
- Tester les politiques RLS avec des utilisateurs de test

**Risques :** Scripts SQL mal ordonnés (FK avant tables parentes)

**Critères de validation :**
- Toutes les tables créées sans erreur
- RLS activé et testé sur chaque table
- Realtime fonctionnel (test depuis le dashboard Supabase)
- Fonctions SQL exécutables

---

### Phase 3 — Couche d'abstraction Supabase (Semaine 3)

**Objectif :** Créer les services Supabase sans toucher aux composants React

**Actions :**
- Créer `src/lib/supabase.ts` : client Supabase singleton
- Créer `src/services/supabase/` avec un fichier par domaine :
  - `wallet-service.ts` → remplace les fonctions de `octopus-central-registry.ts`
  - `prediction-service.ts` → remplace `prediction-market-store.ts`
  - `payment-service.ts` → remplace `octopus-admin.ts`
  - `listing-service.ts` → remplace `ai-listing-store.ts`
  - `social-service.ts` → remplace `ai-market-social-store.ts`
  - `memory-service.ts` → remplace `cyrdoge-memory.ts`
- Créer `src/services/auth/wallet-auth.ts` : connexion wallet → JWT Supabase
- Écrire des tests unitaires pour chaque service

**Risques :** Signature divergente avec l'API existante

**Critères de validation :**
- Chaque service peut lire/écrire dans Supabase
- Les tests passent en environnement staging

---

### Phase 4 — Migration du frontend (Semaine 4-5)

**Objectif :** Remplacer les appels localStorage/IndexedDB par les services Supabase

**Ordre de migration recommandé :**

1. **Wallet auth** (`octopus-admin-auth.ts`, `octopus-market-page.tsx`)
   - Remplacer `ensureAdminSession` par Supabase Auth
   - Connecter le wallet Phantom → obtenir un JWT Supabase signé

2. **Prédiction markets** (`prediction-market-store.ts`)
   - Remplacer `localStorage.getItem(adminCreatedPredictionMarketsStorageKey)` par `supabase.from('prediction_markets').select()`
   - Remplacer SSE custom par `supabase.channel('prediction_markets').on('postgres_changes', ...)`
   - Mettre à jour `binary-prediction-studio.tsx`, `community-ai-market.tsx`

3. **Historique & paiements** (`octopus-admin.ts`, `octopus-central-registry.ts`)
   - Remplacer `adminNotificationsCache` par queries Supabase
   - Remplacer `readPredictionHistory()` par `supabase.from('prediction_history').select()`

4. **Listings IA** (`ai-listing-store.ts`)
   - Remplacer `localStorage.getItem(aiListingStorageKey)` par Supabase
   - Migrer `uniqueVisitorKeys` vers table dédiée

5. **Social tools** (`ai-market-social-store.ts`)
   - Remplacer le cache JSON par queries `tool_ratings`, `tool_reactions`, `tool_comments`
   - Remplacer SSE par Supabase Realtime

6. **Mémoire agent** (`cyrdoge-memory.ts`)
   - Remplacer `localStorage.getItem(cyrDogeMemoryStorageKey)` par `supabase.from('ai_memory')`

7. **Thème et locale** (`use-theme-mode.ts`, `octopus-locale.tsx`)
   - Ces deux-là peuvent rester en localStorage (préférences UI pures, pas de données métier)

**Risques :** Régressions d'interface, délais de latence réseau vs localStorage

**Critères de validation :**
- Tous les flows utilisateur fonctionnent en staging
- Aucune lecture/écriture dans localStorage pour les données métier
- Realtime fonctionne entre deux onglets ouverts

---

### Phase 5 — Migration des API server-side (Semaine 5-6)

**Objectif :** Supprimer les API REST internes (remplacées par Supabase)

**Actions :**
- Supprimer les routes `/api/central-registry/*`
- Supprimer les routes `/api/admin-notifications/*`
- Supprimer les routes `/api/prediction-markets/*` (les mutations admin passent par le service Supabase avec RLS)
- Supprimer les routes `/api/tool-social/*`
- Conserver uniquement les endpoints nécessaires au futur : vérification on-chain, webhook Bags.fm

**Risques :** Régression si certains endpoints sont encore appelés

**Critères de validation :**
- Aucun appel vers `/api/central-registry`, `/api/admin-notifications`, `/api/prediction-markets`, `/api/tool-social`
- Le dashboard admin fonctionne entièrement via Supabase

---

### Phase 6 — Suppression du localStorage métier (Semaine 6)

**Objectif :** Nettoyer complètement localStorage des données métier

**Actions :**
- Ajouter un script de nettoyage one-shot pour les utilisateurs existants :
  ```typescript
  const OLD_KEYS = [
    'octopus-market-ai-listings-v2',
    'octopus-market-admin-notifications-v2',
    'octopus-market-connected-wallets-v1',
    'octopus-market-prediction-history-v4',
    'octopus-market-prediction-resolutions-v3',
    'octopus-market-admin-created-markets-v2',
    'octopus-market-payment-requests-v1',
    'octopus-market-tool-social-v3',
    'octopus-market-aido-agent-memory-v3',
    'octopus-market-wallet-snapshot-cache-v1',
    'octopus-market-central-wallets-fallback-v3',
    'octopus-market-central-payments-fallback-v3',
    'octopus-market-central-bets-fallback-v1',
    'octopus-market-central-history-fallback-v3',
    'octopus-market-central-admin-logs-fallback-v1',
    'octopus-market-ai-listings-reset-version',
  ];
  OLD_KEYS.forEach(key => localStorage.removeItem(key));
  ```
- Supprimer les fonctions `readFallbackStore`, `writeFallbackStore` de `octopus-central-registry.ts`
- Supprimer la gestion IndexedDB (`openRegistryDatabase`, `runTransaction`)

**Risques :** Perte de données locales non encore synchronisées

**Critères de validation :**
- `localStorage` ne contient plus que `octopus-market-theme` et `octopus-market-locale-v1`
- `sessionStorage` vide (session admin gérée par Supabase Auth)
- IndexedDB `octopus-market-central-registry` supprimé

---

### Phase 7 — Tests complets (Semaine 7)

**Objectif :** Valider tous les flows sur staging avant production

**Checklist de tests :**

| Flow | Test |
|---|---|
| Connexion wallet Phantom | ✓ Session Supabase créée |
| Enregistrement profil | ✓ Sauvegardé en DB, username unique |
| Pari sur prédiction | ✓ Paiement USDC on-chain + entrée en DB |
| Décision admin (approve/reject) | ✓ Status mis à jour + Realtime reçu |
| Résolution de marché | ✓ Outcome mis à jour + historique mis à jour |
| Réclamation de gains | ✓ `claimed_at` enregistré |
| Listing IA | ✓ Soumission + paiement + approbation admin |
| Visites listing | ✓ `visitor_count` incrémenté |
| Note/réaction/commentaire | ✓ Persisté en DB + Realtime |
| Dashboard admin | ✓ Tous les paiements visibles |
| Logs admin | ✓ Chaque action tracée |
| Mémoire Aido | ✓ Persistée en DB par wallet |
| Déconnexion wallet | ✓ Session Supabase invalidée |
| Multi-onglets | ✓ Realtime synchronise les deux |
| Suspension utilisateur | ✓ Accès bloqué via RLS |

**Critères de validation :**
- Zéro régression sur les flows existants
- Latence de synchronisation < 500ms via Realtime

---

### Phase 8 — Mise en production (Semaine 8)

**Objectif :** Déploiement sans interruption de service

**Actions :**
- Migration des données existantes (si des données de production existent dans les serveurs actuels)
- Feature flag pour activer Supabase progressivement (10% → 50% → 100%)
- Monitorer les erreurs Supabase dans la console 24h après déploiement
- Supprimer les anciens endpoints API après 48h de stabilité
- Mettre les clés API sensibles (Helius, Bags.fm) dans les variables d'environnement Supabase Edge Functions (plus dans le code frontend)

---

## 11. Liste des fichiers à modifier

### Fichiers à refactorer entièrement

| Fichier | Raison | Priorité |
|---|---|---|
| `src/components/octopus-market/octopus-central-registry.ts` | Remplacer IndexedDB + localStorage par Supabase | P0 |
| `src/components/octopus-market/prediction-market-store.ts` | Remplacer localStorage + SSE custom par Supabase | P0 |
| `src/components/octopus-market/octopus-admin.ts` | Remplacer localStorage + SSE custom par Supabase | P0 |
| `src/components/octopus-market/octopus-admin-auth.ts` | Remplacer session custom par Supabase Auth | P0 |
| `src/components/octopus-market/ai-listing-store.ts` | Remplacer localStorage par Supabase | P0 |
| `src/components/octopus-market/ai-market-social-store.ts` | Remplacer localStorage + SSE par Supabase Realtime | P0 |
| `src/components/octopus-market/cyrdoge-memory.ts` | Remplacer localStorage par Supabase | P1 |

### Fichiers à modifier partiellement

| Fichier | Modification | Priorité |
|---|---|---|
| `src/components/octopus-market/octopus-market-page.tsx` | Remplacer la gestion de session wallet | P0 |
| `src/components/octopus-market/solana-wallet.ts` | Supprimer `walletSnapshotCacheStorageKey` localStorage | P1 |
| `src/components/octopus-market/solana-pay.ts` | Supprimer `paymentStorageKey` localStorage, déplacer la création de tx | P1 |
| `src/components/octopus-market/octopus-market-data.ts` | Migrer `featuredTools`, `octopusTokensSeed` vers DB | P2 |
| `src/components/octopus-market/admin-control-center.tsx` | Adapter aux nouvelles API Supabase | P0 |
| `src/components/octopus-market/admin-database-panel.tsx` | Adapter aux nouvelles API Supabase | P0 |
| `src/components/octopus-market/user-dashboard-sections.tsx` | Adapter aux queries Supabase | P0 |
| `src/components/octopus-market/binary-prediction-studio.tsx` | Adapter aux marchés Supabase | P0 |
| `src/components/octopus-market/community-ai-market.tsx` | Adapter aux listings Supabase | P1 |
| `src/components/octopus-market/octopus-ai-listing-dialog.tsx` | Adapter au service listing Supabase | P1 |
| `src/components/octopus-market/solfair-launch-studio.tsx` | Déplacer la clé Bags.fm côté serveur | P1 |
| `src/components/octopus-market/cyrdoge-chat.tsx` | Adapter à la mémoire Supabase | P2 |
| `src/hooks/use-theme-mode.ts` | Peut rester en localStorage | — |
| `src/components/octopus-market/octopus-locale.tsx` | Peut rester en localStorage | — |

### Fichiers à créer

| Fichier | Rôle |
|---|---|
| `src/lib/supabase.ts` | Client Supabase singleton |
| `src/services/supabase/wallet-service.ts` | CRUD wallets |
| `src/services/supabase/prediction-service.ts` | CRUD marchés + historique |
| `src/services/supabase/payment-service.ts` | CRUD paiements |
| `src/services/supabase/listing-service.ts` | CRUD listings IA |
| `src/services/supabase/social-service.ts` | Notes, réactions, commentaires |
| `src/services/supabase/memory-service.ts` | Mémoire agent |
| `src/services/auth/wallet-auth.ts` | Auth wallet → JWT Supabase |
| `src/services/realtime/prediction-realtime.ts` | Subscriptions Realtime |

---

## 12. Estimation de la difficulté

| Dimension | Estimation | Justification |
|---|---|---|
| **Complexité globale** | 🔴 Élevée | Le stockage est au cœur de toute l'app — pas de refactoring isolable |
| **Risque de régression** | 🟡 Moyen | Bonne couverture fonctionnelle mais aucun test automatisé |
| **Durée estimée** | **6-8 semaines** développeur solo | 4-5 semaines en équipe de 2 |
| **Phase la plus critique** | Phase 4 (frontend) | 7 fichiers à refactorer complètement |
| **Phase la plus rapide** | Phase 2 (SQL) | Scripts prêts dans ce document |
| **Complexité auth** | 🔴 Élevée | Supabase Auth + wallet Solana = intégration non standard |
| **Complexité Realtime** | 🟡 Moyen | Supabase Realtime remplace bien SSE custom |
| **Migration de données** | 🟢 Faible | Peu de données de production (app récente) |

### Difficultés principales

1. **Authentification wallet** : Supabase Auth ne supporte pas nativement Phantom/Solana. Il faudra soit utiliser un JWT custom (wallet sign message → backend vérifie → émet JWT), soit utiliser Supabase Anonymous Auth + liaison wallet en DB.

2. **Remplacement des SSE** : Le pattern `EventSource + BroadcastChannel` existant fonctionne bien. Supabase Realtime est légèrement différent (WebSocket vs SSE) mais plus robuste.

3. **RLS et wallet auth** : La fonction `get_wallet_address()` dépend de la structure exacte du JWT — à définir précisément avant de commencer les phases 3-4.

---

## 13. Stratégie de déploiement sans interruption

### Option recommandée : Feature flags progressifs

```typescript
// src/lib/features.ts
export const SUPABASE_ENABLED = {
  wallets:     import.meta.env.VITE_SUPABASE_WALLETS === 'true',
  predictions: import.meta.env.VITE_SUPABASE_PREDICTIONS === 'true',
  listings:    import.meta.env.VITE_SUPABASE_LISTINGS === 'true',
  social:      import.meta.env.VITE_SUPABASE_SOCIAL === 'true',
  memory:      import.meta.env.VITE_SUPABASE_MEMORY === 'true',
};
```

**Étapes de rollout :**
1. Déployer avec tous les flags `false` → app identique
2. Activer `SUPABASE_WALLETS=true` → tester la session
3. Activer `SUPABASE_PREDICTIONS=true` → tester les marchés
4. Activer domaine par domaine avec validation à chaque étape
5. Quand tous les flags sont `true` → supprimer les flags et le code legacy

### Double-write temporaire (Phase 4 uniquement)

Pendant la migration, écrire simultanément dans localStorage ET Supabase :
```typescript
// Exemple dans wallet-service.ts
async function upsertWallet(record: RegistryWalletRecord) {
  // Legacy (à supprimer en Phase 6)
  if (!SUPABASE_ENABLED.wallets) {
    writeFallbackStore('wallets', record);
    return;
  }
  
  // Supabase
  await supabase.from('wallets').upsert(mapToDbRecord(record));
}
```

### Rollback plan

Chaque phase est réversible via les feature flags. Si une phase échoue :
1. Remettre le flag à `false`
2. L'app reprend le comportement localStorage
3. Analyser l'erreur, corriger, re-déployer

---

## Résumé exécutif

**Octopus Market** est une SPA React/TypeScript Solana complexe avec une architecture de stockage hybride locale (localStorage + IndexedDB) + serveur (API REST + SSE). L'ensemble des données métier — wallets, paris, marchés, paiements, listings IA, social — est actuellement répliqué dans le navigateur de chaque utilisateur avec synchronisation manuelle.

La migration vers Supabase simplifiera radicalement cette architecture :

| Avant | Après |
|---|---|
| 18 clés localStorage | 2 clés (thème + locale) |
| IndexedDB + fallback custom | Supabase Database |
| SSE custom × 4 | Supabase Realtime |
| Auth wallet hardcodée | Supabase Auth + JWT wallet |
| 20+ endpoints API custom | SDK Supabase direct |
| Sync manuelle cross-tabs | Realtime automatique |

**Ce rapport est prêt pour validation. Aucun code n'a été modifié.**  
**Confirmer votre accord pour démarrer la Phase 2 (création des scripts SQL en base Supabase).**
