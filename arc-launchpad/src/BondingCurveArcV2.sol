// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title BondingCurveArcV2
 * @notice AMM constant-product standalone pour la phase pré-graduation sur Arc.
 *
 * • USDC = ETH natif Arc (msg.value / address.transfer). 18 décimales.
 * • Token = ERC-20 18 décimales (OMToken avec système de dividendes).
 * • 4 fee tiers — la répartition varie, le total reste dans le tier.
 * • Graduation déclenche la création du pool Uniswap V4 (fee=2500, spacing=25, hook=0x0).
 *
 * Fee tiers :
 *   Tier 0 — Standard  1.00% : Créateur 0.60%, Plateforme 0.40%
 *   Tier 1 — Community 1.25% : Créateur 0.70%, Plateforme 0.30%, Holders 0.25%
 *   Tier 2 — Creator   1.50% : Créateur 0.90%, Plateforme 0.35%, LP Bonus 0.15%, Holders 0.10%
 *   Tier 3 — Max       2.00% : Créateur 1.00%, Plateforme 0.50%, LP Bonus 0.30%, Holders 0.20%
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

    uint256 public constant VIRTUAL_USDC    = 1_920 ether;
    uint256 public constant CURVE_SUPPLY    = 800_000_000 * 1e18;
    uint256 public constant LP_RESERVE      = 200_000_000 * 1e18;
    uint256 public constant GRAD_THRESHOLD  = 2_000 ether;
    uint256 public constant K               = VIRTUAL_USDC * CURVE_SUPPLY;
    uint256 public constant BPS             = 10_000;

    // ─── Adresses V4 (Arc mainnet) ────────────────────────────────────────────

    address public constant POOL_MANAGER     = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address public constant POSITION_MANAGER = 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B;

    uint24  public constant V4_FEE          = 5_000;   // 0.50%
    int24   public constant V4_TICK_SPACING = 60;      // full-range, divisible par 60
    int24   public constant TICK_LOWER      = -887_220; // -14787 × 60
    int24   public constant TICK_UPPER      =  887_220; //  14787 × 60

    // ─── Fee tier — bps par destinataire ─────────────────────────────────────
    //
    // Tier 0 Standard  1.00% : Créateur 0.60%, Plateforme 0.40%
    // Tier 1 Community 1.25% : Créateur 0.70%, Plateforme 0.30%, Holders 0.25%
    // Tier 2 Creator   1.50% : Créateur 0.90%, Plateforme 0.35%, LP 0.15%, Holders 0.10%
    // Tier 3 Max       2.00% : Créateur 1.00%, Plateforme 0.50%, LP 0.30%, Holders 0.20%

    // ─── État ─────────────────────────────────────────────────────────────────

    address public token;
    address public creator;
    address public treasury;
    address public graduationVault;

    uint256 public reserveUsdc;
    uint256 public reserveTokens;
    uint256 public realUsdcRaised;
    uint256 public creatorAccrued;
    uint256 public lockedLpAccrued;  // LP bonus accumulé (ajouté au vault à la graduation)

    uint8   public feeTier;          // 0=Standard / 1=Community / 2=Creator / 3=Max
    bool    public graduated;
    bool    private _initialized;

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

    event FeesPaid(uint256 creatorFee, uint256 platformFee, uint256 lpFee, uint256 holdersFee);
    event FeesClaimed(address indexed to, uint256 amount);
    event Graduated(uint256 usdcSentToVault, uint256 tokensSentToVault);

    // ─── Init ─────────────────────────────────────────────────────────────────

    /**
     * @notice Initialise le clone (appelé une seule fois par la factory).
     * @param feeTier_  0=Standard · 1=Community · 2=Creator · 3=Max
     */
    function initialize(
        address token_,
        address creator_,
        address treasury_,
        address vault_,
        uint8   feeTier_
    ) external {
        require(!_initialized,           "already initialized");
        require(token_    != address(0), "zero token");
        require(creator_  != address(0), "zero creator");
        require(treasury_ != address(0), "zero treasury");
        require(vault_    != address(0), "zero vault");
        require(feeTier_  <= 3,          "invalid tier");

        _initialized    = true;
        token           = token_;
        creator         = creator_;
        treasury        = treasury_;
        graduationVault = vault_;
        feeTier         = feeTier_;

        reserveUsdc   = VIRTUAL_USDC;
        reserveTokens = CURVE_SUPPLY;
    }

    // ─── Fee split (view) ─────────────────────────────────────────────────────

    /**
     * @notice Retourne les bps par destinataire pour le tier actuel.
     * @return totalBps    Fee totale en bps
     * @return creatorBps  Part créateur
     * @return platformBps Part plateforme
     * @return lpBps       Part LP bonus (accumulée jusqu'à graduation)
     * @return holdersBps  Part dividendes holders (envoyée à OMToken)
     */
    function tierBps() public view returns (
        uint256 totalBps,
        uint256 creatorBps,
        uint256 platformBps,
        uint256 lpBps,
        uint256 holdersBps
    ) {
        // Valeurs identiques à BondingCurveHook V1 (pré-graduation)
        if (feeTier == 0) return (100,  50, 25, 25,  0);  // Standard  1.00%
        if (feeTier == 1) return (125,  40, 30, 30, 25);  // Community 1.25%
        if (feeTier == 2) return (150,  80, 40, 30,  0);  // Creator   1.50%
        /* tier 3 */      return (200, 100, 50, 30, 20);  // Max       2.00%
    }

    // ─── Quotes (view) ────────────────────────────────────────────────────────

    function quoteBuy(uint256 usdcIn)
        external view
        returns (uint256 tokensOut, uint256 fee)
    {
        (uint256 total,,,, ) = tierBps();
        fee      = usdcIn * total / BPS;
        uint256 net  = usdcIn - fee;
        uint256 newR = reserveUsdc + net;
        tokensOut    = reserveTokens - K / newR;
    }

    function quoteSell(uint256 tokensIn)
        external view
        returns (uint256 usdcOut, uint256 fee)
    {
        (uint256 total,,,, ) = tierBps();
        uint256 newRt = reserveTokens + tokensIn;
        uint256 gross = reserveUsdc - K / newRt;
        fee    = gross * total / BPS;
        usdcOut = gross - fee;
    }

    // ─── Buy ──────────────────────────────────────────────────────────────────

    function buy(uint256 minTokensOut) external payable nonReentrant {
        _buy(msg.sender, minTokensOut);
    }

    /**
     * @notice Achète des tokens pour un destinataire arbitraire (utilisé par la factory
     *         pour le first buy : msg.sender = factory, recipient = créateur).
     */
    function buyFor(address recipient, uint256 minTokensOut) external payable nonReentrant {
        require(recipient != address(0), "BCv2: zero recipient");
        _buy(recipient, minTokensOut);
    }

    function _buy(address recipient, uint256 minTokensOut) internal {
        require(!graduated,    "BCv2: graduated");
        require(msg.value > 0, "BCv2: zero value");

        (uint256 totalB, uint256 cB, uint256 pB, uint256 lB, uint256 hB) = tierBps();

        uint256 fee         = msg.value * totalB / BPS;
        uint256 usdcNet     = msg.value - fee;

        uint256 creatorFee  = msg.value * cB / BPS;
        uint256 platformFee = msg.value * pB / BPS;
        uint256 lpFee       = msg.value * lB / BPS;
        uint256 holdersFee  = fee - creatorFee - platformFee - lpFee;

        creatorAccrued  += creatorFee;
        lockedLpAccrued += lpFee;
        _safeTransferETH(treasury, platformFee);
        if (holdersFee > 0) {
            IOMToken(token).addDividend{value: holdersFee}();
        }

        uint256 newReserveUsdc   = reserveUsdc + usdcNet;
        uint256 newReserveTokens = K / newReserveUsdc;
        uint256 tokensOut        = reserveTokens - newReserveTokens;
        require(tokensOut >= minTokensOut, "BCv2: slippage");

        reserveUsdc    = newReserveUsdc;
        reserveTokens  = newReserveTokens;
        realUsdcRaised += usdcNet;

        IERC20(token).transfer(recipient, tokensOut);
        emit Trade(recipient, true, msg.value, tokensOut, fee, realUsdcRaised, reserveUsdc, reserveTokens);
        emit FeesPaid(creatorFee, platformFee, lpFee, holdersFee);

        if (realUsdcRaised >= GRAD_THRESHOLD) _graduate();
    }

    // ─── Sell ─────────────────────────────────────────────────────────────────

    function sell(uint256 tokensIn, uint256 minUsdcOut) external nonReentrant {
        require(!graduated, "BCv2: graduated");
        require(tokensIn > 0, "BCv2: zero tokens");

        IERC20(token).transferFrom(msg.sender, address(this), tokensIn);

        uint256 newReserveTokens = reserveTokens + tokensIn;
        uint256 newReserveUsdc   = K / newReserveTokens;
        uint256 usdcGross        = reserveUsdc - newReserveUsdc;
        require(usdcGross <= realUsdcRaised, "BCv2: insufficient real usdc");

        (uint256 totalB, uint256 cB, uint256 pB, uint256 lB, uint256 hB) = tierBps();

        uint256 fee         = usdcGross * totalB / BPS;
        uint256 usdcNet     = usdcGross - fee;
        require(usdcNet >= minUsdcOut, "BCv2: slippage");

        uint256 creatorFee  = usdcGross * cB / BPS;
        uint256 platformFee = usdcGross * pB / BPS;
        uint256 lpFee       = usdcGross * lB / BPS;
        uint256 holdersFee  = fee - creatorFee - platformFee - lpFee;

        creatorAccrued  += creatorFee;
        lockedLpAccrued += lpFee;
        _safeTransferETH(treasury, platformFee);
        if (holdersFee > 0) {
            IOMToken(token).addDividend{value: holdersFee}();
        }

        reserveUsdc    = newReserveUsdc;
        reserveTokens  = newReserveTokens;
        realUsdcRaised -= usdcGross;

        _safeTransferETH(msg.sender, usdcNet);
        emit Trade(msg.sender, false, usdcNet, tokensIn, fee, realUsdcRaised, reserveUsdc, reserveTokens);
        emit FeesPaid(creatorFee, platformFee, lpFee, holdersFee);
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

    function currentPriceUsdc() external view returns (uint256) {
        return reserveUsdc * 1e18 / reserveTokens;
    }

    function progressBps() external view returns (uint256) {
        if (graduated) return 10_000;
        return realUsdcRaised * 10_000 / GRAD_THRESHOLD;
    }

    // ─── Graduation ───────────────────────────────────────────────────────────

    function _graduate() internal {
        graduated = true;

        // USDC réels + LP bonus accumulé → vault (booste la liquidité V4)
        uint256 usdcToVault = realUsdcRaised + lockedLpAccrued;
        realUsdcRaised  = 0;
        lockedLpAccrued = 0;

        // 200 M tokens → vault LP
        uint256 tokensToVault = LP_RESERVE;

        // Brûler les tokens non vendus
        uint256 remainingCurveTokens = IERC20(token).balanceOf(address(this)) - tokensToVault;
        if (remainingCurveTokens > 0) {
            IERC20(token).transfer(address(0xdead), remainingCurveTokens);
        }

        IERC20(token).transfer(graduationVault, tokensToVault);
        _safeTransferETH(graduationVault, usdcToVault);

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

// ─── Interfaces minimales ──────────────────────────────────────────────────────

interface IGraduationVaultV4 {
    function createV4Pool(address token, int24 tickLower, int24 tickUpper) external;
}

interface IOMToken {
    function addDividend() external payable;
}
