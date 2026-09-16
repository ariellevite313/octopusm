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

    /// @dev NonfungiblePositionManager sur Arc Mainnet (chainId 5042)
    address public constant NFPM = 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B;

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
        // positions() retourne 12 valeurs — on nomme tout pour éviter l'ambiguïté des virgules
        (
            uint96  _nonce, address _operator,
            address token0, address token1,
            uint24  _fee, int24 _tickLower, int24 _tickUpper,
            uint128 _liquidity,
            uint256 _fg0, uint256 _fg1,
            uint128 _ow0, uint128 _ow1
        ) = INonfungiblePositionManager(NFPM).positions(tokenId_);
        // Supprime les warnings "unused variable"
        (_nonce, _operator, _fee, _tickLower, _tickUpper, _liquidity, _fg0, _fg1, _ow0, _ow1);

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
            (
                uint96  _n2, address _op2,
                address token0_, address token1_,
                uint24  _f2, int24 _tl2, int24 _tu2,
                uint128 _liq2,
                uint256 _fg02, uint256 _fg12,
                uint128 _ow02, uint128 _ow12
            ) = INonfungiblePositionManager(NFPM).positions(positionTokenId);
            (_n2, _op2, _f2, _tl2, _tu2, _liq2, _fg02, _fg12, _ow02, _ow12);
            address memeToken = usdcIsToken0 ? token1_ : token0_;
            IERC20(memeToken).safeTransfer(creator, tokenFees);
        }
    }

    // ─── View helpers ─────────────────────────────────────────────────────

    /**
     * @notice Fees USDC actuellement accumulées dans la position (estimé via tokensOwed).
     */
    function pendingUsdcFees() external view returns (uint256) {
        if (!locked) return 0;
        (
            uint96  _n3, address _op3,
            address _t03, address _t13,
            uint24  _f3, int24 _tl3, int24 _tu3,
            uint128 _liq3,
            uint256 _fg03, uint256 _fg13,
            uint128 tokensOwed0, uint128 tokensOwed1
        ) = INonfungiblePositionManager(NFPM).positions(positionTokenId);
        (_n3, _op3, _t03, _t13, _f3, _tl3, _tu3, _liq3, _fg03, _fg13);
        return usdcIsToken0 ? uint256(tokensOwed0) : uint256(tokensOwed1);
    }
}
