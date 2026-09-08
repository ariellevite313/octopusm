# Arc Launchpad — Spécification fonctionnelle

## Cycle de vie d'un token

### 1. Création (`createToken`)
Le créateur appelle `LaunchpadFactory.createToken(name, symbol, imageUri, description, firstBuyUsdc)`.
La factory déploie un clone EIP-1167 de `BondingCurve`, puis déploie un `OMToken` en lui passant l'adresse
du clone. Le token mint la totalité du supply (1 B, 18 dec) au clone. La courbe est initialisée avec les
réserves virtuelles. Si `firstBuyUsdc > 0` la factory exécute immédiatement un buy pour le compte du
créateur dans la même transaction, avant que la tx soit visible dans le mempool. Le first buy est plafonné
à 10 % du seuil de graduation (480 USDC).

L'événement `TokenCreated` est émis par la factory.

### 2. Phase courbe (`buy` / `sell`)
La courbe est un AMM constant-product virtuel :

```
k = reserveUsdc * reserveTokens   (constante)
```

Les réserves initiales sont :

| Variable | Valeur | Justification |
|---|---|---|
| `reserveUsdc`   | 3 200 USDC (6 dec) | virtual liquidity → initial mcap ≈ 4 000 USDC |
| `reserveTokens` | 800 M tokens (18 dec) | 80 % du supply vendables |
| `k`             | 3 200e6 × 800e6 × 1e18 = 2.56e36 | constante invariante |

La courbe ne change que `reserveUsdc` et `reserveTokens`. `k` ne change jamais.

Fees : **2 % sur la jambe USDC**, splitées 50/50. Sur chaque buy : `fee = usdcIn * 200 / 10 000`,
`netIn = usdcIn - fee`. L'AMM utilise `netIn`. Le créateur accumule `fee/2` dans le contrat ; la
treasury reçoit `fee/2` immédiatement. Sur chaque sell, même mécanique en sens inverse.

Le prix spot (USDC par token, 18 dec) : `price = reserveUsdc * 1e18 / reserveTokens`.

### 3. Graduation (déclenchée par le dernier buy)
Graduation quand `realUsdcRaised >= GRAD_THRESHOLD` (4 800 USDC net).

**Partial fill** : si le buy courant dépasse le seuil, on sature à exactement `GRAD_THRESHOLD - realUsdcRaised`
USDC nets. Le surplus est remboursé à l'acheteur.

Dans la même transaction de graduation :
1. Drapeaux : `graduated = true` (non rejouable).
2. Prendre les 200 M tokens LP_RESERVE restant dans le contrat.
3. Approuver le Router Uniswap V2.
4. Appeler `router.addLiquidity(token, USDC, LP_RESERVE_TOKENS, realUsdcRaised, ...)`.
5. Envoyer les LP tokens à `0x000...dEaD` (burn permanent, aucun unlock possible).
6. Émettre `Graduated`.

Après graduation : `buy` et `sell` revertent. Le trade se déroule sur Uniswap.

### 4. Trading Uniswap (hors scope contrat, frontend)
Le frontend redirige vers la paire USDC/TOKEN créée. Les fees Uniswap (0.3 %) vont aux LP holders
(i.e. personne, puisque les LP sont brûlés → les fees s'accumulent dans la paire pour toujours).
Une intégration V4 hook 1 %+1 % est prévue pour le mainnet.

---

## Invariants
- `k = reserveUsdc * reserveTokens` est constant entre chaque trade (vérifié par assertion).
- `graduated` est un flag one-way : une fois `true`, plus aucun buy/sell.
- Les 200 M LP tokens sont brûlés, jamais récupérables.
- Aucune fonction admin post-deploy (pas d'owner, pas de rescue, pas de changement de split).
- Le token ne peut être minté que dans le constructeur (supply fixe).
- `claimFees` : seul le créateur peut retirer ses fees accumulées.

---

## Calibration (constant-product avec réserves virtuelles)
- Initial mcap ≈ **4 000 USDC** (K_u × total_supply / curve_supply × 1e-6)
- Graduation mcap ≈ **25 000 USDC** (atteint quand K_u + G_u = 8 000 USDC)
- Net raise at graduation ≈ **4 800 USDC** (= GRAD_THRESHOLD)

Note : les trois cibles du brief (4k / 25k / 7.2k) sont mathématiquement inconsistantes pour un
constant-product pur. Nous priorisons mcap initial et mcap graduation. Voir NOTES-ARC.md §2.

---

## Ce qui est immuable après `createToken`
- Adresses token, curve, creator
- `k`, `VIRTUAL_USDC`, `CURVE_SUPPLY`, `LP_RESERVE`, `GRAD_THRESHOLD`
- Adresse treasury OM
- Split fees (50/50)
- Adresses router/factory Uniswap

---

## Interfaces Solidity (signatures)

### LaunchpadFactory
```solidity
function createToken(
    string calldata name,
    string calldata symbol,
    string calldata imageUri,
    string calldata description,
    uint256 firstBuyUsdc   // 6 dec, 0 = désactivé
) external returns (address curve, address token);

event TokenCreated(
    address indexed curve,
    address indexed token,
    address indexed creator,
    string name,
    string symbol,
    string imageUri,
    string description,
    uint256 firstBuyUsdc
);
```

### BondingCurve
```solidity
function initialize(
    address token_,
    address creator_,
    address usdc_,
    address treasury_,
    address uniswapRouter_,
    address uniswapFactory_
) external;

function buy(uint256 usdcIn, uint256 minTokensOut, address recipient) external;
function sell(uint256 tokensIn, uint256 minUsdcOut, address recipient) external;

function quoteUsdcToTokens(uint256 usdcIn) external view returns (uint256 tokensOut, uint256 fee);
function quoteTokensToUsdc(uint256 tokensIn) external view returns (uint256 usdcOut, uint256 fee);

function claimFees(address to) external;

event Trade(
    address indexed trader,
    bool isBuy,
    uint256 usdcAmount,   // gross USDC
    uint256 tokenAmount,
    uint256 fee,
    uint256 realUsdcRaised,
    uint256 reserveUsdc,
    uint256 reserveTokens
);
event Graduated(address indexed pair, uint256 usdcToLP, uint256 tokensToLP);
event FeesPaid(address indexed creator, uint256 creatorFee, address treasury, uint256 treasuryFee);
```

### OMToken
```solidity
// ERC-20 standard + :
address public immutable curve;
// Pas de mint externe. Supply fixe minté au curve dans le constructor.
```
