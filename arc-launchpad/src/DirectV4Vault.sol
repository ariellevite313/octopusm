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
contract DirectV4Vault is IUnlockCallback {
    // ─── Constantes Uniswap V4 (Arc mainnet) ─────────────────────────────────
    // Arc mainnet : PoolManager 0x8366a39CC670B4001A1121B8F6A443A643e40951 · PositionManager 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B
    // · Permit2 0x000000000022D473030F116dDEE9F6B43aC78BA3 (donnés par la factory à l'initialisation)
    address public poolManager;
    address public positionManager;
    address public permit2;

    uint24 public constant V4_FEE          = 5_000; // 0,50 %
    int24  public constant V4_TICK_SPACING = 60;

    /// @dev Prix de départ : 1,0001^124320 ≈ 250 540 tokens par USDC → capitalisation ≈ 3 990 USDC (supply 1 Md).
    int24 public constant TICK_UPPER = 124_320;
    /// @dev Plus petit tick utilisable (multiple de 60) : le prix du token peut monter sans limite pratique.
    int24 public constant TICK_LOWER = -887_220;

    // Actions du PositionManager Uniswap V4 (v4-periphery Actions.sol)
    uint8 internal constant ACT_DECREASE_LIQUIDITY = 0x01;
    uint8 internal constant ACT_MINT_POSITION      = 0x02;
    uint8 internal constant ACT_SETTLE_PAIR        = 0x0d;
    uint8 internal constant ACT_TAKE_PAIR          = 0x11;

    // ─── État ────────────────────────────────────────────────────────────────
    address public factory;
    address public token;
    address public creator;
    address public treasury;
    uint8   public feeTier;      // 0 = Standard · 2 = Creator
    uint256 public positionId;
    bool    public seeded;

    event PoolSeeded(uint256 positionId, uint128 liquidity, uint256 tokensInPool);
    event FeesCollected(uint256 usdcCollected, uint256 tokensBurned);
    event FeesSplit(uint256 creatorFee, uint256 platformFee, uint256 toTreasuryLp);
    event FirstBuy(address indexed buyer, uint256 usdcIn, uint256 tokensOut);

    // ─── Init ────────────────────────────────────────────────────────────────
    function initialize(address token_, address creator_, address treasury_, uint8 feeTier_, address poolManager_, address positionManager_, address permit2_) external {
        require(factory == address(0), "DV4: already initialized");
        require(feeTier_ == 0 || feeTier_ == 2, "DV4: tier not supported");
        require(poolManager_ != address(0) && positionManager_ != address(0) && permit2_ != address(0), "DV4: zero address");
        factory = msg.sender;
        poolManager = poolManager_;
        positionManager = positionManager_;
        permit2 = permit2_;
        token = token_;
        creator = creator_;
        treasury = treasury_;
        feeTier = feeTier_;
    }

    function poolKey() public view returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: V4_FEE,
            tickSpacing: V4_TICK_SPACING,
            hooks: IHooks(address(0))
        });
    }

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

    // ─── Frais du pool ─────────────────────────────────────────────────────────
    /// @notice Collecte les frais de la position et les répartit. Appelable par tout le monde.
    function collectFees() external {
        require(seeded, "DV4: not seeded");
        uint256 ethBefore = address(this).balance;
        uint256 tokBefore = IERC20(token).balanceOf(address(this));

        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(positionId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(Currency.wrap(address(0)), Currency.wrap(token), address(this));
        IPositionManagerLite(positionManager).modifyLiquidities(
            abi.encode(abi.encodePacked(ACT_DECREASE_LIQUIDITY, ACT_TAKE_PAIR), params),
            block.timestamp + 120
        );

        uint256 eth = address(this).balance - ethBefore;
        uint256 tok = IERC20(token).balanceOf(address(this)) - tokBefore;
        if (eth > 0) {
            (uint256 cBps, uint256 pBps) = _bps();
            uint256 creatorFee = eth * cBps / 10_000;
            uint256 platformFee = eth * pBps / 10_000;
            uint256 rest = eth - creatorFee - platformFee;
            _send(creator, creatorFee);
            _send(treasury, platformFee + rest); // la part « LP » va à la plateforme : pas de compound possible, la LP est verrouillée
            emit FeesSplit(creatorFee, platformFee, rest);
        }
        if (tok > 0) IERC20(token).transfer(address(0xdead), tok); // la LP est verrouillée à vie : tokens de frais brûlés
        emit FeesCollected(eth, tok);
    }

    /// @dev Parts du créateur et de la plateforme (bps de 10 000) sur les frais USDC ; même base que GraduationVaultV4.
    function _bps() internal view returns (uint256 creatorBps, uint256 platformBps) {
        if (feeTier == 0) return (5333, 2000); // Standard
        return (5817, 2000);                   // Creator
    }

    function _send(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "DV4: ETH transfer failed");
    }

    receive() external payable {}
}
