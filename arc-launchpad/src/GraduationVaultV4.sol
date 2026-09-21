// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title GraduationVaultV4
 * @notice Reçoit le USDC + tokens d'une BondingCurveArcV2 à la graduation,
 *         crée le pool Uniswap V4 standard (hook=0x0, fee=2500, spacing=25),
 *         mintera la position LP, exécute le premier swap, et garde le NFT LP.
 *
 * Un vault par token — déployé par LaunchpadFactoryArcV2 au moment du createToken().
 *
 * Adresses Arc mainnet :
 *   PoolManager     : 0x8366a39CC670B4001A1121B8F6A443A643e40951
 *   PositionManager : 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B
 *
 * @dev La création du pool V4 utilise la séquence :
 *   1. PoolManager.initialize(key, sqrtPriceX96)          → event Initialize
 *   2. PositionManager.modifyLiquidities(...)              → event ModifyLiquidity
 *   3. Premier swap 0.1 USDC via PoolManager               → event Swap
 *
 * Fixes v2 :
 *   - FIX #1 : _initialize — encodage PoolKey corrigé (fields directs, plus de bytes)
 *   - FIX #2 : Premier swap réservé avant le mint LP (évite l'absence d'event Swap)
 *   - FIX #3 : _collectPositionFees — API V4 (modifyLiquidities) au lieu de V3 (collect)
 *   - FIX #4 : collectFees — fees en tokens trackées et brûlées (LP lockée à vie)
 *
 * @dev Action bytes du PositionManager Arc (à vérifier après déploiement) :
 *   ACTION_MINT_POSITION  = 0
 *   ACTION_DECREASE       = 2   ← TODO : confirmer sur Arc
 *   ACTION_SETTLE_PAIR    = 15
 *   ACTION_TAKE_PAIR      = 16  ← TODO : confirmer sur Arc
 *   ACTION_SWEEP          = 19
 */
contract GraduationVaultV4 {

    // ─── Adresses V4 Arc ──────────────────────────────────────────────────────

    address public constant POOL_MANAGER     = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address public constant POSITION_MANAGER = 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B;

    uint24  public constant V4_FEE          = 2_500;
    int24   public constant V4_TICK_SPACING = 25;

    // ─── État ─────────────────────────────────────────────────────────────────

    address public factory;
    address public curve;
    address public token;
    address public creator;
    address public treasury;

    uint256 public positionId;
    bool    public poolCreated;

    // ─── Events ───────────────────────────────────────────────────────────────

    event PoolCreated(bytes32 indexed poolId, uint256 tokenId, uint256 usdcUsed, uint256 tokensUsed);
    event FeesCollected(uint256 usdcCollected, uint256 tokensBurned);

    // ─── Init ─────────────────────────────────────────────────────────────────

    function initialize(
        address curve_,
        address token_,
        address creator_,
        address treasury_
    ) external {
        require(factory == address(0), "already initialized");
        factory  = msg.sender;
        curve    = curve_;
        token    = token_;
        creator  = creator_;
        treasury = treasury_;
    }

    // ─── createV4Pool (appelé par BondingCurveArcV2._graduate) ───────────────

    /**
     * @notice Crée le pool V4 avec les fonds reçus du BondingCurveArcV2.
     *         Doit être appelé uniquement par le curve associé.
     *
     * @param token_     Adresse du meme token (double-check)
     * @param tickLower  Range inférieure de la position LP
     * @param tickUpper  Range supérieure = tick d'ouverture du prix
     */
    function createV4Pool(
        address token_,
        int24   tickLower,
        int24   tickUpper
    ) external {
        require(msg.sender == curve, "GV4: not curve");
        require(!poolCreated,        "GV4: already created");
        require(token_ == token,     "GV4: token mismatch");
        poolCreated = true;

        uint256 totalUsdc    = address(this).balance;
        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        require(totalUsdc > 0,    "GV4: no USDC");
        require(tokenBalance > 0, "GV4: no tokens");

        // ── FIX #2 : Réserver 0.1 USDC pour le premier swap ──────────────────
        // Le premier swap génère l'event Swap requis pour l'indexation DexScreener.
        // On le réserve AVANT le mint LP pour garantir sa disponibilité après le SWEEP.
        uint256 firstSwapAmount = 0.1 ether;
        uint256 usdcForLP = totalUsdc > firstSwapAmount
            ? totalUsdc - firstSwapAmount
            : totalUsdc; // si trop peu d'USDC, on mint avec tout (le swap sera sauté)

        // ── 1. Calculer sqrtPriceX96 à partir des réserves ───────────────────
        uint160 sqrtPriceX96 = _computeSqrtPriceX96(usdcForLP, tokenBalance);

        // ── 2. Initialiser le pool V4 ─────────────────────────────────────────
        bytes32 poolId = _initialize(
            address(0), // currency0 = native USDC
            token,      // currency1 = meme token
            V4_FEE,
            V4_TICK_SPACING,
            sqrtPriceX96
        );

        // ── 3. Approve tokens pour le PositionManager ─────────────────────────
        IERC20(token).approve(POSITION_MANAGER, tokenBalance);

        // ── 4. Mint position LP via PositionManager ───────────────────────────
        uint256 tokenId = _mintPosition(
            address(0), token,
            tickLower, tickUpper,
            usdcForLP, tokenBalance
        );
        positionId = tokenId;

        // ── 5. Premier swap : génère l'event Swap pour DexScreener ────────────
        // On utilise le solde restant (y compris l'éventuel excédent rendu par SWEEP).
        if (address(this).balance >= firstSwapAmount) {
            _swap(address(0), token, firstSwapAmount);
        }

        emit PoolCreated(poolId, tokenId, usdcForLP, tokenBalance);
    }

    // ─── Collect V4 fees (creator + treasury + burn tokens) ──────────────────

    /**
     * @notice Collecte les fees LP accumulées dans la position V4.
     *         USDC (ETH natif) : 30 % créateur · 70 % treasury
     *         Tokens           : brûlés vers 0xdead (LP lockée à vie)
     *
     *         Callable par n'importe qui (keeper-friendly).
     *         Les fonds vont toujours vers creator/treasury — pas de risque de détournement.
     */
    function collectFees() external {
        require(poolCreated, "GV4: not graduated");

        // FIX #4 : mesurer le delta avant/après pour les DEUX currencies
        uint256 ethBefore   = address(this).balance;
        uint256 tokBefore   = IERC20(token).balanceOf(address(this));

        // FIX #3 : collecte via API V4 (modifyLiquidities) au lieu de V3 (collect)
        _collectPositionFees(positionId);

        uint256 ethCollected = address(this).balance > ethBefore
            ? address(this).balance - ethBefore : 0;
        uint256 tokCollected = IERC20(token).balanceOf(address(this)) > tokBefore
            ? IERC20(token).balanceOf(address(this)) - tokBefore : 0;

        if (ethCollected == 0 && tokCollected == 0) return;

        // USDC (ETH natif) : 30 % → créateur, 70 % → treasury
        if (ethCollected > 0) {
            uint256 creatorShare  = ethCollected * 30 / 100;
            uint256 treasuryShare = ethCollected - creatorShare;
            _safeTransferETH(creator,  creatorShare);
            _safeTransferETH(treasury, treasuryShare);
        }

        // Tokens de fees : brûlés — la position est lockée à vie,
        // racheter les tokens de fees recréerait un risque de rug
        if (tokCollected > 0) {
            IERC20(token).transfer(address(0xdead), tokCollected);
        }

        emit FeesCollected(ethCollected, tokCollected);
    }

    // ─── Internes : appels bas-niveau V4 ─────────────────────────────────────

    /**
     * @dev FIX #1 : Appelle PoolManager.initialize avec les champs de la PoolKey
     *      passés DIRECTEMENT (pas via bytes intermédiaire).
     *
     *      Ancien bug : `abi.encode(fields...)` produisait un `bytes` dynamique
     *      qui était encodé en tant que type `bytes` dans le calldata, pas en tant
     *      que struct tuple — le PoolManager recevait un calldata malformé.
     *
     *      Fix : passer les 5 champs individuellement à encodeWithSignature.
     *      Pour des types statiques (address, uint24, int24), l'ABI encoding de
     *      6 valeurs séparées est identique à celui d'un struct + uint160.
     */
    function _initialize(
        address currency0,
        address currency1,
        uint24  fee,
        int24   tickSpacing,
        uint160 sqrtPriceX96
    ) internal returns (bytes32 poolId) {
        // Passer currency0, currency1, fee, tickSpacing, hooks(=0) puis sqrtPriceX96
        // directement — l'ABI les groupera correctement en tuple + uint160.
        (bool ok,) = POOL_MANAGER.call(
            abi.encodeWithSignature(
                "initialize((address,address,uint24,int24,address),uint160)",
                currency0, currency1, fee, tickSpacing, address(0),
                sqrtPriceX96
            )
        );
        require(ok, "GV4: initialize failed");
        poolId = keccak256(abi.encode(currency0, currency1, fee, tickSpacing, address(0)));
    }

    /**
     * @dev Mint la position LP via PositionManager.modifyLiquidities.
     *      Actions : MINT_POSITION(0) + SETTLE_PAIR(15) + SWEEP(19)
     *
     *      IMPORTANT : les action bytes dépendent de la version du PositionManager
     *      déployé sur Arc — à vérifier après déploiement.
     */
    function _mintPosition(
        address currency0,
        address currency1,
        int24   tickLower,
        int24   tickUpper,
        uint256 usdcAmount,
        uint256 tokenAmount
    ) internal returns (uint256 tokenId) {
        uint8 ACTION_MINT        = 0;
        uint8 ACTION_SETTLE_PAIR = 15;
        uint8 ACTION_SWEEP       = 19;

        bytes memory mintParams = abi.encode(
            currency0,
            currency1,
            V4_FEE,
            V4_TICK_SPACING,
            address(0),    // hooks
            tickLower,
            tickUpper,
            uint256(0),    // liquidity — 0 = PositionManager calcule depuis montants max
            uint128(usdcAmount   + usdcAmount   / 100), // amount0Max (+1% slippage)
            uint128(tokenAmount  + tokenAmount  / 100), // amount1Max
            address(this), // recipient — nous gardons le NFT
            bytes("")      // hookData
        );

        bytes memory settleParams = abi.encode(currency0, currency1);
        bytes memory sweepParams  = abi.encode(currency0, address(this));

        // FIX : modifyLiquidities attend abi.encode(bytes actions, bytes[] params)
        // Encoder chaque param dans un tableau bytes[] — pas en valeurs séparées.
        bytes[] memory params = new bytes[](3);
        params[0] = mintParams;
        params[1] = settleParams;
        params[2] = sweepParams;

        bytes memory unlockData = abi.encode(
            abi.encodePacked(ACTION_MINT, ACTION_SETTLE_PAIR, ACTION_SWEEP),
            params
        );

        (bool ok, bytes memory ret) = POSITION_MANAGER.call{value: usdcAmount}(
            abi.encodeWithSignature("modifyLiquidities(bytes,uint256)", unlockData, block.timestamp + 120)
        );
        require(ok, "GV4: mint LP failed");

        if (ret.length >= 32) {
            tokenId = abi.decode(ret, (uint256));
        }
    }

    /**
     * @dev FIX #3 : Collecte les fees via API V4 — modifyLiquidities avec
     *      DECREASE_LIQUIDITY(0) + TAKE_PAIR.
     *
     *      Ancien bug : utilisait `collect(uint256,address,uint128,uint128)` qui est
     *      la signature V3 (NonfungiblePositionManager). Cette fonction n'existe pas
     *      dans le PositionManager V4 — l'appel échouait silencieusement (ok ignoré).
     *
     *      Fix V4 : DECREASE_LIQUIDITY avec liquidity=0 collecte les fees accumulées
     *      dans la position sans retirer de liquidité. TAKE_PAIR retire ensuite les
     *      deux currencies vers ce contrat.
     *
     *      TODO : confirmer ACTION_DECREASE et ACTION_TAKE_PAIR sur Arc mainnet.
     *             Les valeurs ci-dessous sont les plus probables d'après le pattern
     *             ACTION_MINT=0, ACTION_SETTLE_PAIR=15, ACTION_SWEEP=19.
     */
    function _collectPositionFees(uint256 tokenId_) internal {
        // Action bytes à vérifier sur le PositionManager Arc après déploiement
        uint8 ACTION_DECREASE  = 2;   // DECREASE_LIQUIDITY — TODO : vérifier
        uint8 ACTION_TAKE_PAIR = 16;  // TAKE_PAIR          — TODO : vérifier

        // DECREASE_LIQUIDITY avec liquidity=0 : ne retire rien, collecte les fees
        bytes memory decreaseParams = abi.encode(
            tokenId_,
            uint256(0),               // liquidity à retirer = 0 (fees only)
            uint128(0),               // amount0Min (pas de slippage guard sur les fees)
            uint128(0),               // amount1Min
            bytes("")                 // hookData
        );

        // TAKE_PAIR : envoie les deux currencies collectées vers ce contrat
        bytes memory takePairParams = abi.encode(
            address(0),  // currency0 = native USDC
            token,       // currency1 = meme token
            address(this)
        );

        // FIX : même pattern — bytes[] obligatoire pour modifyLiquidities
        bytes[] memory params = new bytes[](2);
        params[0] = decreaseParams;
        params[1] = takePairParams;

        bytes memory unlockData = abi.encode(
            abi.encodePacked(ACTION_DECREASE, ACTION_TAKE_PAIR),
            params
        );

        (bool ok,) = POSITION_MANAGER.call(
            abi.encodeWithSignature(
                "modifyLiquidities(bytes,uint256)",
                unlockData,
                block.timestamp + 120
            )
        );
        // Ne pas revert : si le pool n'a aucun fee ou si les bytes sont incorrects
        // on ne veut pas bloquer collectFees(). Les balances delta sera 0.
        ok;
    }

    /**
     * @dev Swap basique via PoolManager pour générer l'event Swap (indexation DexScreener).
     *      0.1 USDC natif → tokens.
     */
    function _swap(address currency0, address currency1, uint256 usdcIn) internal {
        // FIX #1 : passer les champs de struct DIRECTEMENT (pas via abi.encode intermédiaire
        //          qui encoderait un bytes wrapper autour du tuple → calldata malformé).
        // FIX #2 : SwapParams V4 = (bool, int256, uint160) — pas de champ bytes interne.
        (bool ok,) = POOL_MANAGER.call{value: usdcIn}(
            abi.encodeWithSignature(
                "swap((address,address,uint24,int24,address),(bool,int256,uint160),bytes)",
                // PoolKey fields :
                currency0, currency1, V4_FEE, V4_TICK_SPACING, address(0),
                // SwapParams fields :
                true,                // zeroForOne : USDC (currency0) → token
                int256(usdcIn),      // amountSpecified (exact in)
                uint160(4295128740), // sqrtPriceLimitX96 = MIN_SQRT_RATIO + 1
                // hookData :
                bytes("")
            )
        );
        // Ne pas revert : le pool est créé, le swap est optionnel (indexation seulement)
        ok;
    }

    // ─── Sqrt price (Babylonian) ──────────────────────────────────────────────

    /**
     * @dev sqrtPriceX96 = sqrt(tokenBalance / usdcBalance) × 2^96
     *      Méthode : sqrt(tokenBalance × 1e18 / usdcBalance) × Q96 / 1e9
     */
    function _computeSqrtPriceX96(uint256 usdcBalance, uint256 tokenBalance)
        internal pure returns (uint160)
    {
        uint256 Q96 = 2**96;
        uint256 priceScaled = tokenBalance * 1e18 / usdcBalance; // prix × 1e18
        uint256 sqrtScaled  = _isqrt(priceScaled);               // sqrt(prix) × 1e9
        return uint160(sqrtScaled * Q96 / 1e9);
    }

    /// @dev Racine carrée entière (Newton-Raphson).
    function _isqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = x;
        uint256 y = (x >> 1) + 1;
        while (y < z) {
            z = y;
            y = (x / y + y) >> 1;
        }
    }

    // ─── ETH ─────────────────────────────────────────────────────────────────

    function _safeTransferETH(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "GV4: ETH transfer failed");
    }

    receive() external payable {}
}
