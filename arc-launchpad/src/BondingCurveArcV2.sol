// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BondingCurveArcV2
 * @notice AMM constant-product standalone pour la phase pré-graduation sur Arc.
 *
 * • USDC = ETH natif Arc (msg.value / address.transfer). 18 décimales.
 * • Token = ERC-20 18 décimales.
 * • Graduation déclenche la création du pool Uniswap V4 (fee=2500, spacing=25, hook=0x0).
 *
 * Calibration :
 *   VIRTUAL_USDC  = 1 920 USDC  → price d'ouverture 2.4e-6 USDC/token → FDV ≈ 2 400 USDC
 *   CURVE_SUPPLY  = 800 M tok   → 80 % du supply total
 *   GRAD_THRESHOLD= 2 000 USDC  → graduation FDV ≈ 25 000 USDC
 *
 * Déployé via clone EIP-1167. initialize() appelé une seule fois par la factory.
 */
contract BondingCurveArcV2 is ReentrancyGuard {

    // ─── Calibration ─────────────────────────────────────────────────────────

    uint256 public constant VIRTUAL_USDC    = 1_920 ether;            // 1920 USDC natif
    uint256 public constant CURVE_SUPPLY    = 800_000_000 * 1e18;     // 800 M tokens
    uint256 public constant LP_RESERVE      = 200_000_000 * 1e18;     // 200 M tokens → LP V4
    uint256 public constant GRAD_THRESHOLD  = 2_000 ether;            // 2000 USDC réels levés
    uint256 public constant K               = VIRTUAL_USDC * CURVE_SUPPLY;
    uint256 public constant FEE_BPS         = 200;                     // 2 % total
    uint256 public constant BPS             = 10_000;

    // ─── Adresses V4 (Arc mainnet) ────────────────────────────────────────────

    address public constant POOL_MANAGER     = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address public constant POSITION_MANAGER = 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B;

    /// @dev Paramètres du pool V4 à créer à la graduation
    uint24  public constant V4_FEE          = 2_500;
    int24   public constant V4_TICK_SPACING = 25;

    /// @dev Range LP one-sided : tokens au-dessus du prix courant.
    ///      tick_upper = 129 400 → prix d'ouverture FDV 2 400 USDC (aligné spacing 25).
    ///      tick_lower = -887 200 → borne inférieure pratiquement MAX (tout le supply absorbable).
    int24   public constant TICK_LOWER = -887_200;
    int24   public constant TICK_UPPER =  129_400;

    // ─── État ─────────────────────────────────────────────────────────────────

    address public token;
    address public creator;
    address public treasury;
    address public graduationVault; // reçoit le NFT LP V4 après graduation

    uint256 public reserveUsdc;    // réserve courante (virtual + real), 18 dec
    uint256 public reserveTokens;  // réserve tokens courante, 18 dec
    uint256 public realUsdcRaised; // USDC nets réellement levés (hors virtual)
    uint256 public creatorAccrued; // fees créateur accumulées

    bool public graduated;
    bool private _initialized;

    // ─── Events ───────────────────────────────────────────────────────────────

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

    event FeesPaid(uint256 creatorFee, uint256 treasuryFee);
    event FeesClaimed(address indexed to, uint256 amount);
    event Graduated(uint256 usdcSentToVault, uint256 tokensSentToVault);

    // ─── Init ─────────────────────────────────────────────────────────────────

    /**
     * @notice Initialise le clone (appelé une seule fois par la factory).
     * @param token_    Adresse du meme token (OMToken)
     * @param creator_  Créateur — reçoit les fees créateur
     * @param treasury_ Plateforme — reçoit la moitié des fees
     * @param vault_    GraduationVaultV4 — reçoit le NFT LP après graduation
     */
    function initialize(
        address token_,
        address creator_,
        address treasury_,
        address vault_
    ) external {
        require(!_initialized,           "already initialized");
        require(token_    != address(0), "zero token");
        require(creator_  != address(0), "zero creator");
        require(treasury_ != address(0), "zero treasury");
        require(vault_    != address(0), "zero vault");

        _initialized    = true;
        token           = token_;
        creator         = creator_;
        treasury        = treasury_;
        graduationVault = vault_;

        reserveUsdc   = VIRTUAL_USDC;
        reserveTokens = CURVE_SUPPLY;
    }

    // ─── Quotes (view) ────────────────────────────────────────────────────────

    /// @notice Simule un buy. Retourne tokens obtenus et fee.
    function quoteBuy(uint256 usdcIn)
        external view
        returns (uint256 tokensOut, uint256 fee)
    {
        fee      = usdcIn * FEE_BPS / BPS;
        uint256 net  = usdcIn - fee;
        uint256 newR = reserveUsdc + net;
        tokensOut    = reserveTokens - K / newR;
    }

    /// @notice Simule un sell. Retourne USDC nets obtenus et fee.
    function quoteSell(uint256 tokensIn)
        external view
        returns (uint256 usdcOut, uint256 fee)
    {
        uint256 newRt = reserveTokens + tokensIn;
        uint256 gross = reserveUsdc - K / newRt;
        fee    = gross * FEE_BPS / BPS;
        usdcOut = gross - fee;
    }

    // ─── Buy ──────────────────────────────────────────────────────────────────

    /**
     * @notice Achète des tokens contre du USDC natif (msg.value).
     * @param minTokensOut Slippage guard.
     */
    function buy(uint256 minTokensOut) external payable nonReentrant {
        require(!graduated,    "BCv2: graduated");
        require(msg.value > 0, "BCv2: zero value");

        uint256 fee     = msg.value * FEE_BPS / BPS;
        uint256 usdcNet = msg.value - fee;

        // Fee split 50/50 créateur / treasury
        uint256 creatorFee  = fee / 2;
        uint256 treasuryFee = fee - creatorFee;
        creatorAccrued += creatorFee;
        _safeTransferETH(treasury, treasuryFee);

        // AMM constant-product
        uint256 newReserveUsdc   = reserveUsdc + usdcNet;
        uint256 newReserveTokens = K / newReserveUsdc;
        uint256 tokensOut        = reserveTokens - newReserveTokens;
        require(tokensOut >= minTokensOut, "BCv2: slippage");

        reserveUsdc    = newReserveUsdc;
        reserveTokens  = newReserveTokens;
        realUsdcRaised += usdcNet;

        IERC20(token).transfer(msg.sender, tokensOut);
        emit Trade(msg.sender, true, msg.value, tokensOut, fee, realUsdcRaised, reserveUsdc, reserveTokens);
        emit FeesPaid(creatorFee, treasuryFee);

        if (realUsdcRaised >= GRAD_THRESHOLD) _graduate();
    }

    // ─── Sell ─────────────────────────────────────────────────────────────────

    /**
     * @notice Vend des tokens contre du USDC natif.
     * @param tokensIn   Tokens à vendre.
     * @param minUsdcOut Slippage guard.
     */
    function sell(uint256 tokensIn, uint256 minUsdcOut) external nonReentrant {
        require(!graduated, "BCv2: graduated");
        require(tokensIn > 0, "BCv2: zero tokens");

        IERC20(token).transferFrom(msg.sender, address(this), tokensIn);

        // AMM constant-product
        uint256 newReserveTokens = reserveTokens + tokensIn;
        uint256 newReserveUsdc   = K / newReserveTokens;
        uint256 usdcGross        = reserveUsdc - newReserveUsdc;
        require(usdcGross <= realUsdcRaised, "BCv2: insufficient real usdc");

        uint256 fee       = usdcGross * FEE_BPS / BPS;
        uint256 usdcNet   = usdcGross - fee;
        require(usdcNet >= minUsdcOut, "BCv2: slippage");

        uint256 creatorFee  = fee / 2;
        uint256 treasuryFee = fee - creatorFee;
        creatorAccrued += creatorFee;
        _safeTransferETH(treasury, treasuryFee);

        reserveUsdc    = newReserveUsdc;
        reserveTokens  = newReserveTokens;
        realUsdcRaised -= usdcGross;

        _safeTransferETH(msg.sender, usdcNet);
        emit Trade(msg.sender, false, usdcNet, tokensIn, fee, realUsdcRaised, reserveUsdc, reserveTokens);
        emit FeesPaid(creatorFee, treasuryFee);
    }

    // ─── Claim fees créateur ──────────────────────────────────────────────────

    function claimCreatorFees(address to) external {
        require(msg.sender == creator, "BCv2: not creator");
        uint256 amount = creatorAccrued;
        require(amount > 0, "BCv2: nothing to claim");
        creatorAccrued = 0;
        _safeTransferETH(to, amount);
        emit FeesClaimed(to, amount);
    }

    // ─── View helpers ─────────────────────────────────────────────────────────

    /// @notice Prix courant en USDC par token (18 dec).
    function currentPriceUsdc() external view returns (uint256) {
        return reserveUsdc * 1e18 / reserveTokens;
    }

    /// @notice Progression vers la graduation en BPS (0–10000).
    function progressBps() external view returns (uint256) {
        if (graduated) return 10_000;
        return realUsdcRaised * 10_000 / GRAD_THRESHOLD;
    }

    // ─── Graduation ───────────────────────────────────────────────────────────

    /**
     * @notice Graduation : transfère tout le USDC + LP_RESERVE tokens au GraduationVaultV4.
     *         Ce vault crée ensuite le pool V4, mintera la position, exécutera le premier swap.
     *
     * @dev Séparation volontaire : la logique V4 (callback unlockData) vit dans le vault,
     *      pas ici. Cela permet de mettre à jour le vault sans redéployer la courbe.
     */
    function _graduate() internal {
        graduated = true;

        // 1. Tous les USDC réels vont au vault
        uint256 usdcToVault = realUsdcRaised;
        realUsdcRaised = 0;

        // 2. LP_RESERVE tokens vont au vault (200 M)
        uint256 tokensToVault = LP_RESERVE;

        // 3. Brûler les tokens restants dans la curve (non vendus) — supply propre
        uint256 remainingCurveTokens = IERC20(token).balanceOf(address(this)) - tokensToVault;
        if (remainingCurveTokens > 0) {
            IERC20(token).transfer(address(0xdead), remainingCurveTokens);
        }

        // 4. Transférer vers le vault
        IERC20(token).transfer(graduationVault, tokensToVault);
        _safeTransferETH(graduationVault, usdcToVault);

        // 5. Déclencher la création du pool V4 dans le vault
        IGraduationVaultV4(graduationVault).createV4Pool(
            token,
            TICK_LOWER,
            TICK_UPPER
        );

        emit Graduated(usdcToVault, tokensToVault);
    }

    // ─── Internal helpers ─────────────────────────────────────────────────────

    function _safeTransferETH(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "BCv2: ETH transfer failed");
    }

    receive() external payable {}
}

// ─── Interface minimale pour le vault (évite l'import circulaire) ─────────────

interface IGraduationVaultV4 {
    function createV4Pool(address token, int24 tickLower, int24 tickUpper) external;
}
