// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager}    from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey}         from "v4-core/src/types/PoolKey.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {IHooks}          from "v4-core/src/interfaces/IHooks.sol";
import {TickMath}        from "v4-core/src/libraries/TickMath.sol";
import {IERC20}          from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}       from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OMToken}         from "./OMToken.sol";
import {BondingCurveHook} from "./BondingCurveHook.sol";

/**
 * @title LaunchpadFactoryV4
 * @notice Crée des tokens meme avec une bonding curve V4 (hook Uniswap V4).
 *
 * Sur Arc, USDC est le token NATIF de la chaîne (address(0) en V4).
 * La fee de création est donc payable en native ETH (= USDC Arc).
 *
 * Flux de création :
 *   1. Creator envoie CREATION_FEE en msg.value (USDC natif 18 dec)
 *   2. Factory forward les frais à la treasury
 *   3. Factory déploie OMToken (1 B supply, tout minté au hook)
 *   4. Factory appelle poolManager.initialize() avec le hook
 *   5. Factory appelle hook.setupCurve() pour enregistrer l'état
 */
contract LaunchpadFactoryV4 {
    using SafeERC20 for IERC20;
    using CurrencyLibrary for Currency;

    // ─── Constantes ────────────────────────────────────────────────────────

    /// @dev USDC natif Arc = address(0) en Uniswap V4
    address public immutable USDC; // == address(0)

    IPoolManager public immutable poolManager;
    BondingCurveHook public immutable hook;

    /// @dev Fee de création : 10 USDC natif (18 dec)
    uint256 public constant CREATION_FEE = 10 * 1e18;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;
    uint24  public constant POOL_FEE     = 0;

    // ─── État ──────────────────────────────────────────────────────────────

    address public treasury;
    address public owner;

    mapping(address => PoolKey) public tokenPool;

    // ─── Events ────────────────────────────────────────────────────────────

    event TokenCreated(
        address indexed token,
        address indexed creator,
        string  name,
        string  symbol,
        PoolKey poolKey
    );

    // ─── Constructor ───────────────────────────────────────────────────────

    constructor(
        address _usdc,       // address(0) sur Arc
        address _poolManager,
        address _hook,
        address _treasury
    ) {
        USDC        = _usdc;
        poolManager = IPoolManager(_poolManager);
        hook        = BondingCurveHook(payable(_hook));
        treasury    = _treasury;
        owner       = msg.sender;
    }

    /// @notice La factory peut recevoir du native ETH (USDC Arc) pour forward à la treasury.
    receive() external payable {}

    // ─── createToken ───────────────────────────────────────────────────────

    /**
     * @notice Crée un token meme avec une bonding curve V4.
     *         msg.value doit être >= CREATION_FEE (10 USDC natif, 18 dec).
     *
     * @param name            Nom du token
     * @param symbol          Symbole
     * @param imageUri        URI de l'image
     * @param feeDistributor  Adresse du FeeDistributor (address(0) = fees 100% creator)
     * @param creatorKeepBps  % de la part creator à garder (10000 = 100%, 0 = 100% holders)
     */
    function createToken(
        string  calldata name,
        string  calldata symbol,
        string  calldata imageUri,
        address feeDistributor,
        uint256 creatorKeepBps
    ) external payable returns (address tokenAddr) {
        require(msg.value >= CREATION_FEE, "LaunchpadFactory: insufficient creation fee");
        require(creatorKeepBps <= 10_000,  "LaunchpadFactory: invalid creatorKeepBps");
        if (creatorKeepBps < 10_000) {
            require(feeDistributor != address(0), "LaunchpadFactory: need distributor");
        }

        // 1. Forward la fee de création à la treasury (USDC natif)
        (bool ok,) = payable(treasury).call{value: CREATION_FEE}("");
        require(ok, "LaunchpadFactory: treasury transfer failed");

        // Rembourser le surplus éventuel
        uint256 surplus = msg.value - CREATION_FEE;
        if (surplus > 0) {
            (bool ok2,) = payable(msg.sender).call{value: surplus}("");
            require(ok2, "LaunchpadFactory: refund failed");
        }

        // 2. Déployer le token meme — TOTAL_SUPPLY minté directement au hook
        OMToken memeToken = new OMToken(name, symbol, imageUri, "", address(hook), msg.sender);
        tokenAddr = address(memeToken);

        // 3. Construire le PoolKey
        //    Sur Arc, USDC = address(0) < toute adresse token non-nulle.
        //    currency0 = USDC natif, currency1 = memeToken (toujours dans cet ordre).
        PoolKey memory key = PoolKey({
            currency0:   CurrencyLibrary.NATIVE,         // address(0) = USDC natif
            currency1:   Currency.wrap(tokenAddr),
            fee:         POOL_FEE,
            tickSpacing: 60,
            hooks:       IHooks(address(hook))
        });

        // 4. Initialiser la pool V4
        uint160 initialSqrtPrice = TickMath.getSqrtPriceAtTick(0);
        poolManager.initialize(key, initialSqrtPrice);

        // 5. Enregistrer l'état de la bonding curve dans le hook
        hook.setupCurve(key, tokenAddr, msg.sender, treasury, feeDistributor, creatorKeepBps);

        tokenPool[tokenAddr] = key;
        emit TokenCreated(tokenAddr, msg.sender, name, symbol, key);
    }

    // ─── Admin ─────────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external {
        require(msg.sender == owner, "not owner");
        treasury = _treasury;
    }
}
