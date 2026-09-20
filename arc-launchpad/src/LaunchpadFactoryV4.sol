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

// ─── Interfaces Uniswap V2 (façade pour indexation GMGN/DexScreener) ──────────

interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IUniswapV2Router {
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
    function WETH() external pure returns (address);
}

interface IWETH {
    function deposit() external payable;
    function approve(address spender, uint amount) external returns (bool);
    function transfer(address to, uint amount) external returns (bool);
}

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
 *   6. Factory crée une paire V2 façade (seed minime) → détection GMGN/DexScreener
 */
contract LaunchpadFactoryV4 {
    using SafeERC20 for IERC20;
    using CurrencyLibrary for Currency;

    // ─── Constantes ────────────────────────────────────────────────────────

    /// @dev USDC natif Arc = address(0) en Uniswap V4
    address public immutable USDC; // == address(0)

    IPoolManager         public immutable poolManager;
    BondingCurveHook     public immutable hook;
    IUniswapV2Factory    public immutable v2Factory;
    IUniswapV2Router     public immutable v2Router;

    /// @dev Fee de création : gratuit
    uint256 public constant CREATION_FEE = 0;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;
    uint24  public constant POOL_FEE     = 0;

    /// @dev Seed V2 façade : 0.01 USDC natif + tokens équivalents au prix de lancement
    ///      Prix initial = VIRTUAL_USDC / CURVE_SUPPLY = 1920 / 800_000_000
    ///      Pour 0.01 USDC → tokens = 0.01 * 800_000_000 / 1920 ≈ 4_166 tokens (18 dec)
    uint256 public constant V2_SEED_USDC   = 0.01  * 1e18;           // 0.01 USDC natif
    uint256 public constant V2_SEED_TOKENS = 4_167  * 1e18;          // ≈ 4167 tokens

    // ─── État ──────────────────────────────────────────────────────────────

    address public treasury;
    address public owner;

    mapping(address => PoolKey) public tokenPool;
    mapping(address => address) public tokenV2Pair;  // token → paire V2 façade

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
        address _treasury,
        address _v2Factory,
        address _v2Router
    ) {
        USDC        = _usdc;
        poolManager = IPoolManager(_poolManager);
        hook        = BondingCurveHook(payable(_hook));
        treasury    = _treasury;
        v2Factory   = IUniswapV2Factory(_v2Factory);
        v2Router    = IUniswapV2Router(_v2Router);
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
        BondingCurveHook.FeeTier feeTier
    ) external payable returns (address tokenAddr) {
        require(uint8(feeTier) <= 3, "LaunchpadFactory: invalid feeTier");

        // 1. Déployer le token meme — TOTAL_SUPPLY minté directement au hook
        OMToken memeToken = new OMToken(name, symbol, imageUri, "", address(hook), msg.sender, hook.platformWallet());
        tokenAddr = address(memeToken);

        // 3. Construire le PoolKey
        //    Sur Arc, USDC = address(0) < toute adresse token non-nulle.
        //    currency0 = USDC natif, currency1 = memeToken (toujours dans cet ordre).
        PoolKey memory key = PoolKey({
            currency0:   Currency.wrap(address(0)),      // address(0) = USDC natif
            currency1:   Currency.wrap(tokenAddr),
            fee:         POOL_FEE,
            tickSpacing: 60,
            hooks:       IHooks(address(hook))
        });

        // 4. Initialiser la pool V4
        uint160 initialSqrtPrice = TickMath.getSqrtPriceAtTick(0);
        poolManager.initialize(key, initialSqrtPrice);

        // 5. Enregistrer l'état de la bonding curve dans le hook
        hook.setupCurve(key, tokenAddr, msg.sender, treasury, feeTier);

        tokenPool[tokenAddr] = key;

        // 6. Créer la paire V2 façade (pour indexation GMGN / DexScreener)
        //    On mint V2_SEED_TOKENS depuis le hook vers la factory, puis on seed la paire.
        //    La factory doit avoir reçu du native USDC (msg.value) pour le seed.
        //    NOTE : ne fonctionne que si msg.value >= V2_SEED_USDC (sinon skip silencieux).
        if (msg.value >= V2_SEED_USDC && address(v2Factory) != address(0)) {
            _seedV2Pair(tokenAddr);
        }

        emit TokenCreated(tokenAddr, msg.sender, name, symbol, key);
    }

    /**
     * @dev Crée et seed une paire V2 façade pour la détection par DexScreener/GMGN.
     *      Utilise V2_SEED_USDC native + V2_SEED_TOKENS depuis le hook.
     *      La liquidité seed est envoyée à la treasury (LP tokens brûlés effectivement).
     */
    function _seedV2Pair(address tokenAddr) internal {
        // 6a. Créer la paire (no-op si elle existe déjà)
        address weth = v2Router.WETH();
        address pair = v2Factory.getPair(tokenAddr, weth);
        if (pair == address(0)) {
            pair = v2Factory.createPair(tokenAddr, weth);
        }
        tokenV2Pair[tokenAddr] = pair;

        // 6b. Récupérer V2_SEED_TOKENS depuis le hook (hook les a tous)
        //     Le hook doit approuver la factory — on passe par safeTransferFrom
        //     depuis le hook. Pour simplifier : on transfère du hook à la factory d'abord.
        //     (Le hook doit avoir appelé approve ou on doit passer par un chemin alternatif)
        //     Ici on suppose que setupCurve() laisse CURVE_SUPPLY + LP_RESERVE au hook.
        //     On transferFrom(hook → factory) V2_SEED_TOKENS via le hook qui nous approve.
        IERC20 meme = IERC20(tokenAddr);
        // Le hook a approuvé la factory lors de setupCurve (voir BondingCurveHook)
        meme.transferFrom(address(hook), address(this), V2_SEED_TOKENS);

        // 6c. Approuver le router V2
        meme.approve(address(v2Router), V2_SEED_TOKENS);

        // 6d. Ajouter la liquidité V2 (ETH natif = WETH sur Arc)
        //     LP tokens envoyés à la treasury comme propriétaire de la liquidité seed
        v2Router.addLiquidityETH{value: V2_SEED_USDC}(
            tokenAddr,
            V2_SEED_TOKENS,
            0,              // slippage illimité pour seed
            0,
            treasury,       // LP tokens → treasury
            block.timestamp + 300
        );
    }

    // ─── Admin ─────────────────────────────────────────────────────────────

    function setTreasury(address _treasury) external {
        require(msg.sender == owner, "not owner");
        treasury = _treasury;
    }
}
