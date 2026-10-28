// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import "./V4FeeEngine.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title DirectV4Vault
 * @notice Lancement direct sur Uniswap V4 : pas de bonding curve, pas de graduation.
 *
 * À la création du token, la factory appelle seedPool() : le pool V4 USDC natif / token est initialisé et
 * 100 % du supply est placé en liquidité « d'un seul côté » (tokens seulement) sur toute la plage de prix
 * sous le prix de départ. Aucun USDC n'est nécessaire : chaque achat apporte l'USDC et fait monter le prix
 * (courbe x*y=k avec une réserve USDC virtuelle de ~4 000 USDC, comme l'ancienne bonding curve).
 *
 * La position LP (NFT) reste dans ce contrat et ne peut jamais en sortir : liquidité verrouillée à vie.
 * Les frais du pool (0,50 %) sont collectés par collectFees() (appelable par tout le monde) et partagés
 * entre le créateur et la plateforme ; les tokens collectés en frais sont brûlés.
 *
 * Paire : currency0 = USDC natif (address(0)), currency1 = token. Prix = tokens par USDC ; il baisse
 * quand on achète le token (le tick descend de TICK_UPPER vers TICK_LOWER).
 */
contract DirectV4Vault is V4FeeEngine, IUnlockCallback {
    /// @dev Prix de départ : 1,0001^124320 ≈ 250 540 tokens par USDC → capitalisation ≈ 3 990 USDC (supply 1 Md).
    int24 public constant TICK_UPPER = 124_320;
    /// @dev Plus petit tick utilisable (multiple de 60) : le prix du token peut monter sans limite pratique.
    int24 public constant TICK_LOWER = -887_220;

    // ─── État ────────────────────────────────────────────────────────────────
    address public factory;
    uint256 public positionId;       // position de départ (liquidité en tokens)
    bool    public seeded;

    event PoolSeeded(uint256 positionId, uint128 liquidity, uint256 tokensInPool);
    event FirstBuy(address indexed buyer, uint256 usdcIn, uint256 tokensOut);

    // ─── Init ────────────────────────────────────────────────────────────────
    function initialize(address token_, address creator_, address treasury_, uint8 feeTier_, address poolManager_, address positionManager_, address permit2_) external {
        require(factory == address(0), "DV4: already initialized");
        factory = msg.sender;
        _initEngine(token_, creator_, treasury_, feeTier_, poolManager_, positionManager_, permit2_);
    }

    function _ready() internal view override returns (bool) { return seeded; }
    function _compoundUpperTick() internal pure override returns (int24) { return TICK_UPPER; }

    // ─── Création du pool et de la position (appelé une fois par la factory) ───
    function seedPool() external {
        require(msg.sender == factory, "DV4: only factory");
        require(!seeded, "DV4: already seeded");
        seeded = true;

        uint256 tokenAmount = IERC20(token).balanceOf(address(this));
        require(tokenAmount > 0, "DV4: no tokens");

        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(TICK_UPPER);
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(TICK_LOWER);

        // 1. Initialiser le pool au prix de départ (exactement le bord haut de la plage : liquidité 100 % token)
        IPoolManager(poolManager).initialize(poolKey(), sqrtUpper);

        // 2. Liquidité pour un montant de token1 seul : L = amount1 * 2^96 / (sqrtUpper - sqrtLower)
        uint256 liq = FullMath.mulDiv(tokenAmount, 1 << 96, uint256(sqrtUpper) - uint256(sqrtLower));
        require(liq > 0 && liq <= type(uint128).max, "DV4: bad liquidity");

        // 3. Permit2 : le PositionManager tire les tokens via Permit2
        IERC20(token).approve(permit2, tokenAmount);
        IPermit2Allowance(permit2).approve(token, positionManager, uint160(tokenAmount), uint48(block.timestamp + 600));

        // 4. Mint de la position (propriétaire du NFT = ce contrat, pour toujours)
        uint256 id = IPositionManagerLite(positionManager).nextTokenId();
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(poolKey(), TICK_LOWER, TICK_UPPER, uint256(liq), uint128(0), uint128(tokenAmount), address(this), bytes(""));
        params[1] = abi.encode(Currency.wrap(address(0)), Currency.wrap(token));
        IPositionManagerLite(positionManager).modifyLiquidities(
            abi.encode(abi.encodePacked(ACT_MINT_POSITION, ACT_SETTLE_PAIR), params),
            block.timestamp + 600
        );
        positionId = id;
        positionIds.push(id);

        // Poussière de tokens non placée : brûlée
        uint256 dust = IERC20(token).balanceOf(address(this));
        if (dust > 0) IERC20(token).transfer(address(0xdead), dust);

        emit PoolSeeded(id, uint128(liq), tokenAmount - dust);
    }

    // ─── Premier achat du créateur (génère aussi le premier event Swap) ──────────
    function firstBuy(address recipient) external payable returns (uint256 tokensOut) {
        require(msg.sender == factory, "DV4: only factory");
        require(seeded && msg.value > 0, "DV4: nothing to buy");
        bytes memory ret = IPoolManager(poolManager).unlock(abi.encode(recipient, msg.value));
        tokensOut = abi.decode(ret, (uint256));
        emit FirstBuy(recipient, msg.value, tokensOut);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == poolManager, "DV4: only pool manager");
        (address recipient, uint256 amountIn) = abi.decode(data, (address, uint256));
        PoolKey memory key = poolKey();
        BalanceDelta delta = IPoolManager(poolManager).swap(
            key,
            SwapParams({zeroForOne: true, amountSpecified: -int256(amountIn), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}),
            bytes("")
        );
        require(delta.amount0() == -int128(int256(amountIn)), "DV4: partial fill");
        uint256 out = uint256(uint128(delta.amount1()));
        IPoolManager(poolManager).settle{value: amountIn}();
        IPoolManager(poolManager).take(key.currency1, recipient, out);
        return abi.encode(out);
    }

}
