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
 * @title GenericBondingCurve
 * @notice AMM constant-product identique à BondingCurve, mais avec un quoteAsset
 *         configurable (USDC, xNVDA, xTSLA, xMSTR, etc.).
 *
 * Calibration (quoteAsset 6 dec, tokens 18 dec) :
 *   VIRTUAL_QUOTE  = 3 200 unités (6 dec) → initial mcap ≈ 4 000 unités
 *   CURVE_SUPPLY   = 800 M tokens
 *   GRAD_THRESHOLD = 4 800 unités de quoteAsset
 *
 * Fees : 2 % sur la jambe quoteAsset, split 50/50 créateur / treasury.
 *
 * Déployé via clone EIP-1167 ; initialize() remplace le constructeur.
 */
contract GenericBondingCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Constantes de calibration ────────────────────────────────────────

    /// @dev Réserve quote virtuelle initiale (6 dec) : 3 200 unités
    uint256 public constant VIRTUAL_QUOTE   = 3_200_000_000;

    /// @dev Allocation courbe en tokens (18 dec) : 800 M
    uint256 public constant CURVE_SUPPLY    = 800_000_000 * 1e18;

    /// @dev Réserve LP (18 dec) : 200 M tokens
    uint256 public constant LP_RESERVE      = 200_000_000 * 1e18;

    /// @dev Seuil de graduation : unités quote nettes levées (6 dec) : 4 800
    uint256 public constant GRAD_THRESHOLD  = 4_800_000_000;

    /// @dev Invariant k = VIRTUAL_QUOTE * CURVE_SUPPLY
    uint256 public constant K = VIRTUAL_QUOTE * CURVE_SUPPLY;

    /// @dev Fee totale en BPS (200 = 2 %)
    uint256 public constant FEE_BPS = 200;

    /// @dev Dénominateur BPS
    uint256 public constant BPS = 10_000;

    /// @dev Plafond first buy : 10 % du GRAD_THRESHOLD
    uint256 public constant MAX_FIRST_BUY = GRAD_THRESHOLD / 10; // 480 unités

    /// @dev Adresse dead pour burn LP
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    // ─── État ────────────────────────────────────────────────────────────

    IERC20  public quoteAsset;   // xNVDA, xTSLA, xMSTR, ou USDC
    IERC20  public token;
    address public creator;
    address public treasury;
    address public uniswapRouter;
    address public uniswapFactory;

    /// @notice Réserve quote courante (virtual + real), 6 dec
    uint256 public reserveQuote;

    /// @notice Réserve tokens courante, 18 dec
    uint256 public reserveTokens;

    /// @notice Unités quote nettes réellement levées (hors virtual), 6 dec
    uint256 public realQuoteRaised;

    /// @notice Fees créateur accumulées, 6 dec
    uint256 public creatorFeesAccrued;

    /// @notice Token gradué → buy/sell bloqués
    bool public graduated;

    /// @notice Protège initialize() des appels multiples
    bool private _initialized;

    // ─── Events ──────────────────────────────────────────────────────────

    event Trade(
        address indexed trader,
        bool    isBuy,
        uint256 quoteAmount,
        uint256 tokenAmount,
        uint256 fee,
        uint256 realQuoteRaised,
        uint256 reserveQuote,
        uint256 reserveTokens
    );

    event Graduated(address indexed pair, uint256 quoteToLP, uint256 tokensToLP);

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
     * @param token_          Adresse du meme token (OMToken)
     * @param creator_        Adresse du créateur
     * @param quoteAsset_     Quote asset ERC-20 (xNVDA, xTSLA, USDC…)
     * @param treasury_       Treasury OM (reçoit 50% des fees)
     * @param uniswapRouter_  Uniswap V2 Router sur Arc
     * @param uniswapFactory_ Uniswap V2 Factory sur Arc
     */
    function initialize(
        address token_,
        address creator_,
        address quoteAsset_,
        address treasury_,
        address uniswapRouter_,
        address uniswapFactory_
    ) external {
        require(!_initialized,            "GBC: already initialized");
        require(token_          != address(0), "GBC: zero token");
        require(creator_        != address(0), "GBC: zero creator");
        require(quoteAsset_     != address(0), "GBC: zero quote asset");
        require(treasury_       != address(0), "GBC: zero treasury");
        require(uniswapRouter_  != address(0), "GBC: zero router");
        require(uniswapFactory_ != address(0), "GBC: zero factory");

        _initialized   = true;
        token          = IERC20(token_);
        creator        = creator_;
        quoteAsset     = IERC20(quoteAsset_);
        treasury       = treasury_;
        uniswapRouter  = uniswapRouter_;
        uniswapFactory = uniswapFactory_;

        reserveQuote  = VIRTUAL_QUOTE;
        reserveTokens = CURVE_SUPPLY;
    }

    // ─── Quotes (view) ────────────────────────────────────────────────────

    /// @notice Simule un buy. Retourne les tokens nets obtenus et la fee.
    function quoteToTokens(uint256 quoteIn)
        external view
        returns (uint256 tokensOut, uint256 fee)
    {
        (tokensOut, fee,) = _quoteBuy(quoteIn);
    }

    /// @notice Simule un sell. Retourne les unités quote nettes reçues et la fee.
    function tokensToQuote(uint256 tokensIn)
        external view
        returns (uint256 quoteOut, uint256 fee)
    {
        (quoteOut, fee) = _quoteSell(tokensIn);
    }

    // ─── Buy ──────────────────────────────────────────────────────────────

    /**
     * @notice Achète des tokens avec le quoteAsset (xNVDA, USDC, etc.).
     * @param quoteIn    Montant brut de quoteAsset (6 dec) — approuver avant l'appel
     * @param minTokens  Montant minimum de tokens (slippage guard)
     * @param recipient  Adresse qui reçoit les tokens
     */
    function buy(
        uint256 quoteIn,
        uint256 minTokens,
        address recipient
    ) external nonReentrant {
        require(!graduated,              "GBC: graduated");
        require(quoteIn > 0,             "GBC: zero amount");
        require(recipient != address(0), "GBC: zero recipient");

        uint256 quoteGross = quoteIn;
        uint256 quoteRefund;

        (uint256 tokensOut, uint256 fee, uint256 quoteNet) = _quoteBuy(quoteGross);

        // Partial fill si on approche du seuil
        if (realQuoteRaised + quoteNet > GRAD_THRESHOLD) {
            uint256 netAllowed  = GRAD_THRESHOLD - realQuoteRaised;
            uint256 grossCapped = _ceilDiv(netAllowed * BPS, BPS - FEE_BPS);
            quoteRefund = quoteGross > grossCapped ? quoteGross - grossCapped : 0;
            quoteGross  = grossCapped;
            (tokensOut, fee, quoteNet) = _quoteBuy(quoteGross);
        }

        require(tokensOut >= minTokens, "GBC: slippage");

        // 1. Recevoir le quoteAsset (montant total brut)
        quoteAsset.safeTransferFrom(msg.sender, address(this), quoteIn);

        // 2. Rembourser le surplus (partial fill)
        if (quoteRefund > 0) {
            quoteAsset.safeTransfer(msg.sender, quoteRefund);
        }

        // 3. Distribuer les fees
        _distributeFees(fee);

        // 4. Mettre à jour l'état
        reserveQuote    += quoteNet;
        reserveTokens   -= tokensOut;
        realQuoteRaised += quoteNet;

        // 5. Transférer les tokens
        token.safeTransfer(recipient, tokensOut);

        emit Trade(
            msg.sender, true,
            quoteGross, tokensOut, fee,
            realQuoteRaised, reserveQuote, reserveTokens
        );

        // 6. Graduation si seuil atteint
        if (realQuoteRaised >= GRAD_THRESHOLD) {
            _graduate();
        }
    }

    // ─── Sell ─────────────────────────────────────────────────────────────

    /**
     * @notice Vend des tokens contre du quoteAsset.
     * @param tokensIn  Montant de tokens (18 dec) — approuver avant l'appel
     * @param minQuote  Montant minimum de quoteAsset attendu (slippage guard)
     * @param recipient Adresse qui reçoit le quoteAsset
     */
    function sell(
        uint256 tokensIn,
        uint256 minQuote,
        address recipient
    ) external nonReentrant {
        require(!graduated,              "GBC: graduated");
        require(tokensIn > 0,            "GBC: zero amount");
        require(recipient != address(0), "GBC: zero recipient");

        (uint256 quoteOut, uint256 fee) = _quoteSell(tokensIn);
        require(quoteOut >= minQuote, "GBC: slippage");

        uint256 newReserveQuote = reserveQuote - (quoteOut + fee);
        require(newReserveQuote >= VIRTUAL_QUOTE, "GBC: below virtual");

        // 1. Recevoir les tokens
        token.safeTransferFrom(msg.sender, address(this), tokensIn);

        // 2. Mettre à jour l'état
        reserveTokens   += tokensIn;
        reserveQuote    -= (quoteOut + fee);
        if (realQuoteRaised > 0) {
            uint256 netOut = quoteOut + fee;
            realQuoteRaised = netOut > realQuoteRaised ? 0 : realQuoteRaised - netOut;
        }

        // 3. Distribuer les fees
        _distributeFees(fee);

        // 4. Transférer le quoteAsset net
        quoteAsset.safeTransfer(recipient, quoteOut);

        emit Trade(
            msg.sender, false,
            quoteOut, tokensIn, fee,
            realQuoteRaised, reserveQuote, reserveTokens
        );
    }

    // ─── Claim fees créateur ──────────────────────────────────────────────

    function claimFees(address to) external nonReentrant {
        require(msg.sender == creator, "GBC: not creator");
        require(to != address(0),      "GBC: zero to");
        uint256 amount = creatorFeesAccrued;
        require(amount > 0,            "GBC: no fees");
        creatorFeesAccrued = 0;
        quoteAsset.safeTransfer(to, amount);
        emit FeesClaimed(to, amount);
    }

    // ─── Graduation interne ───────────────────────────────────────────────

    function _graduate() internal {
        require(!graduated, "GBC: already graduated");
        graduated = true;

        uint256 quoteForLP  = realQuoteRaised;
        uint256 tokensForLP = LP_RESERVE;

        address factory = uniswapFactory;
        address _token  = address(token);
        address _quote  = address(quoteAsset);

        if (IUniswapV2Factory(factory).getPair(_token, _quote) == address(0)) {
            IUniswapV2Factory(factory).createPair(_token, _quote);
        }
        address pair = IUniswapV2Factory(factory).getPair(_token, _quote);

        token.approve(uniswapRouter, tokensForLP);
        quoteAsset.approve(uniswapRouter, quoteForLP);

        (,, uint256 liquidity) = IUniswapV2Router02(uniswapRouter).addLiquidity(
            _token,
            _quote,
            tokensForLP,
            quoteForLP,
            0,
            0,
            DEAD,
            block.timestamp + 600
        );

        require(liquidity > 0, "GBC: no LP minted");

        emit Graduated(pair, quoteForLP, tokensForLP);
    }

    // ─── Helpers internes ─────────────────────────────────────────────────

    function _quoteBuy(uint256 quoteGross)
        internal view
        returns (uint256 tokensOut, uint256 fee, uint256 quoteNet)
    {
        fee      = quoteGross * FEE_BPS / BPS;
        quoteNet = quoteGross - fee;

        uint256 newReserveQuote  = reserveQuote + quoteNet;
        uint256 newReserveTokens = K / newReserveQuote;
        tokensOut = reserveTokens > newReserveTokens
            ? reserveTokens - newReserveTokens
            : 0;
    }

    function _quoteSell(uint256 tokensIn)
        internal view
        returns (uint256 quoteOut, uint256 fee)
    {
        uint256 newReserveTokens = reserveTokens + tokensIn;
        uint256 newReserveQuote  = K / newReserveTokens;
        uint256 quoteGross = reserveQuote > newReserveQuote
            ? reserveQuote - newReserveQuote
            : 0;

        fee      = quoteGross * FEE_BPS / BPS;
        quoteOut = quoteGross - fee;
    }

    function _distributeFees(uint256 fee) internal {
        if (fee == 0) return;
        uint256 creatorShare  = fee / 2;
        uint256 treasuryShare = fee - creatorShare;
        creatorFeesAccrued   += creatorShare;
        if (treasuryShare > 0) {
            quoteAsset.safeTransfer(treasury, treasuryShare);
        }
        emit FeesPaid(creator, creatorShare, treasury, treasuryShare);
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a + b - 1) / b;
    }

    // ─── View helpers ─────────────────────────────────────────────────────

    /// @notice Prix spot en quoteAsset (6 dec) par token (18 dec) × 1e18
    function spotPrice() external view returns (uint256) {
        return reserveQuote * 1e18 / reserveTokens;
    }

    /// @notice Market cap en quoteAsset (6 dec) basé sur supply total 1B tokens
    function marketCapQuote() external view returns (uint256) {
        return reserveQuote * 1_000_000_000 / reserveTokens;
    }

    /// @notice Progression vers graduation en BPS (0-10000)
    function graduationProgressBps() external view returns (uint256) {
        if (graduated) return BPS;
        return realQuoteRaised * BPS / GRAD_THRESHOLD;
    }
}
