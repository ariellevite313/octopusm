// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./BondingCurve.sol";
import "./GenericBondingCurve.sol";
import "./V3LPVault.sol";
import "./FeeDistributor.sol";
import "./OMToken.sol";
import "./WhitelistRegistry.sol";

contract LaunchpadFactory {
    using SafeERC20 for IERC20;
    using Clones for address;

    address public immutable curveImplementation;
    address public immutable genericCurveImplementation;
    address public immutable vaultImplementation;
    address public immutable distributorImplementation;
    address public immutable usdc;
    address public immutable treasury;
    address public immutable whitelistRegistry;

    uint256 public constant MAX_FIRST_BUY = 480_000_000;

    address[] public allCurves;
    mapping(address => bool)    public isCurve;
    mapping(address => address) public curveQuoteAsset;
    mapping(address => address) public curveVault;       // curve → V3LPVault
    mapping(address => address) public curveDistributor; // curve → FeeDistributor

    event TokenCreated(
        address indexed curve,
        address indexed token,
        address indexed creator,
        address vault,
        address feeDistributor,
        bool    holderRewards,
        string  name,
        string  symbol,
        string  imageUri,
        string  description,
        uint256 firstBuyUsdc
    );
    event StockPairedTokenCreated(
        address indexed curve,
        address indexed token,
        address indexed creator,
        address quoteAsset,
        string  name,
        string  symbol,
        string  imageUri,
        string  description,
        uint256 firstBuyQuote
    );

    constructor(
        address curveImplementation_,
        address genericCurveImplementation_,
        address vaultImplementation_,
        address distributorImplementation_,
        address usdc_,
        address treasury_,
        address whitelistRegistry_
    ) {
        require(
            curveImplementation_        != address(0) &&
            genericCurveImplementation_ != address(0) &&
            vaultImplementation_        != address(0) &&
            distributorImplementation_  != address(0) &&
            usdc_                       != address(0) &&
            treasury_                   != address(0) &&
            whitelistRegistry_          != address(0),
            "Factory: zero address"
        );
        curveImplementation        = curveImplementation_;
        genericCurveImplementation = genericCurveImplementation_;
        vaultImplementation        = vaultImplementation_;
        distributorImplementation  = distributorImplementation_;
        usdc                       = usdc_;
        treasury                   = treasury_;
        whitelistRegistry          = whitelistRegistry_;
    }

    /**
     * @notice Crée un token OM avec bonding curve USDC + vault V3.
     * @param holderRewards_ true → la part creator des fees V3 va au FeeDistributor
     */
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata imageUri,
        string calldata description,
        uint256 firstBuyUsdc,
        bool holderRewards_
    ) external returns (address curve, address token, address vault_, address distributor_) {
        require(bytes(name).length > 0 && bytes(symbol).length > 0, "Factory: empty name/symbol");
        require(firstBuyUsdc <= MAX_FIRST_BUY, "Factory: first buy too large");

        // Clone tous les contrats d'abord (order matters: vault → distributor → curve → token)
        vault_       = vaultImplementation.clone();
        curve        = curveImplementation.clone();
        token        = address(new OMToken(name, symbol, imageUri, description, curve, msg.sender, address(0)));

        // Distributor uniquement si holderRewards_ = true
        if (holderRewards_) {
            distributor_ = distributorImplementation.clone();
            FeeDistributor(distributor_).initialize(token, usdc, vault_, curve);
        }
        // else: distributor_ reste address(0) (valeur par défaut des return vars)

        // Initialize vault
        V3LPVault(vault_).initialize(
            usdc,
            treasury,
            msg.sender,
            holderRewards_,
            distributor_   // address(0) si pas de holderRewards
        );

        // Initialize bonding curve avec référence au vault
        BondingCurve(curve).initialize(token, msg.sender, usdc, treasury, vault_);

        allCurves.push(curve);
        isCurve[curve]           = true;
        curveQuoteAsset[curve]   = usdc;
        curveVault[curve]       = vault_;
        curveDistributor[curve] = distributor_; // address(0) si holderRewards_=false

        if (firstBuyUsdc > 0) {
            IERC20(usdc).safeTransferFrom(msg.sender, address(this), firstBuyUsdc);
            IERC20(usdc).approve(curve, firstBuyUsdc);
            BondingCurve(curve).buy(firstBuyUsdc, 0, msg.sender);
            IERC20(usdc).approve(curve, 0);
        }

        emit TokenCreated(curve, token, msg.sender, vault_, distributor_, holderRewards_, name, symbol, imageUri, description, firstBuyUsdc);
    }

    /**
     * @notice Crée un token xStock (quote asset != USDC).
     *         Le router/factory V3 n'est pas utilisé sur Arc → address(0).
     */
    function createStockPairedToken(
        string calldata name,
        string calldata symbol,
        string calldata imageUri,
        string calldata description,
        address quoteAsset_,
        uint256 firstBuyQuote
    ) external returns (address curve, address token) {
        require(bytes(name).length > 0 && bytes(symbol).length > 0, "Factory: empty name/symbol");
        require(firstBuyQuote <= MAX_FIRST_BUY, "Factory: first buy too large");
        require(WhitelistRegistry(whitelistRegistry).isWhitelisted(quoteAsset_), "Factory: quote asset not whitelisted");

        curve = genericCurveImplementation.clone();
        token = address(new OMToken(name, symbol, imageUri, description, curve, msg.sender, address(0)));

        GenericBondingCurve(curve).initialize(
            token, msg.sender, quoteAsset_, treasury,
            address(0), // router — non utilisé sur Arc (graduation V3)
            address(0)  // factory — non utilisé sur Arc (graduation V3)
        );

        allCurves.push(curve);
        isCurve[curve] = true;
        curveQuoteAsset[curve] = quoteAsset_;

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
