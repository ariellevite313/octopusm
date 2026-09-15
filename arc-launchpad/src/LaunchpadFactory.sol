// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./BondingCurve.sol";
import "./GenericBondingCurve.sol";
import "./OMToken.sol";
import "./WhitelistRegistry.sol";

contract LaunchpadFactory {
    using SafeERC20 for IERC20;
    using Clones for address;

    address public immutable curveImplementation;
    address public immutable genericCurveImplementation;
    address public immutable usdc;
    address public immutable treasury;
    address public immutable uniswapRouter;
    address public immutable uniswapFactory;
    address public immutable whitelistRegistry;

    uint256 public constant MAX_FIRST_BUY = 480_000_000;

    address[] public allCurves;
    mapping(address => bool)    public isCurve;
    mapping(address => address) public curveQuoteAsset;

    event TokenCreated(address indexed curve, address indexed token, address indexed creator, string name, string symbol, string imageUri, string description, uint256 firstBuyUsdc);
    event StockPairedTokenCreated(address indexed curve, address indexed token, address indexed creator, address quoteAsset, string name, string symbol, string imageUri, string description, uint256 firstBuyQuote);

    constructor(
        address curveImplementation_,
        address genericCurveImplementation_,
        address usdc_,
        address treasury_,
        address uniswapRouter_,
        address uniswapFactory_,
        address whitelistRegistry_
    ) {
        require(curveImplementation_ != address(0) && genericCurveImplementation_ != address(0) && usdc_ != address(0) && treasury_ != address(0) && uniswapRouter_ != address(0) && uniswapFactory_ != address(0) && whitelistRegistry_ != address(0));
        curveImplementation        = curveImplementation_;
        genericCurveImplementation = genericCurveImplementation_;
        usdc                       = usdc_;
        treasury                   = treasury_;
        uniswapRouter              = uniswapRouter_;
        uniswapFactory             = uniswapFactory_;
        whitelistRegistry          = whitelistRegistry_;
    }

    function createToken(string calldata name, string calldata symbol, string calldata imageUri, string calldata description, uint256 firstBuyUsdc) external returns (address curve, address token) {
        require(bytes(name).length > 0 && bytes(symbol).length > 0);
        require(firstBuyUsdc <= MAX_FIRST_BUY, "Factory: first buy too large");
        curve = curveImplementation.clone();
        token = address(new OMToken(name, symbol, imageUri, description, curve, msg.sender));
        BondingCurve(curve).initialize(token, msg.sender, usdc, treasury, uniswapRouter, uniswapFactory);
        allCurves.push(curve); isCurve[curve] = true; curveQuoteAsset[curve] = usdc;
        if (firstBuyUsdc > 0) {
            IERC20(usdc).safeTransferFrom(msg.sender, address(this), firstBuyUsdc);
            IERC20(usdc).approve(curve, firstBuyUsdc);
            BondingCurve(curve).buy(firstBuyUsdc, 0, msg.sender);
            IERC20(usdc).approve(curve, 0);
        }
        emit TokenCreated(curve, token, msg.sender, name, symbol, imageUri, description, firstBuyUsdc);
    }

    function createStockPairedToken(string calldata name, string calldata symbol, string calldata imageUri, string calldata description, address quoteAsset_, uint256 firstBuyQuote) external returns (address curve, address token) {
        require(bytes(name).length > 0 && bytes(symbol).length > 0);
        require(firstBuyQuote <= MAX_FIRST_BUY, "Factory: first buy too large");
        require(WhitelistRegistry(whitelistRegistry).isWhitelisted(quoteAsset_), "Factory: quote asset not whitelisted");
        curve = genericCurveImplementation.clone();
        token = address(new OMToken(name, symbol, imageUri, description, curve, msg.sender));
        GenericBondingCurve(curve).initialize(token, msg.sender, quoteAsset_, treasury, uniswapRouter, uniswapFactory);
        allCurves.push(curve); isCurve[curve] = true; curveQuoteAsset[curve] = quoteAsset_;
        if (firstBuyQuote > 0) {
            IERC20(quoteAsset_).safeTransferFrom(msg.sender, address(this), firstBuyQuote);
            IERC20(quoteAsset_).approve(curve, firstBuyQuote);
            GenericBondingCurve(curve).buy(firstBuyQuote, 0, msg.sender);
            IERC20(quoteAsset_).approve(curve, 0);
        }
        emit StockPairedTokenCreated(curve, token, msg.sender, quoteAsset_, name, symbol, imageUri, description, firstBuyQuote);
    }

    function allCurvesLength() external view returns (uint256) { return allCurves.length; }
    function isStockPaired(address curve) external view returns (bool) { return isCurve[curve] && curveQuoteAsset[curve] != usdc; }
    function getCurvesPaginated(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        uint256 total = allCurves.length;
        if (offset >= total) return new address[](0);
        uint256 end = total - offset; uint256 count = end < limit ? end : limit;
        result = new address[](count);
        for (uint256 i = 0; i < count; i++) result[i] = allCurves[end - 1 - i];
    }
}
