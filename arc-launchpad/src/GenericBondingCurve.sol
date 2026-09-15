// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./IUniswap.sol";


contract GenericBondingCurve is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant VIRTUAL_QUOTE  = 3_200_000_000;
    uint256 public constant CURVE_SUPPLY   = 800_000_000 * 1e18;
    uint256 public constant LP_RESERVE     = 200_000_000 * 1e18;
    uint256 public constant GRAD_THRESHOLD = 4_800_000_000;
    uint256 public constant K              = VIRTUAL_QUOTE * CURVE_SUPPLY;
    uint256 public constant FEE_BPS        = 200;
    uint256 public constant BPS            = 10_000;
    uint256 public constant MAX_FIRST_BUY  = GRAD_THRESHOLD / 10;
    address public constant DEAD           = 0x000000000000000000000000000000000000dEaD;

    IERC20  public quoteAsset;
    IERC20  public token;
    address public creator;
    address public treasury;
    address public uniswapRouter;
    address public uniswapFactory;

    uint256 public reserveQuote;
    uint256 public reserveTokens;
    uint256 public realQuoteRaised;
    uint256 public creatorFeesAccrued;
    bool    public graduated;
    bool    private _initialized;

    event Trade(address indexed trader, bool isBuy, uint256 quoteAmount, uint256 tokenAmount, uint256 fee, uint256 realQuoteRaised, uint256 reserveQuote, uint256 reserveTokens);
    event Graduated(address indexed pair, uint256 quoteToLP, uint256 tokensToLP);
    event FeesPaid(address indexed creator, uint256 creatorFee, address treasury, uint256 treasuryFee);
    event FeesClaimed(address indexed to, uint256 amount);

    function initialize(address token_, address creator_, address quoteAsset_, address treasury_, address uniswapRouter_, address uniswapFactory_) external {
        require(!_initialized, "GBC: already initialized");
        require(token_ != address(0) && creator_ != address(0) && quoteAsset_ != address(0) && treasury_ != address(0) && uniswapRouter_ != address(0) && uniswapFactory_ != address(0));
        _initialized  = true;
        token         = IERC20(token_);
        creator       = creator_;
        quoteAsset    = IERC20(quoteAsset_);
        treasury      = treasury_;
        uniswapRouter = uniswapRouter_;
        uniswapFactory = uniswapFactory_;
        reserveQuote  = VIRTUAL_QUOTE;
        reserveTokens = CURVE_SUPPLY;
    }

    function quoteToTokens(uint256 quoteIn) external view returns (uint256 tokensOut, uint256 fee) {
        (tokensOut, fee,) = _quoteBuy(quoteIn);
    }
    function tokensToQuote(uint256 tokensIn) external view returns (uint256 quoteOut, uint256 fee) {
        (quoteOut, fee) = _quoteSell(tokensIn);
    }

    function buy(uint256 quoteIn, uint256 minTokens, address recipient) external nonReentrant {
        require(!graduated && quoteIn > 0 && recipient != address(0));
        uint256 quoteGross = quoteIn; uint256 quoteRefund;
        (uint256 tokensOut, uint256 fee, uint256 quoteNet) = _quoteBuy(quoteGross);
        if (realQuoteRaised + quoteNet > GRAD_THRESHOLD) {
            uint256 netAllowed = GRAD_THRESHOLD - realQuoteRaised;
            uint256 grossCapped = _ceilDiv(netAllowed * BPS, BPS - FEE_BPS);
            quoteRefund = quoteGross > grossCapped ? quoteGross - grossCapped : 0;
            quoteGross = grossCapped;
            (tokensOut, fee, quoteNet) = _quoteBuy(quoteGross);
        }
        require(tokensOut >= minTokens, "GBC: slippage");
        quoteAsset.safeTransferFrom(msg.sender, address(this), quoteIn);
        if (quoteRefund > 0) quoteAsset.safeTransfer(msg.sender, quoteRefund);
        _distributeFees(fee);
        reserveQuote    += quoteNet;
        reserveTokens   -= tokensOut;
        realQuoteRaised += quoteNet;
        token.safeTransfer(recipient, tokensOut);
        emit Trade(msg.sender, true, quoteGross, tokensOut, fee, realQuoteRaised, reserveQuote, reserveTokens);
        if (realQuoteRaised >= GRAD_THRESHOLD) _graduate();
    }

    function sell(uint256 tokensIn, uint256 minQuote, address recipient) external nonReentrant {
        require(!graduated && tokensIn > 0 && recipient != address(0));
        (uint256 quoteOut, uint256 fee) = _quoteSell(tokensIn);
        require(quoteOut >= minQuote, "GBC: slippage");
        require(reserveQuote - (quoteOut + fee) >= VIRTUAL_QUOTE, "GBC: below virtual");
        token.safeTransferFrom(msg.sender, address(this), tokensIn);
        reserveTokens   += tokensIn;
        reserveQuote    -= (quoteOut + fee);
        uint256 netOut = quoteOut + fee;
        realQuoteRaised = netOut > realQuoteRaised ? 0 : realQuoteRaised - netOut;
        _distributeFees(fee);
        quoteAsset.safeTransfer(recipient, quoteOut);
        emit Trade(msg.sender, false, quoteOut, tokensIn, fee, realQuoteRaised, reserveQuote, reserveTokens);
    }

    function claimFees(address to) external nonReentrant {
        require(msg.sender == creator && to != address(0));
        uint256 amount = creatorFeesAccrued;
        require(amount > 0, "GBC: no fees");
        creatorFeesAccrued = 0;
        quoteAsset.safeTransfer(to, amount);
        emit FeesClaimed(to, amount);
    }

    function _graduate() internal {
        require(!graduated); graduated = true;
        uint256 quoteForLP = realQuoteRaised; uint256 tokensForLP = LP_RESERVE;
        address _token = address(token); address _quote = address(quoteAsset);
        if (IUniswapV2Factory(uniswapFactory).getPair(_token, _quote) == address(0))
            IUniswapV2Factory(uniswapFactory).createPair(_token, _quote);
        address pair = IUniswapV2Factory(uniswapFactory).getPair(_token, _quote);
        token.approve(uniswapRouter, tokensForLP);
        quoteAsset.approve(uniswapRouter, quoteForLP);
        (,, uint256 liq) = IUniswapV2Router02(uniswapRouter).addLiquidity(_token, _quote, tokensForLP, quoteForLP, 0, 0, DEAD, block.timestamp + 600);
        require(liq > 0, "GBC: no LP");
        emit Graduated(pair, quoteForLP, tokensForLP);
    }

    function _quoteBuy(uint256 quoteGross) internal view returns (uint256 tokensOut, uint256 fee, uint256 quoteNet) {
        fee = quoteGross * FEE_BPS / BPS; quoteNet = quoteGross - fee;
        uint256 newReserveQuote = reserveQuote + quoteNet;
        uint256 newReserveTokens = K / newReserveQuote;
        tokensOut = reserveTokens > newReserveTokens ? reserveTokens - newReserveTokens : 0;
    }
    function _quoteSell(uint256 tokensIn) internal view returns (uint256 quoteOut, uint256 fee) {
        uint256 newReserveTokens = reserveTokens + tokensIn;
        uint256 newReserveQuote = K / newReserveTokens;
        uint256 quoteGross = reserveQuote > newReserveQuote ? reserveQuote - newReserveQuote : 0;
        fee = quoteGross * FEE_BPS / BPS; quoteOut = quoteGross - fee;
    }
    function _distributeFees(uint256 fee) internal {
        if (fee == 0) return;
        uint256 creatorShare = fee / 2; uint256 treasuryShare = fee - creatorShare;
        creatorFeesAccrued += creatorShare;
        if (treasuryShare > 0) quoteAsset.safeTransfer(treasury, treasuryShare);
        emit FeesPaid(creator, creatorShare, treasury, treasuryShare);
    }
    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) { return (a + b - 1) / b; }

    function spotPrice() external view returns (uint256) { return reserveQuote * 1e18 / reserveTokens; }
    function marketCapQuote() external view returns (uint256) { return reserveQuote * 1_000_000_000 / reserveTokens; }
    function graduationProgressBps() external view returns (uint256) { if (graduated) return BPS; return realQuoteRaised * BPS / GRAD_THRESHOLD; }
    function realUsdcRaised() external view returns (uint256) { return realQuoteRaised; }
}
