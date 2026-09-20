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

/// @dev Interface minimale de l'OMToken pour appeler addDividend()
interface IOMToken {
    function addDividend() external payable;
}

/**
 * @title BondingCurveHook
 * @notice Hook Uniswap V4 — bonding curve constant-product avec système de tiers de fees.
 *
 * Sur Arc, USDC est le token NATIF (address(0) en V4, 18 décimales EVM).
 *
 * ─── Tiers de fees ────────────────────────────────────────────────────────────
 *
 * Avant graduation :
 *   STANDARD   1,00 % → créateur 0,50 / platform 0,25 / LP 0,25 / holders 0,00
 *   COMMUNITY  1,25 % → créateur 0,40 / platform 0,30 / LP 0,30 / holders 0,25
 *   CREATEUR   1,50 % → créateur 0,80 / platform 0,40 / LP 0,30 / holders 0,00
 *   MAX        2,00 % → créateur 1,00 / platform 0,50 / LP 0,30 / holders 0,20
 *
 * Après graduation :
 *   STANDARD   0,30 % → créateur 0,10 / platform 0,05 / LP 0,15 / holders 0,00
 *   COMMUNITY  0,40 % → créateur 0,05 / platform 0,05 / LP 0,15 / holders 0,15
 *   CREATEUR   0,40 % → créateur 0,20 / platform 0,05 / LP 0,15 / holders 0,00
 *   MAX        0,50 % → créateur 0,20 / platform 0,10 / LP 0,15 / holders 0,05
 *
 * ─── Invariants ───────────────────────────────────────────────────────────────
 *   - LP : réinjectée dans reserveUsdc à chaque swap. Jamais retirable.
 *   - Graduation LP : LP tokens brûlés vers 0xdead → liquidity permanente.
 *   - Fees créateur non-claimées depuis > 2 ans → sweepables par platform.
 *   - platformWallet : configurable par owner uniquement (rotation de clé).
 */
contract BondingCurveHook is BaseHook, ReentrancyGuard {
    using SafeERC20    for IERC20;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    // ─── Enum FeeTier ──────────────────────────────────────────────────────

    enum FeeTier {
        STANDARD,   // 0 — 1,00 % avant / 0,30 % après
        COMMUNITY,  // 1 — 1,25 % avant / 0,40 % après (avec dividendes holders)
        CREATEUR,   // 2 — 1,50 % avant / 0,40 % après
        MAX         // 3 — 2,00 % avant / 0,50 % après (avec dividendes holders)
    }

    // ─── Constantes AMM (inchangées) ──────────────────────────────────────

    uint256 public constant VIRTUAL_USDC   = 1_920 * 1e18;
    uint256 public constant CURVE_SUPPLY   = 800_000_000 * 1e18;
    uint256 public constant LP_RESERVE     = 200_000_000 * 1e18;
    uint256 public constant GRAD_THRESHOLD = 4_800 * 1e18;
    uint256 public constant K              = VIRTUAL_USDC * CURVE_SUPPLY;
    uint256 public constant V2_SEED_TOKENS = 4_167 * 1e18;
    uint256 public constant BPS            = 10_000;

    // Plafonds immuables (contrat refuse plus haut)
    uint256 public constant MAX_FEE_PRE_GRAD  = 200;  // 2,00 %
    uint256 public constant MAX_FEE_POST_GRAD =  50;  // 0,50 %

    // Ticks full-range (tickSpacing = 60, fee = 0)
    int24  public constant TICK_LOWER = -887220;
    int24  public constant TICK_UPPER =  887220;
    uint24 public constant POOL_FEE   = 0;

    // Timer abandon créateur
    uint256 public constant ABANDON_DELAY = 730 days; // 2 ans

    // ─── État par pool ─────────────────────────────────────────────────────

    struct CurveState {
        address  memeToken;
        address  usdc;            // address(0) = USDC natif Arc
        address  creator;
        address  treasury;        // unused post-V3 — conservé pour compat
        FeeTier  feeTier;         // figé à setupCurve(), jamais modifiable
        uint256  reserveUsdc;     // 18 dec — réserve USDC (virtuelle + réelle + LP réinjectée)
        uint256  reserveTokens;   // 18 dec
        uint256  realUsdcRaised;  // 18 dec — USDC nets réellement levés
        uint256  creatorAccrued;  // 18 dec — fees claimables par le créateur
        uint256  platformAccrued; // 18 dec — fees claimables par le platform wallet
        uint256  creatorLastClaim;// timestamp du dernier claim créateur (ou setupCurve si jamais)
        bool     graduated;
        bool     initialized;
        bool     lpAdded;
    }

    mapping(PoolId => CurveState) public curves;

    // ─── Admin ─────────────────────────────────────────────────────────────

    address public owner;
    address public factory;

    /// @notice Wallet OMdotfun — claim platform fees + sweep abandoned
    ///         Configurable par owner uniquement (rotation de clé légitime)
    address public platformWallet;

    // ─── Events ────────────────────────────────────────────────────────────

    event CurveInitialized(PoolId indexed poolId, address token, address creator, FeeTier tier);
    event Trade(PoolId indexed poolId, address indexed trader, bool isBuy,
                uint256 usdcAmount, uint256 tokenAmount, uint256 fee);
    event FeesSplit(PoolId indexed poolId, uint256 creatorFee, uint256 platformFee,
                    uint256 lpFee, uint256 holderFee);
    event CreatorFeesClaimed(PoolId indexed poolId, address indexed to, uint256 amount);
    event PlatformFeesClaimed(PoolId indexed poolId, uint256 amount);
    event CreatorFeesSwept(PoolId indexed poolId, uint256 amount);
    event Graduated(PoolId indexed poolId, uint256 usdcToLP, uint256 tokensToLP);
    event PlatformWalletUpdated(address indexed newWallet);

    // ─── Constructor ───────────────────────────────────────────────────────

    constructor(IPoolManager _poolManager, address _owner, address _platformWallet)
        BaseHook(_poolManager)
    {
        require(_owner          != address(0), "BCH: zero owner");
        require(_platformWallet != address(0), "BCH: zero platform");
        owner          = _owner;
        platformWallet = _platformWallet;
    }

    receive() external payable {}

    // ─── Admin ─────────────────────────────────────────────────────────────

    function setFactory(address factory_) external {
        require(msg.sender == owner,   "BCH: not owner");
        require(factory == address(0), "BCH: factory already set");
        require(factory_ != address(0),"BCH: zero factory");
        factory = factory_;
    }

    /// @notice Rotation du wallet platform (clé compromise, changement d'entité légale, etc.)
    function setPlatformWallet(address wallet_) external {
        require(msg.sender == owner,  "BCH: not owner");
        require(wallet_ != address(0),"BCH: zero wallet");
        platformWallet = wallet_;
        emit PlatformWalletUpdated(wallet_);
    }

    // ─── Hook permissions ──────────────────────────────────────────────────

    function getHookPermissions()
        public pure override
        returns (Hooks.Permissions memory)
    {
        return Hooks.Permissions({
            beforeInitialize:                false,
            afterInitialize:                 false,
            beforeAddLiquidity:              false,
            afterAddLiquidity:               false,
            beforeRemoveLiquidity:           false,
            afterRemoveLiquidity:            false,
            beforeSwap:                      true,
            afterSwap:                       false,
            beforeDonate:                    false,
            afterDonate:                     false,
            beforeSwapReturnDelta:           true,
            afterSwapReturnDelta:            false,
            afterAddLiquidityReturnDelta:    false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // ─── setupCurve ────────────────────────────────────────────────────────

    /**
     * @notice Initialise l'état de la bonding curve pour un nouveau token.
     *         Appelable uniquement par la factory, une seule fois.
     *
     * @param key       PoolKey V4 (currency0=USDC natif, currency1=memeToken)
     * @param memeToken Adresse du token meme (OMToken)
     * @param creator_  Wallet créateur du token
     * @param treasury_ Wallet treasury (conservé pour compat, non utilisé dans les splits)
     * @param feeTier   Tier de fees choisi par le créateur — figé à vie
     */
    function setupCurve(
        PoolKey calldata key,
        address memeToken,
        address creator_,
        address treasury_,
        FeeTier feeTier
    ) external {
        require(msg.sender == factory,  "BCH: not factory");
        require(memeToken  != address(0),"BCH: zero token");
        require(creator_   != address(0),"BCH: zero creator");
        require(treasury_  != address(0),"BCH: zero treasury");
        require(uint8(feeTier) <= 3,    "BCH: invalid tier");

        PoolId id = key.toId();
        CurveState storage s = curves[id];
        require(!s.initialized, "BCH: already initialized");

        require(
            IERC20(memeToken).balanceOf(address(this)) >= CURVE_SUPPLY + LP_RESERVE,
            "BCH: insufficient tokens"
        );

        address usdcAddr = Currency.unwrap(key.currency0) == memeToken
            ? Currency.unwrap(key.currency1)
            : Currency.unwrap(key.currency0);

        s.memeToken        = memeToken;
        s.usdc             = usdcAddr;
        s.creator          = creator_;
        s.treasury         = treasury_;
        s.feeTier          = feeTier;
        s.reserveUsdc      = VIRTUAL_USDC;
        s.reserveTokens    = CURVE_SUPPLY;
        s.initialized      = true;
        s.creatorLastClaim = block.timestamp; // timer abandon démarre à la création

        // Approuver la factory pour le seed V2 façade
        IERC20(memeToken).approve(msg.sender, V2_SEED_TOKENS);

        emit CurveInitialized(id, memeToken, creator_, feeTier);
    }

    // ─── beforeSwap ────────────────────────────────────────────────────────

    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId id = key.toId();
        CurveState storage s = curves[id];

        // Résoudre les BPS selon le tier et l'état (pre/post graduation)
        (uint256 totalBps, uint256 cBps, uint256 pBps, uint256 lBps, uint256 hBps)
            = _resolveBps(s.feeTier, s.graduated);

        // ── Post-graduation : fee V4 sur exactOutput ───────────────────────
        if (s.graduated) {
            if (params.amountSpecified >= 0) {
                return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
            }

            bool gradUsdcIsC0 = (Currency.unwrap(key.currency0) == s.usdc);
            bool gradIsBuy    = gradUsdcIsC0 ? params.zeroForOne : !params.zeroForOne;

            uint256 grossAmt = uint256(-params.amountSpecified);
            uint256 fee      = grossAmt * totalBps / BPS;

            if (fee == 0) {
                return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
            }

            if (gradIsBuy) {
                Currency currUsdc = gradUsdcIsC0 ? key.currency0 : key.currency1;
                poolManager.take(currUsdc, address(this), fee);
                _distributeFees(s, fee, id, cBps, pBps, lBps, hBps, totalBps);
                emit Trade(id, sender, true, grossAmt, 0, fee);
            } else {
                // Sell post-grad : fee en meme tokens → treasury
                Currency currMeme = gradUsdcIsC0 ? key.currency1 : key.currency0;
                poolManager.take(currMeme, s.treasury, fee);
                emit Trade(id, sender, false, 0, grossAmt, fee);
            }

            return (
                BaseHook.beforeSwap.selector,
                toBeforeSwapDelta(int128(uint128(fee)), 0),
                0
            );
        }

        // ── Phase bonding ──────────────────────────────────────────────────
        bool usdcIsC0     = (Currency.unwrap(key.currency0) == s.usdc);
        Currency currUsdc = usdcIsC0 ? key.currency0 : key.currency1;
        Currency currMeme = usdcIsC0 ? key.currency1 : key.currency0;
        bool isBuy        = usdcIsC0 ? params.zeroForOne : !params.zeroForOne;

        if (isBuy) {
            uint256 usdcGross = params.amountSpecified < 0
                ? uint256(-params.amountSpecified)
                : uint256(params.amountSpecified);

            (uint256 tokensOut, uint256 fee, uint256 usdcNet) = _quoteBuy(s, usdcGross, totalBps);
            require(tokensOut > 0, "BCH: zero output");

            // Partial fill si on approche du seuil de graduation
            if (s.realUsdcRaised + usdcNet > GRAD_THRESHOLD) {
                uint256 netAllowed  = GRAD_THRESHOLD - s.realUsdcRaised;
                uint256 grossCapped = _ceilDiv(netAllowed * BPS, BPS - totalBps);
                usdcGross = grossCapped < usdcGross ? grossCapped : usdcGross;
                (tokensOut, fee, usdcNet) = _quoteBuy(s, usdcGross, totalBps);
            }

            poolManager.take(currUsdc, address(this), usdcGross);
            poolManager.sync(currMeme);
            IERC20(s.memeToken).safeTransfer(address(poolManager), tokensOut);
            poolManager.settle();

            s.reserveUsdc    += usdcNet;
            s.reserveTokens  -= tokensOut;
            s.realUsdcRaised += usdcNet;
            _distributeFees(s, fee, id, cBps, pBps, lBps, hBps, totalBps);

            emit Trade(id, sender, true, usdcGross, tokensOut, fee);

            if (s.realUsdcRaised >= GRAD_THRESHOLD) {
                _graduate(key, s, id);
            }

            return (
                BaseHook.beforeSwap.selector,
                toBeforeSwapDelta(int128(uint128(usdcGross)), -int128(uint128(tokensOut))),
                0
            );

        } else {
            // Sell : memeToken → USDC natif
            uint256 tokensIn = params.amountSpecified < 0
                ? uint256(-params.amountSpecified)
                : uint256(params.amountSpecified);

            (uint256 usdcOut, uint256 fee) = _quoteSell(s, tokensIn, totalBps);
            require(usdcOut > 0, "BCH: zero output");

            uint256 newReserveUsdc = s.reserveUsdc - (usdcOut + fee);
            require(newReserveUsdc >= VIRTUAL_USDC, "BCH: below virtual");

            poolManager.take(currMeme, address(this), tokensIn);
            poolManager.settle{value: usdcOut}();

            s.reserveTokens  += tokensIn;
            s.reserveUsdc    -= (usdcOut + fee);
            if (s.realUsdcRaised >= usdcOut + fee) {
                s.realUsdcRaised -= (usdcOut + fee);
            } else {
                s.realUsdcRaised = 0;
            }
            _distributeFees(s, fee, id, cBps, pBps, lBps, hBps, totalBps);

            emit Trade(id, sender, false, usdcOut, tokensIn, fee);

            return (
                BaseHook.beforeSwap.selector,
                toBeforeSwapDelta(int128(uint128(tokensIn)), -int128(uint128(usdcOut))),
                0
            );
        }
    }

    // ─── Views ─────────────────────────────────────────────────────────────

    function getCurveState(PoolId id) external view returns (CurveState memory) {
        return curves[id];
    }

    function spotPrice(PoolKey calldata key) external view returns (uint256) {
        CurveState storage s = curves[key.toId()];
        return s.reserveUsdc * 1e18 / s.reserveTokens;
    }

    function graduationProgressBps(PoolKey calldata key) external view returns (uint256) {
        CurveState storage s = curves[key.toId()];
        if (s.graduated) return BPS;
        return s.realUsdcRaised * BPS / GRAD_THRESHOLD;
    }

    /// @notice Retourne les BPS effectifs pour un pool donné (tier + état graduation)
    function effectiveBps(PoolId id)
        external view
        returns (uint256 total, uint256 creator, uint256 platform, uint256 lp, uint256 holder)
    {
        CurveState storage s = curves[id];
        return _resolveBps(s.feeTier, s.graduated);
    }

    // ─── Claim créateur ────────────────────────────────────────────────────

    /**
     * @notice Claim les fees créateur accumulées. Seul le créateur peut appeler.
     *         Reset le timer d'abandon.
     */
    function claimCreatorFees(PoolKey calldata key, address to) external nonReentrant {
        PoolId id = key.toId();
        CurveState storage s = curves[id];
        require(msg.sender == s.creator, "BCH: not creator");
        require(to != address(0),        "BCH: zero to");
        uint256 amount = s.creatorAccrued;
        require(amount > 0,              "BCH: nothing to claim");
        s.creatorAccrued  = 0;
        s.creatorLastClaim = block.timestamp; // reset timer abandon
        _sendNative(to, amount);
        emit CreatorFeesClaimed(id, to, amount);
    }

    // ─── Claim platform ────────────────────────────────────────────────────

    /**
     * @notice Claim les fees platform accumulées. Seul platformWallet peut appeler.
     */
    function claimPlatformFees(PoolKey calldata key) external nonReentrant {
        require(msg.sender == platformWallet, "BCH: not platform");
        PoolId id = key.toId();
        CurveState storage s = curves[id];
        uint256 amount = s.platformAccrued;
        require(amount > 0, "BCH: nothing to claim");
        s.platformAccrued = 0;
        _sendNative(platformWallet, amount);
        emit PlatformFeesClaimed(id, amount);
    }

    // ─── Sweep fees créateur abandonnées ───────────────────────────────────

    /**
     * @notice Sweep les fees créateur non-claimées depuis > 2 ans vers platformWallet.
     *         Seul platformWallet peut appeler.
     *         Le timer démarre à setupCurve() — même un créateur qui n'a jamais claimé
     *         est protégé pendant les 2 premières années.
     */
    function sweepAbandonedCreatorFees(PoolId[] calldata poolIds) external nonReentrant {
        require(msg.sender == platformWallet, "BCH: not platform");
        for (uint256 i; i < poolIds.length; ++i) {
            CurveState storage s = curves[poolIds[i]];
            if (!s.initialized) continue;
            if (block.timestamp - s.creatorLastClaim < ABANDON_DELAY) continue;
            uint256 amount = s.creatorAccrued;
            if (amount == 0) continue;
            s.creatorAccrued = 0;
            _sendNative(platformWallet, amount);
            emit CreatorFeesSwept(poolIds[i], amount);
        }
    }

    // ─── Graduation ────────────────────────────────────────────────────────

    function _graduate(PoolKey calldata /* key */, CurveState storage s, PoolId id) internal {
        require(!s.graduated, "BCH: already graduated");
        s.graduated = true;
        emit Graduated(id, s.realUsdcRaised, LP_RESERVE);
    }

    /**
     * @notice Ajoute la liquidité de graduation au pool V4.
     *         Les LP tokens sont envoyés à address(0xdead) — brûlés définitivement.
     *         LP lockée à vie : aucune fonction de retrait possible.
     */
    function addGraduationLiquidity(PoolKey calldata key) external nonReentrant {
        PoolId id = key.toId();
        CurveState storage s = curves[id];
        require(s.graduated, "BCH: not graduated");
        require(!s.lpAdded,  "BCH: LP already added");
        s.lpAdded = true;

        poolManager.unlock(abi.encode(GradLPData({
            key:        key,
            usdcForLP:  s.realUsdcRaised,
            tokensForLP: LP_RESERVE
        })));
    }

    struct GradLPData {
        PoolKey  key;
        uint256  usdcForLP;
        uint256  tokensForLP;
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(poolManager), "BCH: not PM");
        GradLPData memory d  = abi.decode(data, (GradLPData));
        PoolKey memory key   = d.key;
        address memeAddr     = curves[key.toId()].memeToken;

        IPoolManager.ModifyLiquidityParams memory lpParams = IPoolManager.ModifyLiquidityParams({
            tickLower:      TICK_LOWER,
            tickUpper:      TICK_UPPER,
            liquidityDelta: int256(_computeLiquidity(d.usdcForLP, d.tokensForLP)),
            salt:           bytes32(0)
        });

        (BalanceDelta callerDelta,) = poolManager.modifyLiquidity(key, lpParams, "");

        int128 delta0 = callerDelta.amount0();
        int128 delta1 = callerDelta.amount1();

        if (delta0 < 0) {
            poolManager.settle{value: uint256(uint128(-delta0))}();
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

    // ─── BPS resolution ────────────────────────────────────────────────────

    /**
     * @dev Retourne le split de fees en BPS selon le tier et l'état graduation.
     *      Les plafonds immuables (MAX_FEE_PRE_GRAD, MAX_FEE_POST_GRAD) sont respectés
     *      par construction — tout tier > MAX_FEE_POST_GRAD post-grad est impossible.
     *
     * @return total    BPS total prélevé sur le swap
     * @return creator  BPS pour le créateur
     * @return platform BPS pour OMdotfun
     * @return lp       BPS réinjecté en LP (non-retirable)
     * @return holder   BPS pour les dividendes holders (0 si STANDARD ou CREATEUR)
     */
    function _resolveBps(FeeTier tier, bool graduated)
        internal pure
        returns (uint256 total, uint256 creator, uint256 platform, uint256 lp, uint256 holder)
    {
        if (!graduated) {
            // ── Avant graduation ────────────────────────────────────────────
            if (tier == FeeTier.STANDARD)  return (100,  50, 25, 25,  0);
            if (tier == FeeTier.COMMUNITY) return (125,  40, 30, 30, 25);
            if (tier == FeeTier.CREATEUR)  return (150,  80, 40, 30,  0);
            if (tier == FeeTier.MAX)       return (200, 100, 50, 30, 20);
        } else {
            // ── Après graduation ────────────────────────────────────────────
            if (tier == FeeTier.STANDARD)  return ( 30, 10,  5, 15,  0);
            if (tier == FeeTier.COMMUNITY) return ( 40,  5,  5, 15, 15);
            if (tier == FeeTier.CREATEUR)  return ( 40, 20,  5, 15,  0);
            if (tier == FeeTier.MAX)       return ( 50, 20, 10, 15,  5);
        }
        revert("BCH: invalid tier");
    }

    // ─── Distribution des fees ─────────────────────────────────────────────

    /**
     * @dev Distribue les fees USDC natif selon le split du tier.
     *
     *  - creatorAccrued  : accumulé dans l'état — claim manuel
     *  - platformAccrued : accumulé dans l'état — claim manuel
     *  - LP              : ajouté à reserveUsdc — jamais retirable
     *  - holders         : envoyé à OMToken.addDividend() si holderBps > 0
     *
     * Dust strategy : le reste (arrondi) va au créateur.
     */
    function _distributeFees(
        CurveState storage s,
        uint256 fee,
        PoolId id,
        uint256 cBps,
        uint256 pBps,
        uint256 lBps,
        uint256 hBps,
        uint256 totalBps
    ) internal {
        if (fee == 0) return;

        uint256 fCreator  = fee * cBps / totalBps;
        uint256 fPlatform = fee * pBps / totalBps;
        uint256 fLp       = fee * lBps / totalBps;
        uint256 fHolder   = fee * hBps / totalBps;
        // Dust absorbé par le créateur (évite les pertes en arrondi)
        uint256 fDust     = fee - fCreator - fPlatform - fLp - fHolder;

        // Créateur : accumulé dans le hook
        s.creatorAccrued += (fCreator + fDust);

        // Platform : accumulé dans le hook
        s.platformAccrued += fPlatform;

        // LP : réinjecté dans la réserve (augmente la profondeur de la courbe)
        //      Le USDC physique reste dans le hook — non-retirable par construction
        s.reserveUsdc += fLp;

        // Holders : envoyé à OMToken.addDividend()
        if (fHolder > 0) {
            IOMToken(s.memeToken).addDividend{value: fHolder}();
        }

        emit FeesSplit(id, fCreator + fDust, fPlatform, fLp, fHolder);
    }

    // ─── Helpers AMM ──────────────────────────────────────────────────────

    function _quoteBuy(CurveState storage s, uint256 usdcGross, uint256 totalBps)
        internal view
        returns (uint256 tokensOut, uint256 fee, uint256 usdcNet)
    {
        fee     = usdcGross * totalBps / BPS;
        usdcNet = usdcGross - fee;
        uint256 newReserveUsdc   = s.reserveUsdc + usdcNet;
        uint256 newReserveTokens = _ceilDiv(K, newReserveUsdc);
        tokensOut = s.reserveTokens > newReserveTokens
            ? s.reserveTokens - newReserveTokens
            : 0;
    }

    function _quoteSell(CurveState storage s, uint256 tokensIn, uint256 totalBps)
        internal view
        returns (uint256 usdcOut, uint256 fee)
    {
        uint256 newReserveTokens = s.reserveTokens + tokensIn;
        uint256 newReserveUsdc   = K / newReserveTokens;
        uint256 usdcGross = s.reserveUsdc > newReserveUsdc
            ? s.reserveUsdc - newReserveUsdc
            : 0;
        fee     = usdcGross * totalBps / BPS;
        usdcOut = usdcGross - fee;
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "BCH: native transfer failed");
    }

    function _computeLiquidity(uint256 usdcAmount, uint256 tokenAmount)
        internal pure
        returns (uint256)
    {
        return _sqrt(usdcAmount * tokenAmount);
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
}
