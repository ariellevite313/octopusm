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
    function notifyReward(uint256 amount) external;
}

/**
 * @title BondingCurveHook
 * @notice Hook Uniswap V4 implémentant une bonding curve constant-product.
 *
 * Sur Arc, USDC est le token NATIF de la chaîne (address(0) en V4).
 * Toutes les réserves USDC sont en 18 décimales (EVM natif).
 *
 * ─── Constantes (18 dec USDC natif) ───────────────────────────────────────
 *   VIRTUAL_USDC  = 3 200 USDC  → 3_200 * 1e18
 *   GRAD_THRESHOLD= 4 800 USDC  → 4_800 * 1e18
 *   K             = VIRTUAL_USDC * CURVE_SUPPLY  (valide dans uint256)
 */
contract BondingCurveHook is BaseHook, ReentrancyGuard {
    using SafeERC20    for IERC20;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;

    // ─── Constantes ────────────────────────────────────────────────────────

    uint256 public constant VIRTUAL_USDC    = 3_200 * 1e18;            // 18 dec natif
    uint256 public constant CURVE_SUPPLY    = 800_000_000 * 1e18;      // 18 dec
    uint256 public constant LP_RESERVE      = 200_000_000 * 1e18;      // 18 dec
    uint256 public constant GRAD_THRESHOLD  = 4_800 * 1e18;            // 18 dec natif
    uint256 public constant K               = VIRTUAL_USDC * CURVE_SUPPLY;
    uint256 public constant FEE_BPS         = 200;
    uint256 public constant BPS             = 10_000;
    uint256 public constant MAX_FIRST_BUY   = GRAD_THRESHOLD / 10;     // 480 USDC natif

    // Ticks full-range (tickSpacing = 60, fee = 0)
    int24  public constant TICK_LOWER       = -887220;
    int24  public constant TICK_UPPER       =  887220;
    uint24 public constant POOL_FEE         = 0;

    // ─── État par pool ─────────────────────────────────────────────────────

    struct CurveState {
        address memeToken;
        address usdc;               // address(0) = USDC natif Arc
        address creator;
        address treasury;
        address feeDistributor;
        uint256 reserveUsdc;        // 18 dec — réserve USDC virtuelle + réelle
        uint256 reserveTokens;      // 18 dec
        uint256 realUsdcRaised;     // 18 dec — USDC nets réellement levés
        uint256 creatorFeesAccrued; // 18 dec — fees claimables par le créateur
        uint256 creatorKeepBps;
        bool    graduated;
        bool    initialized;
        bool    lpAdded;
    }

    mapping(PoolId => CurveState) public curves;

    // ─── Events ────────────────────────────────────────────────────────────

    event CurveInitialized(PoolId indexed poolId, address token, address creator);
    event Trade(PoolId indexed poolId, address indexed trader, bool isBuy,
                uint256 usdcAmount, uint256 tokenAmount, uint256 fee);
    event FeesPaid(PoolId indexed poolId, uint256 creatorFee, uint256 treasuryFee);
    event FeesClaimed(PoolId indexed poolId, address indexed to, uint256 amount);
    event Graduated(PoolId indexed poolId, uint256 usdcToLP, uint256 tokensToLP);

    // ─── Ownership ─────────────────────────────────────────────────────────

    address public owner;
    address public factory;

    // ─── Constructor ───────────────────────────────────────────────────────

    /**
     * @param _poolManager  Uniswap V4 PoolManager
     * @param _owner        EOA déployeur (CREATE2 = msg.sender est CREATE2Deployer)
     */
    constructor(IPoolManager _poolManager, address _owner) BaseHook(_poolManager) {
        require(_owner != address(0), "BondingCurveHook: zero owner");
        owner = _owner;
    }

    /// @notice Accepte le native ETH (USDC Arc) envoyé par le PoolManager (take native).
    receive() external payable {}

    // ─── Admin ─────────────────────────────────────────────────────────────

    function setFactory(address factory_) external {
        require(msg.sender == owner,    "BondingCurveHook: not owner");
        require(factory == address(0),  "BondingCurveHook: factory already set");
        require(factory_ != address(0), "BondingCurveHook: zero factory");
        factory = factory_;
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

    function setupCurve(
        PoolKey calldata key,
        address memeToken,
        address creator,
        address treasury_,
        address feeDistributor,
        uint256 creatorKeepBps
    ) external {
        require(msg.sender == factory,         "BondingCurveHook: not factory");
        require(creatorKeepBps <= BPS,         "BondingCurveHook: invalid bps");
        if (creatorKeepBps < BPS) {
            require(feeDistributor != address(0), "BondingCurveHook: need distributor");
        }
        require(memeToken != address(0),       "BondingCurveHook: zero token");
        require(creator   != address(0),       "BondingCurveHook: zero creator");
        require(treasury_ != address(0),       "BondingCurveHook: zero treasury");

        PoolId id = key.toId();
        CurveState storage s = curves[id];
        require(!s.initialized, "BondingCurveHook: already initialized");

        require(
            IERC20(memeToken).balanceOf(address(this)) >= CURVE_SUPPLY + LP_RESERVE,
            "BondingCurveHook: insufficient tokens"
        );

        // USDC est address(0) (natif) — toujours currency0 car 0 < any non-zero address
        address usdcAddr = Currency.unwrap(key.currency0) == memeToken
            ? Currency.unwrap(key.currency1)
            : Currency.unwrap(key.currency0);

        s.memeToken         = memeToken;
        s.usdc              = usdcAddr;     // == address(0) sur Arc
        s.creator           = creator;
        s.treasury          = treasury_;
        s.feeDistributor    = feeDistributor;
        s.creatorKeepBps    = creatorKeepBps;
        s.reserveUsdc       = VIRTUAL_USDC; // 18 dec
        s.reserveTokens     = CURVE_SUPPLY; // 18 dec
        s.initialized       = true;

        emit CurveInitialized(id, memeToken, creator);
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

        // ── Post-graduation : prélever 2% de fee, V4 AMM gère le reste ────
        if (s.graduated) {
            if (params.amountSpecified >= 0) {
                return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
            }

            bool gradUsdcIsC0 = (Currency.unwrap(key.currency0) == s.usdc);
            bool gradIsBuy    = gradUsdcIsC0 ? params.zeroForOne : !params.zeroForOne;

            uint256 grossAmt = uint256(-params.amountSpecified);
            uint256 fee      = grossAmt * FEE_BPS / BPS;

            if (fee == 0) {
                return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
            }

            if (gradIsBuy) {
                // USDC natif fee → take du PM vers le hook, puis distribuer
                Currency currUsdc = gradUsdcIsC0 ? key.currency0 : key.currency1;
                poolManager.take(currUsdc, address(this), fee);
                _distributeFees(s, fee, id);
                emit Trade(id, sender, true, grossAmt, 0, fee);
            } else {
                // Meme fee → take du PM vers treasury (ERC-20)
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
        bool usdcIsC0 = (Currency.unwrap(key.currency0) == s.usdc);
        Currency currencyUsdc = usdcIsC0 ? key.currency0 : key.currency1;
        Currency currencyMeme = usdcIsC0 ? key.currency1 : key.currency0;
        bool isBuy = usdcIsC0 ? params.zeroForOne : !params.zeroForOne;

        if (isBuy) {
            uint256 usdcGross = params.amountSpecified < 0
                ? uint256(-params.amountSpecified)
                : uint256(params.amountSpecified);

            (uint256 tokensOut, uint256 fee, uint256 usdcNet) = _quoteBuy(s, usdcGross);
            require(tokensOut > 0, "BondingCurveHook: zero output");

            // Partial fill si on approche du seuil
            if (s.realUsdcRaised + usdcNet > GRAD_THRESHOLD) {
                uint256 netAllowed   = GRAD_THRESHOLD - s.realUsdcRaised;
                uint256 grossCapped  = _ceilDiv(netAllowed * BPS, BPS - FEE_BPS);
                usdcGross = grossCapped < usdcGross ? grossCapped : usdcGross;
                (tokensOut, fee, usdcNet) = _quoteBuy(s, usdcGross);
            }

            // Flash accounting V4 :
            //   take(USDC natif) → hook reçoit ETH (USDC Arc) du PoolManager
            //   sync + safeTransfer(memeToken) + settle → hook dépose les meme tokens
            poolManager.take(currencyUsdc, address(this), usdcGross);
            poolManager.sync(currencyMeme);
            IERC20(s.memeToken).safeTransfer(address(poolManager), tokensOut);
            poolManager.settle();

            s.reserveUsdc    += usdcNet;
            s.reserveTokens  -= tokensOut;
            s.realUsdcRaised += usdcNet;
            _distributeFees(s, fee, id);

            emit Trade(id, sender, true, usdcGross, tokensOut, fee);

            if (s.realUsdcRaised >= GRAD_THRESHOLD) {
                _graduate(key, s, id);
            }

            // hookDelta : hook absorbe +usdcGross (specified), fournit −tokensOut (unspecified)
            BeforeSwapDelta delta = toBeforeSwapDelta(
                int128(uint128(usdcGross)),
                -int128(uint128(tokensOut))
            );
            return (BaseHook.beforeSwap.selector, delta, 0);

        } else {
            // Sell : memeToken → USDC natif
            uint256 tokensIn = params.amountSpecified < 0
                ? uint256(-params.amountSpecified)
                : uint256(params.amountSpecified);

            (uint256 usdcOut, uint256 fee) = _quoteSell(s, tokensIn);
            require(usdcOut > 0, "BondingCurveHook: zero output");

            uint256 newReserveUsdc = s.reserveUsdc - (usdcOut + fee);
            require(newReserveUsdc >= VIRTUAL_USDC, "BondingCurveHook: below virtual");

            // Flash accounting :
            //   take(meme ERC-20) → hook reçoit les meme tokens
            //   settle{value: usdcOut} → hook envoie USDC natif au PM pour le swapper
            poolManager.take(currencyMeme, address(this), tokensIn);
            poolManager.settle{value: usdcOut}();

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

    // ─── View ──────────────────────────────────────────────────────────────

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

    // ─── Claim fees créateur ───────────────────────────────────────────────

    function claimFees(PoolKey calldata key, address to) external nonReentrant {
        PoolId id = key.toId();
        CurveState storage s = curves[id];
        require(msg.sender == s.creator, "BondingCurveHook: not creator");
        require(to != address(0),        "BondingCurveHook: zero to");
        uint256 amount = s.creatorFeesAccrued;
        require(amount > 0,              "BondingCurveHook: no fees");
        s.creatorFeesAccrued = 0;
        // USDC natif Arc → transfert ETH
        _sendNative(to, amount);
        emit FeesClaimed(id, to, amount);
    }

    // ─── Graduation ────────────────────────────────────────────────────────

    function _graduate(PoolKey calldata key, CurveState storage s, PoolId id) internal {
        require(!s.graduated, "BondingCurveHook: already graduated");
        s.graduated = true;
        emit Graduated(id, s.realUsdcRaised, LP_RESERVE);
    }

    function addGraduationLiquidity(PoolKey calldata key) external nonReentrant {
        PoolId id = key.toId();
        CurveState storage s = curves[id];
        require(s.graduated, "BondingCurveHook: not graduated");
        require(!s.lpAdded,  "BondingCurveHook: LP already added");
        s.lpAdded = true;

        uint256 usdcForLP   = s.realUsdcRaised;
        uint256 tokensForLP = LP_RESERVE;

        poolManager.unlock(abi.encode(GradLPData({
            key: key, usdcForLP: usdcForLP, tokensForLP: tokensForLP
        })));
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
        address memeAddr    = curves[key.toId()].memeToken;

        IPoolManager.ModifyLiquidityParams memory lpParams = IPoolManager.ModifyLiquidityParams({
            tickLower:      TICK_LOWER,
            tickUpper:      TICK_UPPER,
            liquidityDelta: int256(_computeLiquidity(d.usdcForLP, d.tokensForLP)),
            salt:           bytes32(0)
        });

        (BalanceDelta callerDelta, ) = poolManager.modifyLiquidity(key, lpParams, "");

        int128 delta0 = callerDelta.amount0();
        int128 delta1 = callerDelta.amount1();

        // currency0 = USDC natif (address(0))
        if (delta0 < 0) {
            uint256 amt = uint256(uint128(-delta0));
            // USDC natif → settle avec value
            poolManager.settle{value: amt}();
        } else if (delta0 > 0) {
            poolManager.take(key.currency0, address(this), uint256(uint128(delta0)));
        }

        // currency1 = meme ERC-20
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
     * @dev Distribue les fees en USDC natif (ETH Arc).
     *      50% treasury (immédiat), 50% part créateur (split via creatorKeepBps).
     */
    function _distributeFees(CurveState storage s, uint256 fee, PoolId id) internal {
        if (fee == 0) return;

        uint256 creatorShare  = fee / 2;
        uint256 treasuryShare = fee - creatorShare;

        if (treasuryShare > 0) {
            _sendNative(s.treasury, treasuryShare);
        }

        if (creatorShare > 0) {
            uint256 creatorKeep = creatorShare * s.creatorKeepBps / BPS;
            uint256 holderShare = creatorShare - creatorKeep;

            if (creatorKeep > 0) {
                s.creatorFeesAccrued += creatorKeep;
                // Le native ETH reste dans le hook jusqu'au claimFees()
            }

            if (holderShare > 0) {
                if (s.feeDistributor != address(0)) {
                    _sendNative(s.feeDistributor, holderShare);
                    IFeeDistributor(s.feeDistributor).notifyReward(holderShare);
                } else {
                    // Fallback : pas de distributor → au créateur
                    s.creatorFeesAccrued += holderShare;
                }
            }
        }

        emit FeesPaid(id, creatorShare, treasuryShare);
    }

    /**
     * @dev Transfère du native ETH (USDC Arc). Revert si l'envoi échoue.
     */
    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "BondingCurveHook: native transfer failed");
    }

    function _computeLiquidity(uint256 usdcAmount, uint256 tokenAmount)
        internal pure
        returns (uint256 liquidity)
    {
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
}
