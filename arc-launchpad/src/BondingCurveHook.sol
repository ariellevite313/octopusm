// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook}          from "./BaseHook.sol";
import {IPoolManager}      from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks}            from "v4-core/src/interfaces/IHooks.sol";
import {Hooks}             from "v4-core/src/libraries/Hooks.sol";
import {PoolKey}           from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta}      from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta}
                           from "v4-core/src/types/BeforeSwapDelta.sol";
import {IERC20}            from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}         from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard}   from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Interface minimale du FeeDistributor (staking-style rewards)
interface IFeeDistributor {
    /// @notice Notifie le distributor d'un nouvel arrivage de rewards USDC.
    ///         Le distributor doit être approuvé avant l'appel (ou pull depuis le hook).
    function notifyReward(uint256 amount) external;
}

/**
 * @title BondingCurveHook
 * @notice Hook Uniswap V4 qui implémente une bonding curve constant-product.
 *
 * ─── Architecture ──────────────────────────────────────────────────────────
 *
 *  Phase bonding (graduated == false) :
 *    beforeSwap intercepte chaque swap et calcule le prix selon x*y=k.
 *    Le hook détient les réserves directement (USDC + tokens).
 *    La pool V4 n'a pas de liquidité concentrée pendant cette phase.
 *    Le flag BEFORE_SWAP_RETURN_DELTA override complètement le calcul V4.
 *
 *  Graduation :
 *    Déclenchée quand realUsdcRaised >= GRAD_THRESHOLD.
 *    Le hook appelle poolManager.initialize() (déjà fait à la création)
 *    puis ajoute de la liquidité full-range via poolManager.modifyLiquidity().
 *    Après graduation, beforeSwap retourne ZERO_DELTA → V4 AMM standard.
 *
 * ─── Contrainte d'adresse ──────────────────────────────────────────────────
 *
 *  Les hooks V4 doivent avoir des bits spécifiques dans leur adresse.
 *  Flags requis :
 *    BEFORE_SWAP_FLAG            (bit 7)
 *    BEFORE_SWAP_RETURN_DELTA    (bit 3)
 *
 *  → Déployer avec HookMiner.find() dans le script Foundry.
 *
 * ─── Calibration ───────────────────────────────────────────────────────────
 *
 *  VIRTUAL_USDC  = 3 200 USDC    initial mcap ≈ 4 000 USDC
 *  CURVE_SUPPLY  = 800 M tokens  80 % du supply total
 *  GRAD_THRESHOLD= 4 800 USDC    graduation mcap ≈ 25 000 USDC
 *  FEE_BPS       = 200           2% sur chaque swap (50% creator / 50% treasury)
 */
contract BondingCurveHook is BaseHook, ReentrancyGuard {
    using SafeERC20    for IERC20;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    // ─── Constantes ────────────────────────────────────────────────────────

    uint256 public constant VIRTUAL_USDC    = 3_200_000_000;      // 6 dec
    uint256 public constant CURVE_SUPPLY    = 800_000_000 * 1e18; // 18 dec
    uint256 public constant LP_RESERVE      = 200_000_000 * 1e18; // 18 dec
    uint256 public constant GRAD_THRESHOLD  = 4_800_000_000;      // 6 dec
    uint256 public constant K               = VIRTUAL_USDC * CURVE_SUPPLY;
    uint256 public constant FEE_BPS         = 200;
    uint256 public constant BPS             = 10_000;
    uint256 public constant MAX_FIRST_BUY   = GRAD_THRESHOLD / 10; // 480 USDC

    // Ticks full-range (tickSpacing = 60, compatible avec fee = 0)
    int24  public constant TICK_LOWER       = -887220;
    int24  public constant TICK_UPPER       =  887220;
    uint24 public constant POOL_FEE         = 0; // 0% — le hook prend 2% via beforeSwap

    // ─── État par pool ─────────────────────────────────────────────────────

    struct CurveState {
        address memeToken;          // token meme lancé
        address usdc;               // adresse USDC (currency0 ou currency1 selon ordre)
        address creator;            // créateur du token
        address treasury;           // treasury plateforme
        address feeDistributor;     // FeeDistributor (address(0) = pas de distribution holders)
        uint256 reserveUsdc;        // réserve USDC virtuelle + réelle (6 dec)
        uint256 reserveTokens;      // réserve tokens (18 dec)
        uint256 realUsdcRaised;     // USDC nets réellement levés
        uint256 creatorFeesAccrued; // part créateur accumulée, claimable
        //
        // Split de la part créateur (= 50% des fees totales) :
        //   creatorKeepBps = BPS (10000) → 100% au créateur, 0% holders
        //   creatorKeepBps = 5000        → 50% créateur, 50% holders
        //   creatorKeepBps = 0           → 0% créateur, 100% holders
        //
        uint256 creatorKeepBps;
        bool    graduated;
        bool    initialized;
        bool    lpAdded;          // true après addGraduationLiquidity()
    }

    /// @notice État de chaque pool (indexé par PoolId)
    mapping(PoolId => CurveState) public curves;

    // ─── Events ────────────────────────────────────────────────────────────

    event CurveInitialized(PoolId indexed poolId, address token, address creator);
    event Trade(PoolId indexed poolId, address indexed trader, bool isBuy,
                uint256 usdcAmount, uint256 tokenAmount, uint256 fee);
    event FeesPaid(PoolId indexed poolId, uint256 creatorFee, uint256 treasuryFee);
    event FeesClaimed(PoolId indexed poolId, address indexed to, uint256 amount);
    event Graduated(PoolId indexed poolId, uint256 usdcToLP, uint256 tokensToLP);

    // ─── Ownership (pour setFactory) ───────────────────────────────────────

    address public owner;
    address public factory;

    // ─── Constructor ───────────────────────────────────────────────────────

    /**
     * @param _poolManager  Uniswap V4 PoolManager
     * @param _owner        Adresse qui pourra appeler setFactory().
     *                      Passer explicitement le déployeur EOA car via CREATE2
     *                      msg.sender serait le contrat CREATE2Deployer.
     */
    constructor(IPoolManager _poolManager, address _owner) BaseHook(_poolManager) {
        require(_owner != address(0), "BondingCurveHook: zero owner");
        owner = _owner;
    }

    /// @notice Appelé une seule fois par le déployeur après déploiement de la factory.
    function setFactory(address factory_) external {
        require(msg.sender == owner,       "BondingCurveHook: not owner");
        require(factory == address(0),     "BondingCurveHook: factory already set");
        require(factory_ != address(0),    "BondingCurveHook: zero factory");
        factory = factory_;
    }

    // ─── Hook permissions ──────────────────────────────────────────────────

    /**
     * @notice Déclare les flags encodés dans l'adresse du hook.
     *
     * BEFORE_SWAP           = true  → on intercepte chaque swap
     * BEFORE_SWAP_RETURN_DELTA = true  → on override les montants du swap
     * (tous les autres = false)
     */
    function getHookPermissions()
        public pure override
        returns (Hooks.Permissions memory)
    {
        return Hooks.Permissions({
            beforeInitialize:                false,
            afterInitialize:                 false, // init via setupCurve() — hookData absent dans cette version
            beforeAddLiquidity:              false,
            afterAddLiquidity:               false,
            beforeRemoveLiquidity:           false,
            afterRemoveLiquidity:            false,
            beforeSwap:                      true,
            afterSwap:                       false,
            beforeDonate:                    false,
            afterDonate:                     false,
            beforeSwapReturnDelta:           true,  // CRITIQUE — override swap amounts
            afterSwapReturnDelta:            false,
            afterAddLiquidityReturnDelta:    false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─── setupCurve : appelé par la factory après initialize() ───────────────

    /**
     * @notice Enregistre l'état d'une nouvelle bonding curve.
     *         Remplace hookData/afterInitialize car cette version de v4-core
     *         ne passe pas hookData à afterInitialize.
     *
     *         Les tokens (TOTAL_SUPPLY) doivent déjà être dans ce contrat
     *         (mintés directement au hook par le constructeur OMToken).
     *
     * @param key            PoolKey de la pool V4
     * @param memeToken      Adresse du token meme
     * @param creator        Créateur
     * @param treasury_      Treasury plateforme
     * @param feeDistributor FeeDistributor (address(0) = 100% creator)
     * @param creatorKeepBps Part créateur en bps (10000 = 100%, 5000 = 50/50)
     */
    function setupCurve(
        PoolKey calldata key,
        address memeToken,
        address creator,
        address treasury_,
        address feeDistributor,
        uint256 creatorKeepBps
    ) external {
        require(msg.sender == factory,          "BondingCurveHook: not factory");
        require(creatorKeepBps <= BPS,          "BondingCurveHook: invalid bps");
        if (creatorKeepBps < BPS) {
            require(feeDistributor != address(0), "BondingCurveHook: need distributor");
        }
        require(memeToken  != address(0),       "BondingCurveHook: zero token");
        require(creator    != address(0),       "BondingCurveHook: zero creator");
        require(treasury_  != address(0),       "BondingCurveHook: zero treasury");

        PoolId id = key.toId();
        CurveState storage s = curves[id];
        require(!s.initialized, "BondingCurveHook: already initialized");

        // Vérifier que le hook a bien les tokens (mintés directement par OMToken)
        require(
            IERC20(memeToken).balanceOf(address(this)) >= CURVE_SUPPLY + LP_RESERVE,
            "BondingCurveHook: insufficient tokens"
        );

        // Déterminer quelle currency est l'USDC
        address usdcAddr = Currency.unwrap(key.currency0) == memeToken
            ? Currency.unwrap(key.currency1)
            : Currency.unwrap(key.currency0);

        s.memeToken         = memeToken;
        s.usdc              = usdcAddr;
        s.creator           = creator;
        s.treasury          = treasury_;
        s.feeDistributor    = feeDistributor;
        s.creatorKeepBps    = creatorKeepBps;
        s.reserveUsdc       = VIRTUAL_USDC;
        s.reserveTokens     = CURVE_SUPPLY;
        s.initialized       = true;

        emit CurveInitialized(id, memeToken, creator);
    }

    // ─── beforeSwap : intercepter les swaps phase bonding ─────────────────

    /**
     * @notice Cœur du mécanisme.
     *
     * Si graduated == false :
     *   - Calcule le prix via x*y=k
     *   - Settle les tokens via le flash accounting du PoolManager
     *   - Retourne un BeforeSwapDelta qui annule le calcul V4 standard
     *
     * Si graduated == true :
     *   - Retourne ZERO_DELTA → V4 AMM standard prend la main
     *
     * Convention V4 : currency0 = USDC, currency1 = memeToken
     *   zeroForOne = true  → buy  (USDC → memeToken)
     *   zeroForOne = false → sell (memeToken → USDC)
     */
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId id = key.toId();
        CurveState storage s = curves[id];

        // Après graduation : hook prend 2% de fee en exactIn, V4 AMM gère le reste (98%)
        // POOL_FEE = 0 → pas de double-taxation. Même permissions (bits 7+3), même adresse.
        if (s.graduated) {
            // Uniquement pour exactIn (amountSpecified < 0), cas standard du router
            // Pour exactOut, pas de hook fee (amountSpecified > 0)
            if (params.amountSpecified >= 0) {
                return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
            }

            bool usdcIsC0 = (Currency.unwrap(key.currency0) == s.usdc);
            bool isBuy    = usdcIsC0 ? params.zeroForOne : !params.zeroForOne;

            uint256 grossAmt = uint256(-params.amountSpecified);
            uint256 fee      = grossAmt * FEE_BPS / BPS;

            if (fee == 0) {
                return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
            }

            if (isBuy) {
                // Specified = USDC (input) → fee en USDC → distribuer creator + treasury
                Currency currUsdc = usdcIsC0 ? key.currency0 : key.currency1;
                poolManager.take(currUsdc, address(this), fee);
                _distributeFees(s, fee, id);
                emit Trade(id, sender, true, grossAmt, 0, fee);
            } else {
                // Specified = meme tokens (input) → fee en tokens → treasury
                Currency currMeme = usdcIsC0 ? key.currency1 : key.currency0;
                poolManager.take(currMeme, s.treasury, fee);
                emit Trade(id, sender, false, 0, grossAmt, fee);
            }

            // hookDeltaSpecified = +fee : hook absorbe `fee` du côté spécifié
            // V4 AMM reçoit (grossAmt - fee) = 98% → prix naturel du marché
            return (
                BaseHook.beforeSwap.selector,
                toBeforeSwapDelta(int128(uint128(fee)), 0),
                0
            );
        }

        // Déterminer quel currency est l'USDC pour gérer les deux ordres possibles
        // (currency0 < currency1 en termes d'adresse — V4 impose cet ordre)
        bool usdcIsC0 = (Currency.unwrap(key.currency0) == s.usdc);
        Currency currencyUsdc = usdcIsC0 ? key.currency0 : key.currency1;
        Currency currencyMeme = usdcIsC0 ? key.currency1 : key.currency0;

        // isBuy : l'utilisateur envoie de l'USDC pour recevoir du meme
        bool isBuy = usdcIsC0 ? params.zeroForOne : !params.zeroForOne;

        if (isBuy) {
            // amountSpecified < 0 = exact input (USDC in)
            uint256 usdcGross = params.amountSpecified < 0
                ? uint256(-params.amountSpecified)
                : uint256(params.amountSpecified);

            (uint256 tokensOut, uint256 fee, uint256 usdcNet) = _quoteBuy(s, usdcGross);
            require(tokensOut > 0, "BondingCurveHook: zero output");

            // Partial fill si on approche du seuil
            if (s.realUsdcRaised + usdcNet > GRAD_THRESHOLD) {
                uint256 netAllowed = GRAD_THRESHOLD - s.realUsdcRaised;
                uint256 grossCapped = _ceilDiv(netAllowed * BPS, BPS - FEE_BPS);
                usdcGross = grossCapped < usdcGross ? grossCapped : usdcGross;
                (tokensOut, fee, usdcNet) = _quoteBuy(s, usdcGross);
            }

            // Flash accounting V4 :
            //   take(currencyUsdc, hook, usdcGross) → hook reçoit l'USDC du PoolManager
            //   sync + transfer + settle()           → hook dépose les meme tokens dans le PM
            poolManager.take(currencyUsdc, address(this), usdcGross);
            poolManager.sync(currencyMeme);
            IERC20(s.memeToken).safeTransfer(address(poolManager), tokensOut);
            poolManager.settle();

            // Mettre à jour l'état
            s.reserveUsdc    += usdcNet;
            s.reserveTokens  -= tokensOut;
            s.realUsdcRaised += usdcNet;
            _distributeFees(s, fee, id);

            emit Trade(id, sender, true, usdcGross, tokensOut, fee);

            // Graduation ?
            if (s.realUsdcRaised >= GRAD_THRESHOLD) {
                _graduate(key, s, id);
            }

            // BeforeSwapDelta : spécified = +usdcGross (hook a absorbé l'entrée spécifiée),
            //                   unspecified = -tokensOut (hook fournit la sortie non-spécifiée)
            // V4 flash accounting : hookDelta attribué au hook = toBalanceDelta(+usdcGross, -tokensOut)
            //   → annule exactement les deltas produits par take (−usdcGross) et settle (+tokensOut)
            //   → swapDelta locker = (−usdcGross, +tokensOut) : locker paie USDC, reçoit meme
            BeforeSwapDelta delta = toBeforeSwapDelta(
                int128(uint128(usdcGross)),
                -int128(uint128(tokensOut))
            );
            return (BaseHook.beforeSwap.selector, delta, 0);

        } else {
            // Sell : memeToken → USDC
            uint256 tokensIn = params.amountSpecified < 0
                ? uint256(-params.amountSpecified)
                : uint256(params.amountSpecified);

            (uint256 usdcOut, uint256 fee) = _quoteSell(s, tokensIn);
            require(usdcOut > 0, "BondingCurveHook: zero output");

            uint256 newReserveUsdc = s.reserveUsdc - (usdcOut + fee);
            require(newReserveUsdc >= VIRTUAL_USDC, "BondingCurveHook: below virtual");

            // Flash accounting : hook prend les meme tokens, dépose l'USDC pour le swapper
            poolManager.take(currencyMeme, address(this), tokensIn);
            poolManager.sync(currencyUsdc);
            IERC20(s.usdc).safeTransfer(address(poolManager), usdcOut);
            poolManager.settle();

            // Mettre à jour l'état
            s.reserveTokens  += tokensIn;
            s.reserveUsdc    -= (usdcOut + fee);
            if (s.realUsdcRaised >= usdcOut + fee) {
                s.realUsdcRaised -= (usdcOut + fee);
            } else {
                s.realUsdcRaised = 0;
            }
            _distributeFees(s, fee, id);

            emit Trade(id, sender, false, usdcOut, tokensIn, fee);

            BeforeSwapDelta delta = toBeforeSwapDelta(
                int128(uint128(tokensIn)),
                -int128(uint128(usdcOut))
            );
            return (BaseHook.beforeSwap.selector, delta, 0);
        }
    }

    // ─── View helpers ─────────────────────────────────────────────────────

    /**
     * @notice Retourne l'état complet d'une curve (contournement du getter struct auto-généré).
     *         Solidity décompose les structs dans les getters de mappings publics — cette
     *         fonction retourne le struct entier pour simplifier les tests et le frontend.
     */
    function getCurveState(PoolId id) external view returns (CurveState memory) {
        return curves[id];
    }

    // ─── Claim fees créateur ───────────────────────────────────────────────

    /**
     * @notice Le créateur retire ses fees accumulées.
     * @param key  PoolKey du token
     * @param to   Adresse de destination
     */
    function claimFees(PoolKey calldata key, address to) external nonReentrant {
        PoolId id = key.toId();
        CurveState storage s = curves[id];
        require(msg.sender == s.creator, "BondingCurveHook: not creator");
        require(to != address(0),        "BondingCurveHook: zero to");
        uint256 amount = s.creatorFeesAccrued;
        require(amount > 0,              "BondingCurveHook: no fees");
        s.creatorFeesAccrued = 0;
        IERC20(s.usdc).safeTransfer(to, amount);
        emit FeesClaimed(id, to, amount);
    }

    // ─── Graduation ────────────────────────────────────────────────────────

    /**
     * @dev Appelé automatiquement quand la bonding curve atteint GRAD_THRESHOLD.
     *
     * Ajoute la liquidité full-range dans la pool V4 (qui est déjà initialisée
     * mais vide jusqu'à ce moment). Après cette étape, les swaps sont gérés
     * par le PoolManager V4 standard (x*y=k concentrée).
     *
     * LP_RESERVE (200 M tokens) est resté dans ce contrat depuis l'initialisation.
     * realUsdcRaised (4 800 USDC) est dans ce contrat.
     */
    function _graduate(PoolKey calldata key, CurveState storage s, PoolId id) internal {
        require(!s.graduated, "BondingCurveHook: already graduated");
        s.graduated = true;

        uint256 usdcForLP   = s.realUsdcRaised; // 4 800 USDC
        uint256 tokensForLP = LP_RESERVE;        // 200 M tokens

        // NOTE: l'ajout de liquidité V4 est effectué APRÈS la graduation via
        // addGraduationLiquidity(), appelé hors d'un lock actif.  L'appel à
        // modifyLiquidity() depuis l'intérieur de beforeSwap (= dans un lock)
        // exige de régler les deltas retournés ; or la liquidité requise au
        // prix d'initialisation de la pool (tick 0) peut dépasser les réserves
        // disponibles du hook. Pour garantir l'atomicité et éviter tout revert,
        // on se contente de marquer la graduation ici et d'émettre l'événement.
        emit Graduated(id, usdcForLP, tokensForLP);
    }

    /**
     * @notice Ajoute la liquidité full-range dans la pool V4 post-graduation.
     *         Doit être appelé hors de tout lock actif, après que la pool a été
     *         ré-initialisée au bon sqrtPrice de graduation par la factory.
     *
     *         Les deltas de modifyLiquidity sont réglés via sync/transfer/settle.
     *
     * @param key PoolKey de la pool graduée.
     */
    function addGraduationLiquidity(PoolKey calldata key) external nonReentrant {
        PoolId id = key.toId();
        CurveState storage s = curves[id];
        require(s.graduated,      "BondingCurveHook: not graduated");
        require(!s.lpAdded,       "BondingCurveHook: LP already added");
        s.lpAdded = true;

        uint256 usdcForLP   = s.realUsdcRaised;
        uint256 tokensForLP = LP_RESERVE;

        // Appel unlock → unlockCallback → modifyLiquidity + settle delta
        poolManager.unlock(abi.encode(GradLPData({key: key, usdcForLP: usdcForLP, tokensForLP: tokensForLP})));
    }

    struct GradLPData {
        PoolKey  key;
        uint256  usdcForLP;
        uint256  tokensForLP;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "BondingCurveHook: not PM");

        GradLPData memory d = abi.decode(data, (GradLPData));
        PoolKey memory key  = d.key;

        address usdcAddr = curves[key.toId()].usdc;
        address memeAddr = curves[key.toId()].memeToken;

        IPoolManager.ModifyLiquidityParams memory lpParams = IPoolManager.ModifyLiquidityParams({
            tickLower:      TICK_LOWER,
            tickUpper:      TICK_UPPER,
            liquidityDelta: int256(_computeLiquidity(d.usdcForLP, d.tokensForLP)),
            salt:           bytes32(0)
        });

        (BalanceDelta callerDelta, ) = poolManager.modifyLiquidity(key, lpParams, "");

        int128 delta0 = callerDelta.amount0();
        int128 delta1 = callerDelta.amount1();

        if (delta0 < 0) {
            uint256 amt = uint256(uint128(-delta0));
            poolManager.sync(key.currency0);
            IERC20(usdcAddr).safeTransfer(address(poolManager), amt);
            poolManager.settle();
        } else if (delta0 > 0) {
            poolManager.take(key.currency0, address(this), uint256(uint128(delta0)));
        }

        if (delta1 < 0) {
            uint256 amt = uint256(uint128(-delta1));
            poolManager.sync(key.currency1);
            IERC20(memeAddr).safeTransfer(address(poolManager), amt);
            poolManager.settle();
        } else if (delta1 > 0) {
            poolManager.take(key.currency1, address(this), uint256(uint128(delta1)));
        }

        return "";
    }

    // ─── Helpers internes ──────────────────────────────────────────────────

    function _quoteBuy(CurveState storage s, uint256 usdcGross)
        internal view
        returns (uint256 tokensOut, uint256 fee, uint256 usdcNet)
    {
        fee     = usdcGross * FEE_BPS / BPS;
        usdcNet = usdcGross - fee;
        uint256 newReserveUsdc   = s.reserveUsdc + usdcNet;
        // Utiliser le plafond pour newReserveTokens garantit k >= K après le trade
        // (arrondi en faveur du pool : l'utilisateur reçoit légèrement moins)
        uint256 newReserveTokens = _ceilDiv(K, newReserveUsdc);
        tokensOut = s.reserveTokens > newReserveTokens
            ? s.reserveTokens - newReserveTokens
            : 0;
    }

    function _quoteSell(CurveState storage s, uint256 tokensIn)
        internal view
        returns (uint256 usdcOut, uint256 fee)
    {
        uint256 newReserveTokens = s.reserveTokens + tokensIn;
        uint256 newReserveUsdc   = K / newReserveTokens;
        uint256 usdcGross = s.reserveUsdc > newReserveUsdc
            ? s.reserveUsdc - newReserveUsdc
            : 0;
        fee     = usdcGross * FEE_BPS / BPS;
        usdcOut = usdcGross - fee;
    }

    /**
     * @dev Distribue les fees d'un trade selon les règles choisies par le créateur.
     *
     * Fee totale = 2% de chaque swap (FEE_BPS = 200).
     * Split fixe : 50% treasury / 50% part créateur.
     *
     * La "part créateur" est ensuite divisée selon creatorKeepBps :
     *
     *   creatorKeep = creatorShare × creatorKeepBps / BPS
     *     → accumulé dans s.creatorFeesAccrued, claimable via claimFees()
     *
     *   holderShare = creatorShare - creatorKeep
     *     → transféré au FeeDistributor + notifyReward() pour les holders stakés
     *
     * ┌─────────────────────────────────────────────────────────────────────┐
     * │  Exemple : fee = 2 USDC, creatorKeepBps = 6000 (60%)               │
     * │                                                                     │
     * │  treasury    = 1 USDC  (50% fixe)                                  │
     * │  creatorKeep = 0.6 USDC (60% × 1 USDC)  → claimable               │
     * │  holderShare = 0.4 USDC (40% × 1 USDC)  → FeeDistributor          │
     * └─────────────────────────────────────────────────────────────────────┘
     */
    function _distributeFees(CurveState storage s, uint256 fee, PoolId id) internal {
        if (fee == 0) return;

        uint256 creatorShare  = fee / 2;
        uint256 treasuryShare = fee - creatorShare; // absorbe le rounding

        // 1. Treasury — transfert immédiat
        if (treasuryShare > 0) {
            IERC20(s.usdc).safeTransfer(s.treasury, treasuryShare);
        }

        // 2. Part créateur — split selon creatorKeepBps
        if (creatorShare > 0) {
            uint256 creatorKeep = creatorShare * s.creatorKeepBps / BPS;
            uint256 holderShare = creatorShare - creatorKeep;

            // Part gardée par le créateur (claimable)
            if (creatorKeep > 0) {
                s.creatorFeesAccrued += creatorKeep;
            }

            // Part distribuée aux holders stakés
            if (holderShare > 0) {
                if (s.feeDistributor != address(0)) {
                    IERC20(s.usdc).safeTransfer(s.feeDistributor, holderShare);
                    IFeeDistributor(s.feeDistributor).notifyReward(holderShare);
                } else {
                    // Fallback sécurité : pas de distributor → tout au créateur
                    s.creatorFeesAccrued += holderShare;
                }
            }
        }

        emit FeesPaid(id, creatorShare, treasuryShare);
    }

    function _computeLiquidity(uint256 usdcAmount, uint256 tokenAmount)
        internal pure
        returns (uint256 liquidity)
    {
        // Estimation simple de la liquidité à ajouter full-range
        // L = sqrt(amount0 * amount1) — approximation pour full-range
        liquidity = _sqrt(usdcAmount * tokenAmount);
    }

    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) { y = z; z = (x / z + z) / 2; }
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
    }

    // ─── View helpers ──────────────────────────────────────────────────────

    function spotPrice(PoolKey calldata key) external view returns (uint256) {
        CurveState storage s = curves[key.toId()];
        return s.reserveUsdc * 1e18 / s.reserveTokens;
    }

    function graduationProgressBps(PoolKey calldata key) external view returns (uint256) {
        CurveState storage s = curves[key.toId()];
        if (s.graduated) return BPS;
        return s.realUsdcRaised * BPS / GRAD_THRESHOLD;
    }
}
