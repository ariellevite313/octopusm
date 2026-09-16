# Memes × Stocks — Recherche Technique (Arc Mainnet)

> Synthèse des documentations officielles avant implémentation.
> Date : 12 septembre 2026 — mainnet Arc lancé le 16 septembre 2026.

---

## 1. Arc — Réseau & Paramètres Clés

| Paramètre | Valeur |
|---|---|
| **Chain ID** | `5042` (hex `0x13b2`) |
| **Gas token** | USDC natif (18 decimals via `eth_getBalance`) |
| **USDC ERC-20** | `0x3600000000000000000000000000000000000000` (6 decimals) |
| **EURC ERC-20** | `0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1` |
| **USYC ERC-20** | `0x8a5D989Bbb96929F689B0200f435f53dA42bF490` |
| **Block time** | ~500ms (2 blocs/s) |
| **Finality** | Déterministe, sub-seconde (Malachite BFT) |
| **RPC mainnet** | `https://rpc.mainnet.arc.io` |
| **Explorer** | `https://explorer.arc.io` |

### ⚠️ Piège critique : double représentation USDC

USDC est le token natif d'Arc avec **deux représentations du même solde** :
- **Natif** : `eth_getBalance` → 18 decimals (ex. `9355344270750000000` = 9.35 USDC)
- **ERC-20** : `balanceOf(0x3600...)` → 6 decimals (ex. `9355344` = 9.35 USDC)

**Ne jamais mélanger ces deux représentations.** Pour tout smart contract et frontend, utiliser **exclusivement l'interface ERC-20** à `0x3600000000000000000000000000000000000000`.

### Contrats système Arc (testnet)

| Contrat | Adresse |
|---|---|
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| CREATE2 Factory (Arachnid) | `0x4e59b44847b379578588920cA78FbF26c0B4956C` |

---

## 2. Uniswap v4 sur Arc

**Statut : ✅ Déployé sur Arc mainnet (depuis juin 2026)**

Sources : UniswapX playbook, `@uniswap/sdk-core` `ARC_ADDRESSES`, probes RPC live.

| Contrat | Adresse |
|---|---|
| **PoolManager v4** | `0x8366a39cc670b4001a1121b8f6a443a643e40951` |
| **v4 Quoter** | `0x8dc1...8f94` *(adresse complète à confirmer via sdk-core)* |
| **v3 Factory** | `0xf0db...3918` *(adresse complète à confirmer via sdk-core)* |
| **SwapRouter02 (v3)** | `0x53bf...6f77` *(adresse complète à confirmer via sdk-core)* |
| **PoolManager owner (multisig)** | `0x33f26c5d69e2c40956f22c6195b6a499cf4151e8` |

### Spécificités Arc pour Uniswap v4

- **Basefee constant** : 20 gwei (dénominé en USDC-wei), ne bouge pas → `adjustmentPerGweiBaseFee = 0`
- **Pas de WETH** : USDC est le token natif. Ne pas utiliser le sentinel `0x0`. Utiliser toujours `0x3600000000000000000000000000000000000000`
- **Permit2** : fonctionne contre l'interface ERC-20 6-decimal (standard)
- **Gas coût** : ~$0.005 pour une transaction de 250k gas (quasi gratuit)

### Pour nos Hooks Uniswap v4

L'architecture "Memes × Stocks" s'appuie sur des **hooks afterSwap** pour redistribuer des fees en quote asset (xStock ou USDC). Ce pattern est supporté par v4 sur Arc. Le PoolManager owner est un Safe — les pools seront créées par notre contrat `LaunchpadFactory` directement.

**Pattern de création de pool v4 :**
```solidity
IPoolManager(POOL_MANAGER).initialize(
    PoolKey({
        currency0: Currency.wrap(quoteAsset),   // ex: xNVDA ou USDC
        currency1: Currency.wrap(memeToken),
        fee: 3000,                               // 0.3%
        tickSpacing: 60,
        hooks: IHooks(address(ourHook))
    }),
    sqrtPriceX96
);
```

---

## 3. xStocks — Tokenized Equities

### Statut sur Arc : ❌ NON CONFIRMÉ pour l'instant

xStocks (produit de Kraken / Backed Finance) est déployé sur :
- Ethereum, Arbitrum, Mantle, Ink, Solana, TON

**Arc n'est pas listé comme chain supportée dans la documentation xStocks.** Le déploiement de tokenized assets institutionnels (ex: DTCC) sur Arc est prévu pour **H2 2027** selon Circle.

### Ce que xStocks offre (pour intégration future)

- **ERC-20 rebasing** : `balanceOf()` retourne automatiquement le solde ajusté (splits, dividendes)
- **Multiplicateur onchain** : reflète les corporate actions
- **API publique** (sans auth) :
  ```
  GET https://api.xstocks.fi/api/v2/public/assets/{symbol}
  ```
  Retourne : `name`, `symbol`, `logo`, `deployments[]` (adresses par chain), `isTradingHalted`

- **Price feed** :
  ```
  GET https://api.xstocks.fi/api/v2/public/assets/{symbol}/price-data
  ```
  Source : Nasdaq (Blue Ocean pour overnight/extended hours)

- **Bridge cross-chain** : Chainlink CCIP — permet de déplacer xStocks entre chains

### Tokens disponibles (60+ stocks)
NVDA, TSLA, MSTR, AAPL, MSFT, GOOGL, AMZN, META, SPY, QQQ...

---

## 4. Implications pour l'architecture "Memes × Stocks"

### Scénario A — Mainnet Arc (Sept 16, 2026)

xStocks n'est pas encore sur Arc. **Deux options réalistes :**

**Option A1 — Mock ERC-20 (testnet + mainnet early access)**
- Déployer des mock `xNVDA`, `xTSLA`, etc. comme ERC-20 simples
- Utiliser l'API xStocks pour les prix réels (oracle off-chain → Chainlink ou custom)
- La feature devient fonctionnelle immédiatement, on remplace par les vrais xStocks dès qu'ils arrivent sur Arc

**Option A2 — Bridge CCIP (si xStocks supporte Arc)**
- Utiliser le bridge xStocks (Chainlink CCIP, domain 26 pour Arc) pour importer les tokens
- Plus complexe UX, dépend de xStocks déployant leur bridge sur Arc mainnet

**Recommandation : Option A1 pour le lancement.**

### Scénario B — Testnet Arc (maintenant)

Utiliser des ERC-20 de test. Fonctionnellement identique à A1.

---

## 5. Architecture Smart Contracts (validée)

### Contrats à déployer

```
WhitelistRegistry.sol
├── owner: multisig/deployer
├── mapping: address quoteAsset → QuoteAssetInfo { name, symbol, pythPriceId }
└── Fonctions: addAsset(), removeAsset(), isWhitelisted()

GenericBondingCurve.sol  (extends BondingCurve.sol existant)
├── constructor: (memeToken, quoteAsset, initialPrice, slope)
├── buy(amountIn) → reçoit quoteAsset, mint memeToken
├── sell(amountIn) → burn memeToken, envoie quoteAsset
├── graduation() → crée pool Uniswap v4 quand mcap atteint seuil
└── Utilise SafeERC20 pour tous les transfers

MemeStockHook.sol  (IHooks afterSwap)
├── afterSwap: redistribue X% des fees en quoteAsset aux holders via merkle ou pro-rata
└── Seulement pour pools v4 créées post-graduation

LaunchpadFactory.sol  (update de l'existant)
├── createMemeToken(name, symbol, quoteAsset) — si quoteAsset whitelisté
├── createStockPairedToken(name, symbol, stockSymbol) — raccourci avec WhitelistRegistry lookup
└── Charge 10 USDC creation fee (inchangé)
```

### Flux utilisateur

```
1. User clique "+ Launch" → choisit "Meme Token" ou "Stock-Paired Meme"
2. Si Stock-Paired : sélectionne le stock (NVDA, TSLA...) depuis la whitelist
3. Factory.createStockPairedToken() → déploie GenericBondingCurve avec quoteAsset = xNVDA
4. Trading : les acheteurs envoient xNVDA, reçoivent le meme token
5. Prix affiché en $ (xNVDA price × NVDA/USD rate depuis xStocks API)
6. Graduation : quand mcap = seuil → crée pool v4 xNVDA/memeToken
```

---

## 6. Changements Frontend

### Wizard de création (create-token-wizard.tsx)
- Ajouter step "Type de token" : `USDC-paired` (actuel) vs `Stock-paired` (nouveau)
- Si stock-paired : dropdown de sélection du stock (feed depuis WhitelistRegistry onchain ou API interne)
- Afficher logo du stock + prix temps réel depuis xStocks API

### Page Token Detail ([id]/page.tsx)
- Détecter si `quoteAsset !== USDC`
- Si stock-paired : afficher le nom du stock, son logo, le prix en $ converti
- Chart en $ (pas en xNVDA units) pour la lisibilité

### Swap UI (token-swap-arc.tsx)
- Si stock-paired : indiquer "Vous payez en xNVDA" et afficher le solde xNVDA du wallet
- Conversion affichée : "= $X.XX"

---

## 7. Oracle de Prix

### Pour les mock xStocks (Option A1)

**Option recommandée : xStocks API comme source de vérité off-chain**
- Backend cron qui fetch `https://api.xstocks.fi/api/v2/public/assets/{symbol}/price-data`
- Stocke le prix en DB (table `stock_prices` avec `symbol`, `price_usd`, `updated_at`)
- Frontend fetch via `/api/stock-price/{symbol}`

**Pas besoin de Chainlink/Pyth pour le MVP** — les prix ne servent qu'à l'affichage.

### Pour les vrais xStocks (plus tard)

xStocks fournit ses propres oracles onchain (listés dans `/apis/openapi/oracles`). À intégrer au moment où xStocks débarque sur Arc.

---

## 8. Checklist — État d'avancement (12 sept. 2026)

- [x] Chain ID Arc mainnet : `5042`
- [x] USDC ERC-20 Arc : `0x3600000000000000000000000000000000000000`
- [x] Uniswap v4 PoolManager Arc : `0x8366a39cc670b4001a1121b8f6a443a643e40951`
- [x] Permit2 Arc : `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- [x] xStocks API endpoint confirmé : `https://api.xstocks.fi/api/v2/public/assets/`
- [x] xStocks PAS encore sur Arc → utiliser mocks ERC-20
- [x] Prix xStocks : disponibles via API publique (sans auth)
- [x] `WhitelistRegistry.sol` — implémenté (`arc-launchpad/src/`)
- [x] `MockXStock.sol` — implémenté (xNVDA, xTSLA, xMSTR, xAAPL, xSPY)
- [x] `GenericBondingCurve.sol` — implémenté (quoteAsset configurable)
- [x] `LaunchpadFactory.sol` — mis à jour (`createStockPairedToken()`)
- [x] `Deploy.s.sol` — mis à jour (déploie tous les mocks + registry)
- [x] Migration DB — `20260912_stock_paired_tokens.sql` (quote_asset + stock_symbol)
- [x] API `/api/launchpad/stock-price/[symbol]` — proxy xStocks + fallback mock
- [x] API `/api/launchpad/quote-assets` — liste des 5 xStocks
- [x] Wizard création — sélecteur USDC / Stock-Paired + `createStockPairedToken()`
- [x] `token-swap-arc.tsx` — support GenericBondingCurve + prix temps réel
- [x] `launchpad-client.tsx` — badge `📈 $NVDA` sur cards et rows
- [ ] **À faire : run `Deploy.s.sol` sur Arc testnet → récupérer les adresses**
- [ ] **À faire : remplir `NEXT_PUBLIC_X*_ADDRESS` dans `.env.local`**
- [ ] **À faire : appliquer migration SQL dans Supabase**

---

## Sources

- [Arc Docs — Network](https://docs.arc.io/arc-chain)
- [Arc Docs — Contract Addresses](https://docs.arc.io/arc/references/contract-addresses)
- [Arc Docs — RPC Endpoints](https://docs.arc.io/arc/references/rpc-endpoints)
- [Uniswap v4 sur Arc — UniswapX Playbook](https://github.com/Uniswap/UniswapX/blob/main/playbook/chains/arc.md)
- [xStocks Developer Docs](https://docs.xstocks.fi/developers)
- [xStocks API Reference](https://docs.xstocks.fi/apis/openapi/assets)
- [Circle — Arc Launch Announcement](https://www.circle.com/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch)
- [Uniswap brings v4 to Arc](https://coinpaprika.com/news/uniswap-brings-v4-liquidity-circle-arc/)
