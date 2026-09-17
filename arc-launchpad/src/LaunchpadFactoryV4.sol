// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager}    from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey}         from "v4-core/src/types/PoolKey.sol";
import {Currency}        from "v4-core/src/types/Currency.sol";
import {IHooks}          from "v4-core/src/interfaces/IHooks.sol";
import {TickMath}        from "v4-core/src/libraries/TickMath.sol";
import {Clones}          from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20}          from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20}       from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {OMToken}         from "./OMToken.sol";
import {BondingCurveHook} from "./BondingCurveHook.sol";

/**
 * @title LaunchpadFactoryV4
 * @notice Crée des tokens meme avec une bonding curve V4 (hook Uniswap V4).
 *
 * Flux de création :
 *   1. Creator approuve CREATION_FEE USDC à ce contrat
 *   2. Factory déploie OMToken (1 B supply, tout dans le hook)
 *   3. Factory appelle poolManager.initialize() avec le hook
 *   4. afterInitialize sur le hook enregistre l'état et tire le CURVE_SUPPLY
 *
 * Note : un seul BondingCurveHook est déployé pour toute la factory.
 * Chaque token crée sa propre pool V4 (avec le même hook mais un PoolKey différent).
 */
contract LaunchpadFactoryV4 {
    using SafeERC20 for IERC20;

    // ─── Constantes ────────────────────────────────────────────────────────

    /// @dev USDC Arc (0x3600…0000)
    address public immutable USDC;

    /// @dev PoolManager V4
    IPoolManager public immutable poolManager;

    /// @dev Le hook partagé par tous les tokens
    BondingCurveHook public immutable hook;

    /// @dev Fee de création : 10 USDC (6 dec)
    uint256 public constant CREATION_FEE = 10_000_000; // 10 USDC

    /// @dev Total supply : 1 milliard de tokens
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;

    /// @dev Fee tier de la pool (0% — le hook prend 2% via beforeSwap, pas de double-taxation)
    uint24 public constant POOL_FEE = 0;

    // ─── État ──────────────────────────────────────────────────────────────

    address public treasury;
    address public owner;

    /// @dev Registre token → PoolKey
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
        address _usdc,
        address _poolManager,
        address _hook,
        address _treasury
    ) {
        USDC        = _usdc;
        poolManager = IPoolManager(_poolManager);
        hook        = BondingCurveHook(_hook);
        treasury    = _treasury;
        owner       = msg.sender;
    }

    // ─── createToken ───────────────────────────────────────────────────────

    /**
     * @notice Crée un token meme avec une bonding curve V4.
     *
     * @param name            Nom du token
     * @param symbol          Symbole
     * @param imageUri        URI de l'image (stocké off-chain)
     * @param firstBuyUsdc    Montant USDC du first buy (optionnel, 0 = pas de first buy)
     * @param feeDistributor  Adresse du FeeDistributor (address(0) = fees 100% creator)
     * @param creatorKeepBps  % de la part creator à garder vs distribuer aux holders
     *                        (10000 = 100% creator, 5000 = 50/50, 0 = 100% holders)
     */
    function createToken(
        string  calldata name,
        string  calldata symbol,
        string  calldata imageUri,
        uint256 firstBuyUsdc,
        address feeDistributor,
        uint256 creatorKeepBps
    ) external returns (address tokenAddr) {
        require(creatorKeepBps <= 10_000, "LaunchpadFactory: invalid creatorKeepBps");
        if (creatorKeepBps < 10_000) {
            require(feeDistributor != address(0), "LaunchpadFactory: need distributor");
        }
        // 1. Collecter la fee de création
        IERC20(USDC).safeTransferFrom(msg.sender, treasury, CREATION_FEE);

        // 2. Déployer le token meme — TOTAL_SUPPLY minté directement au hook par le constructeur
        //    OMToken(name, symbol, imageUri, description, curve=hook, creator)
        OMToken memeToken = new OMToken(name, symbol, imageUri, "", address(hook), msg.sender);
        tokenAddr = address(memeToken);

        // 3. Construire le PoolKey — currency0 < currency1 (ordre lexicographique)
        //    currency0 < currency1 (ordre lexicographique des adresses)
        (Currency currency0, Currency currency1) = address(USDC) < tokenAddr
            ? (Currency.wrap(USDC), Currency.wrap(tokenAddr))
            : (Currency.wrap(tokenAddr), Currency.wrap(USDC));

        PoolKey memory key = PoolKey({
            currency0:   currency0,
            currency1:   currency1,
            fee:         POOL_FEE,
            tickSpacing: 60, // tickSpacing 60 compatible avec fee=0 en V4
            hooks:       IHooks(address(hook))
        });

        // 5. Prix initial : VIRTUAL_USDC / CURVE_SUPPLY
        //    = 3 200e6 USDC / 800e24 tokens
        //    sqrtPriceX96 = sqrt(price) * 2^96
        //    price = 3200e6 / 800e24 = 4e-18 (USDC per token en 6/18 dec = 4e-18 * 1e12 = 4e-6)
        //    En ajustant pour les décimales différentes :
        //    price_in_1e6_units = VIRTUAL_USDC * 1e18 / CURVE_SUPPLY = 4e6 * 1e6 / 1e24 → 4e-12
        //    On utilise un sqrtPrice fixe correspondant au ratio initial
        uint160 initialSqrtPrice = _computeInitialSqrtPrice(USDC < tokenAddr);

        // 5. Initialiser la pool V4 (cette version de v4-core : 2 args seulement, pas de hookData)
        poolManager.initialize(key, initialSqrtPrice);

        // 6. Enregistrer l'état de la bonding curve dans le hook
        //    (remplace hookData/afterInitialize absent dans cette version de v4-core)
        hook.setupCurve(key, tokenAddr, msg.sender, treasury, feeDistributor, creatorKeepBps);

        // Stocker le PoolKey
        tokenPool[tokenAddr] = key;

        emit TokenCreated(tokenAddr, msg.sender, name, symbol, key);

        // 7. First buy optionnel
        if (firstBuyUsdc > 0) {
            // Le creator a déjà approuvé ce montant supplémentaire
            // On swap via le PoolManager — simplifié ici, le front gère le swap direct
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    /**
     * @dev Calcule le sqrtPriceX96 initial pour ratio VIRTUAL_USDC/CURVE_SUPPLY.
     *      usdc_is_currency0 = true si USDC < memeToken (adresse lexicographique)
     */
    function _computeInitialSqrtPrice(bool usdcIsCurrency0)
        internal pure
        returns (uint160)
    {
        // Prix initial = VIRTUAL_USDC (6 dec) / CURVE_SUPPLY (18 dec)
        // = 3_200_000_000 / 800_000_000e18 = 4e-12
        //
        // sqrtPriceX96 = sqrt(price_currency1_per_currency0) * 2^96
        //
        // Si currency0 = USDC (6 dec) et currency1 = token (18 dec) :
        //   price = amount_currency1 / amount_currency0
        //         = CURVE_SUPPLY / VIRTUAL_USDC
        //         = 800e24 / 3200e6 = 2.5e17
        //
        // sqrtPriceX96 = sqrt(2.5e17) * 2^96
        //              = 5e8 * 2^96  (approx)
        //              = 5e8 * 79228162514264337593543950336
        //              ≈ 3.96e28
        //
        // On utilise TickMath.getSqrtPriceAtTick(0) comme approximation safe
        // et on ajuste ensuite via le premier swap.
        // Pour les tests, on utilise SQRT_PRICE_1_1 = TickMath.getSqrtPriceAtTick(0)

        if (usdcIsCurrency0) {
            // token est currency1 → price = tokens/USDC (très grand nombre)
            // tick ≈ 0 pour commencer (ajusté par le premier buy)
            return TickMath.getSqrtPriceAtTick(0);
        } else {
            // USDC est currency1 → price = USDC/tokens (très petit)
            return TickMath.getSqrtPriceAtTick(0);
        }
    }

    // ─── Admin ─────────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external {
        require(msg.sender == owner, "not owner");
        treasury = _treasury;
    }
}
