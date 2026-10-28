// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";
import "./V4FeeEngine.sol";

/**
 * @title GraduationVaultV4
 * @notice Reçoit l'USDC + les tokens d'une BondingCurveArcV2 à la graduation, crée le pool Uniswap V4
 *         (USDC natif / token, hook 0x0, frais du plan : 1,5 % ou 2 %) et y place toute la liquidité sur toute
 *         la plage de prix. Le NFT de position reste ici : liquidité verrouillée à vie.
 *
 * Les frais (mêmes plans que sur la courbe) sont gérés par V4FeeEngine : collectFees() les répartit
 * (créateur, plateforme, holders selon le plan) et ajoute la part « liquidité » au pool.
 *
 * Corrections de la version précédente (testées contre le vrai Uniswap V4) :
 *   - codes d'action du PositionManager (MINT_POSITION 0x02, SETTLE_PAIR 0x0d, SWEEP 0x14, DECREASE 0x01, TAKE_PAIR 0x11)
 *   - liquidité calculée (elle était à 0)
 *   - tokens tirés via Permit2 (et non approve direct au PositionManager)
 *   - premier swap dans un unlock (le PoolManager l'exige)
 */
contract GraduationVaultV4 is V4FeeEngine, IUnlockCallback {

    // ─── Adresses Uniswap V4 sur Arc ──────────────────────────────────────────
    address public constant POOL_MANAGER     = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address public constant POSITION_MANAGER = 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B;
    address public constant PERMIT2          = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    int24 public constant MAX_TICK_60 = 887_220; // plus grand tick multiple de 60

    address public factory;
    address public curve;
    uint256 public positionId;
    bool    public poolCreated;

    event PoolCreated(bytes32 indexed poolId, uint256 tokenId, uint256 usdcUsed, uint256 tokensUsed);

    function initialize(address curve_, address token_, address creator_, address treasury_, uint8 feeTier_) external {
        require(factory == address(0), "already initialized");
        factory = msg.sender;
        curve = curve_;
        _initEngine(token_, creator_, treasury_, feeTier_, POOL_MANAGER, POSITION_MANAGER, PERMIT2);
    }

    function _ready() internal view override returns (bool) { return poolCreated; }
    function _compoundUpperTick() internal pure override returns (int24) { return MAX_TICK_60; }

    // ─── createV4Pool (appelé par BondingCurveArcV2._graduate) ─────────────────
    function createV4Pool(address token_, int24 tickLower, int24 tickUpper) external {
        require(msg.sender == curve, "GV4: not curve");
        require(!poolCreated,        "GV4: already created");
        require(token_ == token,     "GV4: token mismatch");
        poolCreated = true;

        uint256 totalUsdc    = address(this).balance;
        uint256 tokenBalance = IERC20(token).balanceOf(address(this));
        require(totalUsdc > 0,    "GV4: no USDC");
        require(tokenBalance > 0, "GV4: no tokens");

        // 0,1 USDC réservé au premier swap (génère l'event Swap pour l'indexation)
        uint256 firstSwapAmount = 0.1 ether;
        uint256 usdcForLP = totalUsdc > firstSwapAmount ? totalUsdc - firstSwapAmount : totalUsdc;

        // 1. Prix de départ = rapport des réserves
        uint160 sqrtPriceX96 = _computeSqrtPriceX96(usdcForLP, tokenBalance);
        PoolKey memory key = poolKey();
        IPoolManager(POOL_MANAGER).initialize(key, sqrtPriceX96);
        bytes32 poolId = keccak256(abi.encode(key));

        // 2. Tokens via Permit2
        IERC20(token).approve(PERMIT2, tokenBalance);
        IPermit2Allowance(PERMIT2).approve(token, POSITION_MANAGER, uint160(tokenBalance), uint48(block.timestamp + 600));

        // 3. Position LP (NFT conservé ici)
        uint256 liq = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96, TickMath.getSqrtPriceAtTick(tickLower), TickMath.getSqrtPriceAtTick(tickUpper), usdcForLP, tokenBalance
        );
        require(liq > 0 && liq <= type(uint128).max, "GV4: bad liquidity");
        uint256 tokenId = IPositionManagerLite(POSITION_MANAGER).nextTokenId();
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(key, tickLower, tickUpper, liq, uint128(usdcForLP), uint128(tokenBalance), address(this), bytes(""));
        params[1] = abi.encode(Currency.wrap(address(0)), Currency.wrap(token));
        params[2] = abi.encode(Currency.wrap(address(0)), address(this));
        IPositionManagerLite(POSITION_MANAGER).modifyLiquidities{value: usdcForLP}(
            abi.encode(abi.encodePacked(ACT_MINT_POSITION, ACT_SETTLE_PAIR, ACT_SWEEP), params),
            block.timestamp + 120
        );
        positionId = tokenId;
        positionIds.push(tokenId);

        // 4. Premier swap (optionnel : le pool existe déjà s'il échoue)
        if (address(this).balance >= firstSwapAmount) {
            try this.firstSwap(firstSwapAmount) {} catch {}
        }

        emit PoolCreated(poolId, tokenId, usdcForLP, tokenBalance);
    }

    /// @dev Appelé uniquement par ce contrat (try/catch ci-dessus).
    function firstSwap(uint256 usdcIn) external {
        require(msg.sender == address(this), "GV4: self only");
        IPoolManager(POOL_MANAGER).unlock(abi.encode(usdcIn));
    }

    /// @dev Callback du PoolManager : swap exact input USDC -> token, règlement ; les tokens achetés sont brûlés.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == POOL_MANAGER, "GV4: only pool manager");
        uint256 usdcIn = abi.decode(data, (uint256));
        PoolKey memory k = poolKey();
        BalanceDelta d = IPoolManager(POOL_MANAGER).swap(
            k,
            SwapParams({zeroForOne: true, amountSpecified: -int256(usdcIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            bytes("")
        );
        IPoolManager(POOL_MANAGER).settle{value: uint256(uint128(-d.amount0()))}();
        IPoolManager(POOL_MANAGER).take(k.currency1, address(0xdead), uint256(uint128(d.amount1())));
        return "";
    }

    // ─── Prix de départ ───────────────────────────────────────────────────────

    /// @dev sqrtPriceX96 = sqrt(tokenBalance / usdcBalance) × 2^96
    function _computeSqrtPriceX96(uint256 usdcBalance, uint256 tokenBalance) internal pure returns (uint160) {
        uint256 Q96 = 2**96;
        uint256 priceScaled = tokenBalance * 1e18 / usdcBalance;
        uint256 sqrtScaled  = _isqrt(priceScaled);
        return uint160(sqrtScaled * Q96 / 1e9);
    }

    function _isqrt(uint256 x) internal pure returns (uint256 z) {
        if (x == 0) return 0;
        z = x;
        uint256 y = (x >> 1) + 1;
        while (y < z) { z = y; y = (x / y + y) >> 1; }
    }

}
