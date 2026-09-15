// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─── Interface Uniswap V3 NonfungiblePositionManager (minimale) ──────────────

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params)
        external
        returns (uint256 amount0, uint256 amount1);

    /**
     * @notice Crée et initialise la pool V3 si elle n'existe pas encore.
     *         Si la pool existe déjà, ne fait rien.
     * @param token0       Adresse token0 (< token1)
     * @param token1       Adresse token1
     * @param fee          Fee tier (ex: 10_000 = 1%)
     * @param sqrtPriceX96 Prix initial : sqrt(token1/token0) × 2^96
     * @return pool        Adresse de la pool (créée ou existante)
     */
    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24  fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96  nonce,
            address operator,
            address token0,
            address token1,
            uint24  fee,
            int24   tickLower,
            int24   tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
}

interface IFeeDistributor {
    function notifyReward(uint256 amount) external;
}

/**
 * @title V3LPVault
 * @notice Tient en permanence un NFT de position Uniswap V3 déposé à la graduation
 *         d'un token OM.
 *
 * Flux des fees :
 *   - 67 % → treasury  (platform)
 *   - 33 % → creator   OU FeeDistributor si holderRewards = true
 *
 * La liquidité (principal) n'est JAMAIS retirée.
 * Seules les fees accumulées (tokensOwed0 / tokensOwed1) sont collectées via
 * NonfungiblePositionManager.collect(), sans toucher au principal.
 *
 * Déployé une seule fois par token par LaunchpadFactory lors de la création.
 * Initialisé une seule fois par BondingCurve._graduate() quand la courbe graduate.
 */
contract V3LPVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constantes ───────────────────────────────────────────────────────

    /// @dev NonfungiblePositionManager sur Arc (chainId 5042 et 5042002)
    address public constant NFPM = 0x6049c9a0e26405c0985f9e3685c87d0ae917f82b;

    uint256 public constant PLATFORM_BPS = 6700; // 67%
    uint256 public constant BPS          = 10_000;

    // ─── État ─────────────────────────────────────────────────────────────

    IERC20  public usdc;
    address public treasury;
    address public creator;

    /// @notice Si true, la part creator (33%) va au FeeDistributor
    bool    public holderRewards;

    /// @notice Adresse du FeeDistributor (address(0) si holderRewards = false)
    address public feeDistributor;

    /// @notice ID du NFT V3 — 0 avant la graduation
    uint256 public positionTokenId;

    /// @notice true une fois que le NFT a été reçu via lockPosition()
    bool    public locked;

    /// @notice true si token0 est USDC dans la paire V3 (déterminé à lockPosition)
    bool    public usdcIsToken0;

    // ─── Protège initialize() ─────────────────────────────────────────────
    bool private _initialized;

    // ─── Events ──────────────────────────────────────────────────────────

    event PositionLocked(uint256 indexed tokenId, bool usdcIsToken0);
    event FeesCollected(uint256 usdcAmount, uint256 platformShare, uint256 creatorShare);

    // ─── Initializer ──────────────────────────────────────────────────────

    /**
     * @notice Appelé une seule fois par LaunchpadFactory à la création du token.
     * @param usdc_           Adresse USDC (0x3600…0000 sur Arc)
     * @param treasury_       Treasury platform
     * @param creator_        Créateur du token
     * @param holderRewards_  true → creator share va au FeeDistributor
     * @param feeDistributor_ Adresse FeeDistributor (address(0) si holderRewards_=false)
     */
    function initialize(
        address usdc_,
        address treasury_,
        address creator_,
        bool    holderRewards_,
        address feeDistributor_
    ) external {
        require(!_initialized,       "V3LPVault: already initialized");
        require(usdc_     != address(0), "V3LPVault: zero usdc");
        require(treasury_ != address(0), "V3LPVault: zero treasury");
        require(creator_  != address(0), "V3LPVault: zero creator");
        if (holderRewards_) {
            require(feeDistributor_ != address(0), "V3LPVault: zero distributor");
        }

        _initialized  = true;
        usdc          = IERC20(usdc_);
        treasury      = treasury_;
        creator       = creator_;
        holderRewards = holderRewards_;
        feeDistributor = feeDistributor_;
    }

    // ─── lockPosition — appelé par BondingCurve._graduate() ──────────────

    /**
     * @notice Reçoit le NFT V3 après graduation et enregistre son ID.
     *         Le NFT doit avoir été transféré à cette adresse AVANT cet appel.
     *         Vérifie que token0 ou token1 est bien USDC.
     * @param tokenId_ ID du NFT Uniswap V3
     */
    function lockPosition(uint256 tokenId_) external {
        require(!locked,         "V3LPVault: already locked");
        require(tokenId_ > 0,    "V3LPVault: invalid tokenId");
        require(_initialized,    "V3LPVault: not initialized");

        // Lire la position pour identifier quel side est USDC
        // positions() retourne 12 valeurs :
        // (nonce, operator, token0, token1, fee, tickLower, tickUpper,
        //  liquidity, feeGrowth0, feeGrowth1, tokensOwed0, tokensOwed1)
        (
            ,,
            address token0,
            address token1,
            ,,,,,,,,
        ) = INonfungiblePositionManager(NFPM).positions(tokenId_);

        address _usdc = address(usdc);
        require(token0 == _usdc || token1 == _usdc, "V3LPVault: no USDC in position");

        positionTokenId = tokenId_;
        usdcIsToken0    = (token0 == _usdc);
        locked          = true;

        emit PositionLocked(tokenId_, usdcIsToken0);
    }

    // ─── collectFees — appelable par n'importe qui (keeper-friendly) ─────

    /**
     * @notice Récolte les fees USDC accumulées dans la position V3.
     *         Ne retire PAS la liquidité — seules les fees sont collectées.
     *         Les tokens non-USDC récoltés (le meme token) sont renvoyés au creator.
     */
    function collectFees() external nonReentrant {
        require(locked, "V3LPVault: no position yet");

        // Collecter TOUTES les fees dues (USDC + token)
        (uint256 amt0, uint256 amt1) = INonfungiblePositionManager(NFPM).collect(
            INonfungiblePositionManager.CollectParams({
                tokenId:    positionTokenId,
                recipient:  address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        uint256 usdcFees  = usdcIsToken0 ? amt0 : amt1;
        uint256 tokenFees = usdcIsToken0 ? amt1 : amt0; // meme token

        // Distribuer USDC
        if (usdcFees > 0) {
            uint256 platformShare = usdcFees * PLATFORM_BPS / BPS;
            uint256 creatorShare  = usdcFees - platformShare;

            usdc.safeTransfer(treasury, platformShare);

            if (holderRewards && feeDistributor != address(0)) {
                usdc.safeTransfer(feeDistributor, creatorShare);
                IFeeDistributor(feeDistributor).notifyReward(creatorShare);
            } else {
                usdc.safeTransfer(creator, creatorShare);
            }

            emit FeesCollected(usdcFees, platformShare, creatorShare);
        }

        // Renvoyer les meme tokens au creator (évite qu'ils restent bloqués)
        if (tokenFees > 0) {
            // Récupérer l'adresse du token depuis la position
            (,, address token0, address token1,,,,,,,,) =
                INonfungiblePositionManager(NFPM).positions(positionTokenId);
            address memeToken = usdcIsToken0 ? token1 : token0;
            IERC20(memeToken).safeTransfer(creator, tokenFees);
        }
    }

    // ─── View helpers ─────────────────────────────────────────────────────

    /**
     * @notice Fees USDC actuellement accumulées dans la position (estimé via tokensOwed).
     */
    function pendingUsdcFees() external view returns (uint256) {
        if (!locked) return 0;
        (,,,,,,,,,, uint128 tokensOwed0, uint128 tokensOwed1) =
            INonfungiblePositionManager(NFPM).positions(positionTokenId);
        return usdcIsToken0 ? uint256(tokensOwed0) : uint256(tokensOwed1);
    }
}
