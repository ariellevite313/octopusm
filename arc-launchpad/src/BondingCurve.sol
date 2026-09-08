// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ─── Interfaces Uniswap V2 (minimales) ──────────────────────────────────────

interface IUniswapV2Router02 {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
}

interface IUniswapV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

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

    /// @dev Adresse dead pour burn LP
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ─── État ────────────────────────────────────────────────────────────

    IERC20  public usdc;
    IERC20  public token;
    address public creator;
    address public treasury;
    address public uniswapRouter;
    address public uniswapFactory;

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

    event Graduated(address indexed pair, uint256 usdcToLP, uint256 tokensToLP);

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
     */
    function initialize(
        address token_,
        address creator_,
        address usdc_,
        address treasury_,
        address uniswapRouter_,
        address uniswapFactory_
    ) external {
        require(!_initialized,         "BondingCurve: already initialized");
        require(token_          != address(0), "BondingCurve: zero token");
        require(creator_        != address(0), "BondingCurve: zero creator");
        require(usdc_           != address(0), "BondingCurve: zero usdc");
        require(treasury_       != address(0), "BondingCurve: zero treasury");
        require(uniswapRouter_  != address(0), "BondingCurve: zero router");
        require(uniswapFactory_ != address(0), "BondingCurve: zero factory");

        _initialized    = true;
        token           = IERC20(token_);
        creator         = creator_;
        usdc            = IERC20(usdc_);
        treasury        = treasury_;
        uniswapRouter   = uniswapRouter_;
        uniswapFactory  = uniswapFactory_;

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
     *      Crée la paire Uniswap V2, ajoute la liquidité et brûle les LP tokens.
     */
    function _graduate() internal {
        require(!graduated, "BondingCurve: already graduated");
        graduated = true;

        uint256 usdcForLP   = realUsdcRaised;  // USDC net levés (sans les virtual)
        uint256 tokensForLP = LP_RESERVE;       // 200 M tokens réservés

        // S'assurer que la paire existe (la créer si besoin)
        address factory = uniswapFactory;
        address _token  = address(token);
        address _usdc   = address(usdc);

        if (IUniswapV2Factory(factory).getPair(_token, _usdc) == address(0)) {
            IUniswapV2Factory(factory).createPair(_token, _usdc);
        }
        address pair = IUniswapV2Factory(factory).getPair(_token, _usdc);

        // Approuver le router
        token.approve(uniswapRouter, tokensForLP);
        usdc.approve(uniswapRouter, usdcForLP);

        // Ajouter la liquidité — LP tokens envoyés directement à DEAD
        (,, uint256 liquidity) = IUniswapV2Router02(uniswapRouter).addLiquidity(
            _token,
            _usdc,
            tokensForLP,
            usdcForLP,
            0,      // amountAMin — accepter toute la liquidité (on contrôle les deux côtés)
            0,      // amountBMin
            DEAD,   // LP tokens → dead, non récupérables
            block.timestamp + 600
        );

        require(liquidity > 0, "BondingCurve: no LP minted");

        emit Graduated(pair, usdcForLP, tokensForLP);
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
     * @dev Distribue la fee : moitié accumulée pour le créateur, moitié envoyée à la treasury.
     */
    function _distributeFees(uint256 fee) internal {
        if (fee == 0) return;
        uint256 creatorShare  = fee / 2;
        uint256 treasuryShare = fee - creatorShare; // absorbe le reste (rounding)
        creatorFeesAccrued   += creatorShare;
        if (treasuryShare > 0) {
            usdc.safeTransfer(treasury, treasuryShare);
        }
        emit FeesPaid(creator, creatorShare, treasury, treasuryShare);
    }

    /**
     * @dev Division entière avec arrondi vers le haut.
     */
    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
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
