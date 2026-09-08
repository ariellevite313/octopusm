# Notes techniques — Arc Launchpad

## §1. Décimales USDC sur Arc

L'USDC natif Arc (`0x3600...0000`) utilise **6 décimales** comme l'USDC standard.
Toutes les valeurs USDC dans le code sont en **6 dec** :
- `VIRTUAL_USDC = 3_200_000_000` → 3 200 USDC
- `GRAD_THRESHOLD = 4_800_000_000` → 4 800 USDC
- `MAX_FIRST_BUY = 480_000_000` → 480 USDC

Les tokens OM utilisent **18 décimales** (standard ERC-20).

## §2. Inconsistance mathématique du brief (calibration)

Le brief original cible trois valeurs simultanément :
- Initial mcap ≈ 4 000 USDC
- Graduation mcap ≈ 25 000 USDC
- Net raise at graduation ≈ 7 200 USDC

Pour un AMM constant-product pur ces trois cibles sont **mathématiquement inconsistantes**.

Voici pourquoi :
```
k = reserveUsdc × reserveTokens
mcap(t) = reserveUsdc(t) × total_supply / reserveTokens(t)
```

Avec `total_supply = 1e9`, `reserveTokens_0 = 800e6` :
```
mcap_0 = reserveUsdc_0 × 1e9 / 800e6  →  mcap_0 = 1.25 × reserveUsdc_0
```
Pour `mcap_0 = 4 000` : `reserveUsdc_0 = 3 200` ✓

```
mcap_grad = (reserveUsdc_0 + net_raise) × 1e9 / reserveTokens_grad
```
Mais `reserveTokens_grad` dépend de `k` et `net_raise`, donc les trois cibles se contraignent mutuellement.

**Choix effectué** : priorité aux cibles mcap.
- `VIRTUAL_USDC = 3 200` → initial mcap ≈ 4 000 ✓
- `GRAD_THRESHOLD = 4 800` → graduation mcap ≈ 25 000 ✓
- Net raise réel ≈ 4 800 USDC (non 7 200)

Si la cible net raise 7 200 devient prioritaire sur mainnet, il faudra ajuster `VIRTUAL_USDC` ou la split 80/20 curve/LP.

## §3. Choix EIP-1167 (clones minimaux)

Chaque token utilise un clone EIP-1167 de `BondingCurve` :
- Économie de gas : ~45k gas vs ~250k pour un déploiement complet
- Sécurité : même bytecode, seul le storage diffère
- L'implémentation `curveImpl` ne doit jamais être appelée directement (non initialisée)

## §4. Partial fill — logique

Quand un buy dépasse `GRAD_THRESHOLD` :
1. On calcule le `netAllowed = GRAD_THRESHOLD - realUsdcRaised`
2. On recalcule le `grossCapped = ceil(netAllowed × 10000 / 9800)`
3. Le refund = `usdcIn - grossCapped` est rendu à `msg.sender`
4. Le buy se fait exactement sur `grossCapped`
5. `_graduate()` est appelée dans la même transaction

Invariant garanti : `realUsdcRaised == GRAD_THRESHOLD` exactement après graduation.

## §5. Sécurité — checks importants

- `ReentrancyGuard` sur `buy`, `sell`, `claimFees`
- `graduated` flag one-way : une fois `true`, aucune modification possible
- `_initialized` flag pour `initialize()` : une seule initialisation par clone
- Approbations Uniswap remises à 0 après `addLiquidity` (dans `_graduate`)
- `LP_RESERVE` tokens et `realUsdcRaised` USDC vont à Uniswap lors de la graduation — le reste (fees créateur non réclamées) reste dans le contrat et est récupérable via `claimFees` post-graduation si le créateur n'a pas encore claim

## §6. Déploiement Foundry sur Arc testnet

```bash
# Installer les dépendances
cd arc-launchpad
forge install OpenZeppelin/openzeppelin-contracts

# Compiler
forge build

# Tests
forge test -vvvv

# Déployer
export DEPLOYER_PK=0x...
export TREASURY=0x...
forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --private-key $DEPLOYER_PK -vvvv

# Créer un token test
export FACTORY_ADDRESS=0x...
export ALICE_PK=0x...
forge script script/Interactions.s.sol:CreateToken --rpc-url arc_testnet --broadcast --private-key $ALICE_PK -vvvv
```

## §7. Intégration frontend

Le frontend appelle `LaunchpadFactory.createToken(name, symbol, imageUri, description, firstBuyUsdc)`.
Avant l'appel, il doit :
1. Appeler `USDC.approve(factoryAddress, firstBuyUsdc)` si `firstBuyUsdc > 0`
2. Récupérer l'event `TokenCreated` pour obtenir les adresses `curve` et `token`
3. Sauvegarder `curve` comme `arc_launch_id` et `token` comme `mint_address` en DB

Pour les trades ultérieurs, le frontend appelle directement `BondingCurve(curveAddress).buy(...)` ou `.sell(...)` après approbation USDC/token appropriée.
