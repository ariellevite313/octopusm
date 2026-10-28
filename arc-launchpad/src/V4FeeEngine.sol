// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IPermit2Allowance {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
}

interface IPositionManagerLite {
    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function nextTokenId() external view returns (uint256);
}

interface IOMTokenVaultDividend {
    function addDividend() external payable;
}

/**
 * @title V4FeeEngine
 * @notice Moteur commun (lancement direct ET graduation d'une courbe) : plans de frais, collecte des frais de toutes
 *         les positions, répartition, et ajout de la part « liquidité » au pool (positions verrouillées à vie).
 *
 * Deux plans, les mêmes partout (courbe, direct, pool après graduation) :
 *   Plan 0 : 1,5 % par échange = 0,5 % créateur · 0,5 % plateforme · 0,5 % liquidité
 *   Plan 1 : 2,0 % par échange = 1 % créateur · 0,5 % plateforme · 0,5 % liquidité
 *   Plan 2 : 2,0 % par échange = 0,5 % créateur · 0,5 % plateforme · 0,5 % liquidité · 0,5 % holders
 */
abstract contract V4FeeEngine {
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;

    address public poolManager;
    address public positionManager;
    address public permit2;

    address public token;
    address public creator;
    address public treasury;
    uint8   public feeTier;          // 0 = plan 1,5 % · 1 = plan 2 % (1 % créateur) · 2 = plan 2 % avec holders
    /// @notice Frais du pool : plan 0 = 1,5 % · plan 1 = 2 %
    uint24  public poolFee;
    uint24  public constant FEE_PLAN_0 = 15_000;
    uint24  public constant FEE_PLAN_1 = 20_000;
    int24   public constant V4_TICK_SPACING = 60;

    uint256[] public positionIds;    // toutes les positions verrouillées (départ + compoundings)
    bool private _busy;

    // Actions du PositionManager Uniswap V4 (v4-periphery Actions.sol)
    uint8 internal constant ACT_DECREASE_LIQUIDITY = 0x01;
    uint8 internal constant ACT_MINT_POSITION      = 0x02;
    uint8 internal constant ACT_SETTLE_PAIR        = 0x0d;
    uint8 internal constant ACT_TAKE_PAIR          = 0x11;
    uint8 internal constant ACT_SWEEP              = 0x14;

    event FeesCollected(uint256 usdcCollected, uint256 tokensBurned);
    event FeesSplit(uint256 creatorFee, uint256 platformFee, uint256 holdersFee, uint256 liquidityFee);
    event Compounded(uint256 positionId, uint256 usdcAdded, int24 tickLower);

    function _initEngine(address token_, address creator_, address treasury_, uint8 feeTier_, address poolManager_, address positionManager_, address permit2_) internal {
        require(feeTier_ <= 2, "V4E: tier not supported");
        require(poolManager_ != address(0) && positionManager_ != address(0) && permit2_ != address(0), "V4E: zero address");
        poolManager = poolManager_;
        positionManager = positionManager_;
        permit2 = permit2_;
        token = token_;
        creator = creator_;
        treasury = treasury_;
        feeTier = feeTier_;
        poolFee = feeTier_ == 0 ? FEE_PLAN_0 : FEE_PLAN_1; // plans 1 et 2 : 2 %
    }

    /// @dev Vrai quand le pool et la position de départ existent.
    function _ready() internal view virtual returns (bool);
    /// @dev Prix maximum de la liquidité ajoutée par compound (tick, multiple de 60).
    function _compoundUpperTick() internal view virtual returns (int24);

    function poolKey() public view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: poolFee,
            tickSpacing: V4_TICK_SPACING,
            hooks: IHooks(address(0))
        });
    }

    /// @notice Collecte les frais de toutes les positions et les répartit. Appelable par tout le monde.
    ///         Plan 0 : 1 % créateur · 0,5 % plateforme · 1 % liquidité (sur 2,5 %).
    ///         Plan 1 : 0,5 % créateur · 0,5 % plateforme · 0,5 % liquidité · 0,5 % holders (sur 2,0 %).
    ///         La part « liquidité » est ajoutée au pool (positions verrouillées à vie).
    function collectFees() external {
        require(_ready(), "DV4: not ready");
        require(!_busy, "DV4: busy");
        _busy = true;
        uint256 ethBefore = address(this).balance;
        uint256 tokBefore = IERC20(token).balanceOf(address(this));

        uint256 n = positionIds.length;
        bytes[] memory params = new bytes[](n + 1);
        bytes memory actions;
        for (uint256 i; i < n; ++i) {
            params[i] = abi.encode(positionIds[i], uint256(0), uint128(0), uint128(0), bytes(""));
            actions = abi.encodePacked(actions, ACT_DECREASE_LIQUIDITY);
        }
        params[n] = abi.encode(Currency.wrap(address(0)), Currency.wrap(token), address(this));
        actions = abi.encodePacked(actions, ACT_TAKE_PAIR);
        IPositionManagerLite(positionManager).modifyLiquidities(abi.encode(actions, params), block.timestamp + 120);

        uint256 eth = address(this).balance - ethBefore;
        uint256 tok = IERC20(token).balanceOf(address(this)) - tokBefore;
        if (eth > 0) {
            (uint256 cBps, uint256 pBps, uint256 hBps) = _bps();
            uint256 creatorFee = eth * cBps / 10_000;
            uint256 platformFee = eth * pBps / 10_000;
            uint256 holdersFee = eth * hBps / 10_000;
            if (holdersFee > 0 && !_hasHolders()) holdersFee = 0; // personne à payer : la part retourne à la liquidité
            uint256 liquidityFee = eth - creatorFee - platformFee - holdersFee;
            _send(creator, creatorFee);
            _send(treasury, platformFee);
            if (holdersFee > 0) IOMTokenVaultDividend(token).addDividend{value: holdersFee}();
            emit FeesSplit(creatorFee, platformFee, holdersFee, liquidityFee);
        }
        if (tok > 0) IERC20(token).transfer(address(0xdead), tok); // la LP est verrouillée à vie : tokens de frais brûlés
        emit FeesCollected(eth, tok);
        _busy = false;
        try this.compound() {} catch {}
    }

    /// @notice Ajoute au pool l'USDC mis de côté (part « liquidité » des frais), en liquidité verrouillée à vie,
    ///         juste au-dessus du prix actuel : elle soutient le prix quand il remonte. Appelable par tout le monde.
    function compound() external {
        require(_ready(), "DV4: not ready");
        uint256 amount = address(this).balance;
        if (amount < 1e15) return; // moins de 0,001 USDC : on attend
        PoolKey memory key = poolKey();
        (, int24 tick,,) = IPoolManager(poolManager).getSlot0(key.toId());
        int24 lower = _floorTick(tick) + V4_TICK_SPACING; // strictement au-dessus du prix actuel : 100 % USDC
        int24 upper = _compoundUpperTick();
        if (lower >= upper) return;
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(lower);
        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(upper);
        uint128 liq = LiquidityAmounts.getLiquidityForAmount0(sqrtLower, sqrtUpper, amount);
        if (liq == 0) return;

        uint256 id = IPositionManagerLite(positionManager).nextTokenId();
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(key, lower, upper, uint256(liq), uint128(amount), uint128(0), address(this), bytes(""));
        params[1] = abi.encode(Currency.wrap(address(0)), Currency.wrap(token));
        params[2] = abi.encode(Currency.wrap(address(0)), address(this));
        IPositionManagerLite(positionManager).modifyLiquidities{value: amount}(
            abi.encode(abi.encodePacked(ACT_MINT_POSITION, ACT_SETTLE_PAIR, ACT_SWEEP), params),
            block.timestamp + 120
        );
        positionIds.push(id);
        emit Compounded(id, amount, lower);
    }

    function positionCount() external view returns (uint256) { return positionIds.length; }

    function _floorTick(int24 t) internal pure returns (int24) {
        int24 q = t / V4_TICK_SPACING;
        if (t < 0 && t % V4_TICK_SPACING != 0) q -= 1;
        return q * V4_TICK_SPACING;
    }

    /// @dev Vrai s'il existe des holders (supply en dehors du pool, du vault et de l'adresse de brûlage).
    function _hasHolders() internal view returns (bool) {
        IERC20 t = IERC20(token);
        return t.totalSupply() > t.balanceOf(poolManager) + t.balanceOf(address(this)) + t.balanceOf(address(0xdead));
    }

    /// @dev Parts (bps de 10 000 des frais USDC) : créateur, plateforme, holders. Le reste = liquidité.
    ///      Plan 0 (1,5 %) : 0,5 % chacun pour créateur, plateforme, liquidité.
    ///      Plan 1 (2 %)   : 1 % créateur, 0,5 % plateforme, 0,5 % liquidité.
    ///      Plan 2 (2 %)   : 0,5 % chacun pour créateur, plateforme, liquidité, holders.
    function _bps() internal view returns (uint256 creatorBps, uint256 platformBps, uint256 holdersBps) {
        if (feeTier == 0) return (3333, 3333, 0);
        if (feeTier == 1) return (5000, 2500, 0);
        return (2500, 2500, 2500);
    }

    function _send(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "DV4: ETH transfer failed");
    }

    receive() external payable {}
}
