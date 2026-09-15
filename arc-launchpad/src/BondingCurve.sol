// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// INonfungiblePositionManager et V3LPVault importés ensemble — pas de redéfinition d'interface
import "./V3LPVault.sol";

/**
 * @title BondingCurve
 * @notice AMM constant-product avec réserves virtuelles pour le launchpad OM sur Arc.
 *
 * Calibration (ERC-20 USDC 6 dec, tokens 18 dec) :
 *   VIRTUAL_USDC  = 3 200 USDC   → initial mcap ≈ 4 000 USDC
 *   CURVE_SUPPLY  = 800 M tokens → 80 % du supply total vendables sur la courbe
 *   k             = 2.56e36      → constant invariant
 *   GRAD_THRESHOLD= 4 800 USDC   → graduation mcap ≈ 25 000 USDC
 *
 * Fees : 2 % sur la jambe USDC, split 50/50 créateur / treasury.
 *
 * Ce contrat est déployé via un clone EIP-1167 ; initialize() remplace le constructeur.
 * Aucune fonction admin post-initialize.
 *
 * Graduation V3 :
 *   - 4 800 USDC net levés + 200 M tokens → position Uniswap V3 full-range (fee tier 1%)
 *   - NFT de position envoyé au V3LPVault déployé par la factory
 *   - fees V3 (1% sur chaque swap) → 67% treasury / 33% creator (ou holders)
 */
contract BondingCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constantes de calibration ────────────────────────────────────────

    /// @dev Réserve USDC virtuelle initiale (6 dec) : 3 200 USDC
    uint256 public constant VIRTUAL_USDC   = 3_200_000_000;

    /// @dev Allocation courbe en tokens (18 dec) : 800 M tokens
    uint256 public constant CURVE_SUPPLY   = 800_000_000 * 1e18;

    /// @dev Réserve LP (18 dec) : 200 M tokens
    uint256 public constant LP_RESERVE     = 200_000_000 * 1e18;

    /// @dev Seuil de graduation : USDC net levés (6 dec) : 4 800 USDC
    uint256 public constant GRAD_THRESHOLD = 4_800_000_000;

    /// @dev Invariant k = VIRTUAL_USDC * CURVE_SUPPLY
    uint256 public constant K = VIRTUAL_USDC * CURVE_SUPPLY; // 2.56e36

    /// @dev Fee totale en BPS (200 = 2 %)
    uint256 public constant FEE_BPS = 200;

    /// @dev Dénominateur BPS
    uint256 public constant BPS = 10_000;

    /// @dev Plafond first buy : 10 % du GRAD_THRESHOLD
    uint256 public constant MAX_FIRST_BUY = GRAD_THRESHOLD / 10; // 480 USDC

    /// @dev NonfungiblePositionManager Uniswap V3 sur Arc
    address public constant NFPM = 0x6049c9a0e26405c0985f9e3685c87d0ae917f82b;

    /// @dev Fee tier Uniswap V3 utilisé pour la paire post-graduation (1%)
    uint24 public constant V3_FEE_TIER = 10_000;

    /// @dev Ticks full-range pour V3 (fee tier 1% → tickSpacing 200)
    int24 public constant TICK_LOWER = -887200;
    int24 public constant TICK_UPPER =  887200;

    // ─── État ────────────────────────────────────────────────────────────

    IERC20  public usdc;
    IERC20  public token;
    address public creator;
    address public treasury;

    /// @notice V3LPVault qui recevra le NFT à la graduation
    address public vault;

    /// @notice Réserve USDC courante (virtual + real), 6 dec
    uint256 public reserveUsdc;

    /// @notice Réserve tokens courante, 18 dec
    uint256 public reserveTokens;

    /// @notice USDC net réellement levés (hors virtual), 6 dec
    uint256 public realUsdcRaised;

    /// @notice Fees créateur accumulées non encore réclamées, 6 dec
    uint256 public creatorFeesAccrued;

    /// @notice Token gradué → buy/sell bloqués
    bool public graduated;

    /// @notice Protège initialize() des appels multiples
    bool private _initialized;

    // ─── Events ──────────────────────────────────────────────────────────

    event Trade(
        address indexed trader,
        bool    isBuy,
        uint256 usdcAmount,
        uint256 tokenAmount,
        uint256 fee,
        uint256 realUsdcRaised,
        uint256 reserveUsdc,
        uint256 reserveTokens
    );

    event Graduated(uint256 indexed tokenId, uint256 usdcToLP, uint256 tokensToLP);

    event FeesPaid(
        address indexed creator,
        uint256 creatorFee,
        address treasury,
        uint256 treasuryFee
    );

    event FeesClaimed(address indexed to, uint256 amount);

    // ─── Initializer (clone EIP-1167) ────────────────────────────────────

    /**
     * @notice Initialise le clone. Appelé une seule fois par la factory.
     * @param token_    Adresse du meme token
     * @param creator_  Créateur du token
     * @param usdc_     USDC ERC-20 Arc (0x3600…0000)
     * @param treasury_ Treasury platform
     * @param vault_    V3LPVault qui recevra le NFT à la graduation
     */
    function initialize(
        address token_,
        address creator_,
        address usdc_,
        address treasury_,
        address vault_
    ) external {
        require(!_initialized,          "BondingCurve: already initialized");
        require(token_    != address(0), "BondingCurve: zero token");
        require(creator_  != address(0), "BondingCurve: zero creator");
        require(usdc_     != address(0), "BondingCurve: zero usdc");
        require(treasury_ != address(0), "BondingCurve: zero treasury");
        require(vault_    != address(0), "BondingCurve: zero vault");

        _initialized  = true;
        token         = IERC20(token_);
        creator       = creator_;
        usdc          = IERC20(usdc_);
        treasury      = treasury_;
        vault         = vault_;

        // Réserves initiales
        reserveUsdc   = VIRTUAL_USDC;
        reserveTokens = CURVE_SUPPLY;
    }

    // ─── Quotes (view) ────────────────────────────────────────────────────

    /**
     * @notice Simule un buy. Retourne les tokens nets obtenus et la fee.
     *         Ne tient pas compte du partial fill à la graduation.
     * @param usdcIn USDC bruts (6 dec)
     */
    function quoteUsdcToTokens(uint256 usdcIn)
        external view
        returns (uint256 tokensOut, uint256 fee)
    {
        (tokensOut, fee,) = _quoteBuy(usdcIn);
    }

    /**
     * @notice Simule un sell. Retourne les USDC nets reçus et la fee.
     * @param tokensIn Tokens à vendre (18 dec)
     */
    function quoteTokensToUsdc(uint256 tokensIn)
        external view
        returns (uint256 usdcOut, uint256 fee)
    {
        (usdcOut, fee) = _quoteSell(tokensIn);
    }

    // ─── Buy ──────────────────────────────────────────────────────────────

    /**
     * @notice Achète des tokens avec de l'USDC.
     * @param usdcIn     Montant USDC brut (6 dec) — doit être approuvé avant
     * @param minTokens  Montant minimum de tokens attendus (slippage guard)
     * @param recipient  Adresse qui reçoit les tokens
     */
    function buy(
        uint256 usdcIn,
        uint256 minTokens,
        address recipient
    ) external nonReentrant {
        require(!graduated,       "BondingCurve: graduated");
        require(usdcIn > 0,       "BondingCurve: zero amount");
        require(recipient != address(0), "BondingCurve: zero recipient");

        // Partial fill si on approche du seuil
        uint256 usdcGross = usdcIn;
        uint256 usdcRefund;

        (uint256 tokensOut, uint256 fee, uint256 usdcNet) = _quoteBuy(usdcGross);

        // Vérifier si on dépasse GRAD_THRESHOLD
        if (realUsdcRaised + usdcNet > GRAD_THRESHOLD) {
            uint256 netAllowed = GRAD_THRESHOLD - realUsdcRaised;
            // Recalculer le gross pour exactement netAllowed net
            // netAllowed = gross * (BPS - FEE_BPS) / BPS  =>  gross = netAllowed * BPS / (BPS - FEE_BPS)
            uint256 grossCapped = _ceilDiv(netAllowed * BPS, BPS - FEE_BPS);
            usdcRefund  = usdcGross > grossCapped ? usdcGross - grossCapped : 0;
            usdcGross   = grossCapped;
            (tokensOut, fee, usdcNet) = _quoteBuy(usdcGross);
        }

        require(tokensOut >= minTokens, "BondingCurve: slippage");

        // 1. Recevoir les USDC (total brut, refund après)
        usdc.safeTransferFrom(msg.sender, address(this), usdcIn);

        // 2. Rembourser le surplus (partial fill)
        if (usdcRefund > 0) {
            usdc.safeTransfer(msg.sender, usdcRefund);
        }

        // 3. Distribuer les fees
        _distributeFees(fee);

        // 4. Mettre à jour l'état (checks-effects-interactions : état avant transferts)
        reserveUsdc   += usdcNet;
        reserveTokens -= tokensOut;
        realUsdcRaised += usdcNet;

        // 5. Transférer les tokens
        token.safeTransfer(recipient, tokensOut);

        emit Trade(
            msg.sender, true,
            usdcGross, tokensOut, fee,
            realUsdcRaised, reserveUsdc, reserveTokens
        );

        // 6. Graduation si seuil atteint
        if (realUsdcRaised >= GRAD_THRESHOLD) {
            _graduate();
        }
    }

    // ─── Sell ─────────────────────────────────────────────────────────────

    /**
     * @notice Vend des tokens contre de l'USDC.
     * @param tokensIn Montant de tokens (18 dec) — doit être approuvé avant
     * @param minUsdc  Montant minimum d'USDC attendus (slippage guard)
     * @param recipient Adresse qui reçoit l'USDC
     */
    function sell(
        uint256 tokensIn,
        uint256 minUsdc,
        address recipient
    ) external nonReentrant {
        require(!graduated,       "BondingCurve: graduated");
        require(tokensIn > 0,     "BondingCurve: zero amount");
        require(recipient != address(0), "BondingCurve: zero recipient");

        (uint256 usdcOut, uint256 fee) = _quoteSell(tokensIn);
        require(usdcOut >= minUsdc, "BondingCurve: slippage");

        // La réserve USDC ne peut pas descendre en dessous du virtual
        uint256 newReserveUsdc = reserveUsdc - (usdcOut + fee);
        require(newReserveUsdc >= VIRTUAL_USDC, "BondingCurve: below virtual");

        // 1. Recevoir les tokens
        token.safeTransferFrom(msg.sender, address(this), tokensIn);

        // 2. Mettre à jour l'état
        reserveTokens  += tokensIn;
        reserveUsdc    -= (usdcOut + fee);
        // realUsdcRaised diminue en proportion
        if (realUsdcRaised > 0) {
            uint256 netOut = usdcOut + fee;
            realUsdcRaised = netOut > realUsdcRaised ? 0 : realUsdcRaised - netOut;
        }

        // 3. Distribuer les fees
        _distributeFees(fee);

        // 4. Transférer les USDC nets
        usdc.safeTransfer(recipient, usdcOut);

        emit Trade(
            msg.sender, false,
            usdcOut, tokensIn, fee,
            realUsdcRaised, reserveUsdc, reserveTokens
        );
    }

    // ─── Claim fees créateur ──────────────────────────────────────────────

    /**
     * @notice Permet au créateur de retirer ses fees accumulées.
     * @param to Adresse de destination
     */
    function claimFees(address to) external nonReentrant {
        require(msg.sender == creator, "BondingCurve: not creator");
        require(to != address(0),      "BondingCurve: zero to");
        uint256 amount = creatorFeesAccrued;
        require(amount > 0,            "BondingCurve: no fees");
        creatorFeesAccrued = 0;
        usdc.safeTransfer(to, amount);
        emit FeesClaimed(to, amount);
    }

    // ─── Graduation interne ───────────────────────────────────────────────

    /**
     * @dev Appelé une seule fois quand realUsdcRaised >= GRAD_THRESHOLD.
     *
     * Crée une position Uniswap V3 full-range avec :
     *   - 4 800 USDC net levés
     *   - 200 M tokens réservés (LP_RESERVE)
     *
     * Le NFT de position est envoyé directement au V3LPVault qui collectera
     * les fees (1% sur chaque swap) et les distribuera 67% treasury / 33% creator.
     * La liquidité n'est jamais retirée (vault.lockPosition() le garantit).
     */
    function _graduate() internal {
        require(!graduated, "BondingCurve: already graduated");
        graduated = true;

        uint256 usdcForLP   = realUsdcRaised; // 4 800 USDC (6 dec)
        uint256 tokensForLP = LP_RESERVE;      // 200 M tokens (18 dec)

        address _token = address(token);
        address _usdc  = address(usdc);
        address _vault = vault;

        // Uniswap V3 exige token0 < token1 (ordre lexicographique des adresses)
        (address token0, address token1, uint256 amt0, uint256 amt1) =
            _token < _usdc
                ? (_token, _usdc, tokensForLP, usdcForLP)
                : (_usdc, _token, usdcForLP, tokensForLP);

        // Calculer le sqrtPriceX96 correspondant au ratio graduation
        // (4 800 USDC / 200 M tokens) afin d'initialiser la pool si elle n'existe pas.
        // sqrtPriceX96 = sqrt(amt1 / amt0) × 2^96
        //             = sqrt(amt1 × 2^128 / amt0) × 2^32  (évite l'overflow uint256)
        uint160 sqrtPriceX96 = _computeSqrtPriceX96(amt0, amt1);

        // Créer et initialiser la pool si elle n'existe pas (no-op si déjà existante)
        INonfungiblePositionManager(NFPM).createAndInitializePoolIfNecessary(
            token0, token1, V3_FEE_TIER, sqrtPriceX96
        );

        // Approuver le NFPM
        token.approve(NFPM, tokensForLP);
        usdc.approve(NFPM, usdcForLP);

        // Mint position full-range — NFT envoyé directement au vault
        (uint256 tokenId, uint128 liquidity,,) = INonfungiblePositionManager(NFPM).mint(
            INonfungiblePositionManager.MintParams({
                token0:         token0,
                token1:         token1,
                fee:            V3_FEE_TIER,   // 1%
                tickLower:      TICK_LOWER,     // -887200
                tickUpper:      TICK_UPPER,     //  887200
                amount0Desired: amt0,
                amount1Desired: amt1,
                amount0Min:     0,              // on contrôle les deux côtés, pas de slippage tiers
                amount1Min:     0,
                recipient:      _vault,         // NFT → vault directement
                deadline:       block.timestamp + 600
            })
        );

        require(liquidity > 0, "BondingCurve: no liquidity minted");

        // Révoquer les approbations restantes (sécurité)
        token.approve(NFPM, 0);
        usdc.approve(NFPM, 0);

        // Notifier le vault qu'il détient maintenant la position
        V3LPVault(_vault).lockPosition(tokenId);

        emit Graduated(tokenId, usdcForLP, tokensForLP);
    }

    // ─── Helpers internes ─────────────────────────────────────────────────

    /**
     * @dev Calcule les tokens obtenus pour `usdcGross` USDC bruts.
     */
    function _quoteBuy(uint256 usdcGross)
        internal view
        returns (uint256 tokensOut, uint256 fee, uint256 usdcNet)
    {
        fee     = usdcGross * FEE_BPS / BPS;
        usdcNet = usdcGross - fee;

        // constant-product : newReserveTokens = K / (reserveUsdc + usdcNet)
        uint256 newReserveUsdc   = reserveUsdc + usdcNet;
        uint256 newReserveTokens = K / newReserveUsdc;
        tokensOut = reserveTokens > newReserveTokens
            ? reserveTokens - newReserveTokens
            : 0;
    }

    /**
     * @dev Calcule l'USDC net reçu en vendant `tokensIn`.
     */
    function _quoteSell(uint256 tokensIn)
        internal view
        returns (uint256 usdcOut, uint256 fee)
    {
        uint256 newReserveTokens = reserveTokens + tokensIn;
        uint256 newReserveUsdc   = K / newReserveTokens;
        uint256 usdcGross = reserveUsdc > newReserveUsdc
            ? reserveUsdc - newReserveUsdc
            : 0;

        fee    = usdcGross * FEE_BPS / BPS;
        usdcOut = usdcGross - fee;
    }

    /**
     * @dev Distribue la fee : moitié treasury, moitié créateur.
     *
     * Si le vault a holderRewards = true, la part créateur est envoyée immédiatement
     * au FeeDistributor (notifyReward) plutôt qu'accumulée dans creatorFeesAccrued.
     * Cela permet aux holders de gagner des rewards dès le premier trade,
     * avant même la graduation V3.
     */
    function _distributeFees(uint256 fee) internal {
        if (fee == 0) return;
        uint256 creatorShare  = fee / 2;
        uint256 treasuryShare = fee - creatorShare; // absorbe le reste (rounding)

        if (treasuryShare > 0) {
            usdc.safeTransfer(treasury, treasuryShare);
        }

        if (creatorShare > 0) {
            V3LPVault _vault = V3LPVault(vault);
            if (_vault.holderRewards()) {
                // Holder rewards activés : envoyer la part créateur au FeeDistributor
                address dist = _vault.feeDistributor();
                usdc.safeTransfer(dist, creatorShare);
                IFeeDistributor(dist).notifyReward(creatorShare);
            } else {
                // Pas de holder rewards : accumuler pour que le créateur claim manuellement
                creatorFeesAccrued += creatorShare;
            }
        }

        emit FeesPaid(creator, creatorShare, treasury, treasuryShare);
    }

    /**
     * @dev Division entière avec arrondi vers le haut.
     */
    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
    }

    /**
     * @dev Calcule le sqrtPriceX96 Uniswap V3 à partir des montants de chaque côté.
     *
     *   sqrtPriceX96 = sqrt(amount1 / amount0) × 2^96
     *
     * Pour éviter l'overflow uint256 (amount1 × 2^192 peut dépasser 2^256),
     * on utilise la décomposition :
     *   sqrt(amount1 × 2^192 / amount0)
     *   = sqrt(amount1 × 2^128 / amount0) × 2^32
     *
     * Validité : amount0 et amount1 < 2^128 (nos montants max : ~2e26 < 2^88). ✓
     */
    function _computeSqrtPriceX96(uint256 amount0, uint256 amount1)
        internal pure
        returns (uint160)
    {
        uint256 ratioX128 = (amount1 << 128) / amount0;
        return uint160(_sqrt(ratioX128) << 32);
    }

    /**
     * @dev Racine carrée entière (méthode de Babylone).
     *      Retourne floor(sqrt(x)).
     */
    function _sqrt(uint256 x) internal pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    // ─── View helpers ─────────────────────────────────────────────────────

    /// @notice Prix spot en USDC (6 dec) par token (18 dec) × 1e18 pour la précision
    function spotPrice() external view returns (uint256) {
        return reserveUsdc * 1e18 / reserveTokens;
    }

    /// @notice Market cap virtuel en USDC (6 dec) × 1e18 / total_supply_18dec
    function marketCapUsdc() external view returns (uint256) {
        // mcap = price * total_supply = (reserveUsdc * 1e18 / reserveTokens) * 1e9 / 1e18
        //      = reserveUsdc * 1e9 / reserveTokens
        return reserveUsdc * 1_000_000_000 / reserveTokens;
    }

    /// @notice Progression vers la graduation en BPS (0-10000)
    function graduationProgressBps() external view returns (uint256) {
        if (graduated) return BPS;
        return realUsdcRaised * BPS / GRAD_THRESHOLD;
    }
}
