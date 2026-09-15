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

/**
 * @title LaunchpadFactory
 * @notice Déploie deux types de meme tokens :
 *
 *   1. createToken()             → USDC-paired (BondingCurve, identique à avant)
 *   2. createStockPairedToken()  → Stock-paired (GenericBondingCurve, quoteAsset whitelisté)
 *
 * Les deux chemins partagent le même OMToken et le même pattern clone EIP-1167.
 */
contract LaunchpadFactory {
    using SafeERC20 for IERC20;
    using Clones for address;

    // ─── Configuration immuable ───────────────────────────────────────────

    address public immutable curveImplementation;        // BondingCurve impl (USDC)
    address public immutable genericCurveImplementation; // GenericBondingCurve impl (any quote)
    address public immutable vaultImplementation;        // V3LPVault impl (clone)
    address public immutable distributorImplementation;  // FeeDistributor impl (clone)
    address public immutable usdc;
    address public immutable treasury;
    address public immutable whitelistRegistry;

    /// @dev Plafond first buy = 10 % du GRAD_THRESHOLD (480 unités, 6 dec)
    uint256 public constant MAX_FIRST_BUY = 480_000_000;

    // ─── Stockage ────────────────────────────────────────────────────────

    /// @notice Toutes les courbes (USDC + stock-paired) dans l'ordre de création
    address[] public allCurves;

    /// @notice true si l'adresse est un clone déployé par cette factory
    mapping(address => bool) public isCurve;

    /// @notice Pour les stock-paired : quote asset utilisé par la courbe
    mapping(address => address) public curveQuoteAsset;

    /// @notice V3LPVault associé à chaque courbe
    mapping(address => address) public curveVault;

    /// @notice FeeDistributor associé à chaque courbe (address(0) si pas de holder rewards)
    mapping(address => address) public curveDistributor;

    // ─── Events ──────────────────────────────────────────────────────────

    event TokenCreated(
        address indexed curve,
        address indexed token,
        address indexed creator,
        address vault,
        address feeDistributor,   // address(0) si holderRewards = false
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

    // ─── Constructor ─────────────────────────────────────────────────────

    /**
     * @param curveImplementation_        Adresse impl BondingCurve (USDC-paired)
     * @param genericCurveImplementation_ Adresse impl GenericBondingCurve (stock-paired)
     * @param vaultImplementation_        Adresse impl V3LPVault
     * @param distributorImplementation_  Adresse impl FeeDistributor
     * @param usdc_                       USDC ERC-20 Arc (0x3600…0000, 6 dec)
     * @param treasury_                   Treasury OM
     * @param whitelistRegistry_          WhitelistRegistry des quote assets approuvés
     */
    constructor(
        address curveImplementation_,
        address genericCurveImplementation_,
        address vaultImplementation_,
        address distributorImplementation_,
        address usdc_,
        address treasury_,
        address whitelistRegistry_
    ) {
        require(curveImplementation_        != address(0), "Factory: zero impl");
        require(genericCurveImplementation_ != address(0), "Factory: zero generic impl");
        require(vaultImplementation_        != address(0), "Factory: zero vault impl");
        require(distributorImplementation_  != address(0), "Factory: zero distributor impl");
        require(usdc_                       != address(0), "Factory: zero usdc");
        require(treasury_                   != address(0), "Factory: zero treasury");
        require(whitelistRegistry_          != address(0), "Factory: zero registry");

        curveImplementation        = curveImplementation_;
        genericCurveImplementation = genericCurveImplementation_;
        vaultImplementation        = vaultImplementation_;
        distributorImplementation  = distributorImplementation_;
        usdc                       = usdc_;
        treasury                   = treasury_;
        whitelistRegistry          = whitelistRegistry_;
    }

    // ─── 1. USDC-paired (chemin existant) ────────────────────────────────

    /**
     * @notice Crée un meme token classique paired avec USDC.
     * @param holderRewards_ true → le créateur cède sa part de fees V3 aux stakers
     */
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata imageUri,
        string calldata description,
        uint256         firstBuyUsdc,
        bool            holderRewards_
    ) external returns (address curve, address token, address vault_, address distributor_) {
        require(bytes(name).length   > 0,    "Factory: empty name");
        require(bytes(symbol).length > 0,    "Factory: empty symbol");
        require(firstBuyUsdc <= MAX_FIRST_BUY, "Factory: first buy too large");

        // 1. Cloner BondingCurve
        curve = curveImplementation.clone();

        // 2. Déployer OMToken (mint intégral au clone)
        token = address(new OMToken(name, symbol, imageUri, description, curve, msg.sender));

        // 3. Déployer V3LPVault (clone)
        vault_ = vaultImplementation.clone();

        // 4. Déployer FeeDistributor si holderRewards (clone)
        if (holderRewards_) {
            distributor_ = distributorImplementation.clone();
            FeeDistributor(distributor_).initialize(token, usdc, vault_, curve);
        }

        // 5. Initialiser le vault
        V3LPVault(vault_).initialize(
            usdc,
            treasury,
            msg.sender,
            holderRewards_,
            distributor_   // address(0) si holderRewards_ = false
        );

        // 6. Initialiser la bonding curve (pointe vers le vault)
        BondingCurve(curve).initialize(
            token,
            msg.sender,
            usdc,
            treasury,
            vault_
        );

        // 7. Enregistrer
        allCurves.push(curve);
        isCurve[curve]          = true;
        curveQuoteAsset[curve]  = usdc;
        curveVault[curve]       = vault_;
        curveDistributor[curve] = distributor_;

        // 8. First buy optionnel
        if (firstBuyUsdc > 0) {
            IERC20(usdc).safeTransferFrom(msg.sender, address(this), firstBuyUsdc);
            IERC20(usdc).approve(curve, firstBuyUsdc);
            BondingCurve(curve).buy(firstBuyUsdc, 0, msg.sender);
            IERC20(usdc).approve(curve, 0);
        }

        emit TokenCreated(
            curve, token, msg.sender,
            vault_, distributor_, holderRewards_,
            name, symbol, imageUri, description, firstBuyUsdc
        );
    }

    // ─── 2. Stock-paired (nouveau chemin) ────────────────────────────────

    /**
     * @notice Crée un meme token paired avec un stock tokenisé (xNVDA, xTSLA…).
     * @param name          Nom du meme token (ex: "NvidiaFrog")
     * @param symbol        Symbole (ex: "NVFROG")
     * @param imageUri      URI de l'image
     * @param description   Description du projet
     * @param quoteAsset_   Adresse du token xStock (doit être whitelisté)
     * @param firstBuyQuote Unités de quoteAsset à acheter immédiatement (0 = désactivé, 6 dec)
     *                      Doit être approuvé sur quoteAsset_ avant l'appel si > 0.
     */
    function createStockPairedToken(
        string calldata name,
        string calldata symbol,
        string calldata imageUri,
        string calldata description,
        address         quoteAsset_,
        uint256         firstBuyQuote
    ) external returns (address curve, address token) {
        require(bytes(name).length   > 0, "Factory: empty name");
        require(bytes(symbol).length > 0, "Factory: empty symbol");
        require(firstBuyQuote <= MAX_FIRST_BUY, "Factory: first buy too large");
        require(
            WhitelistRegistry(whitelistRegistry).isWhitelisted(quoteAsset_),
            "Factory: quote asset not whitelisted"
        );

        // 1. Cloner GenericBondingCurve
        curve = genericCurveImplementation.clone();

        // 2. Déployer OMToken (mint intégral au clone)
        token = address(new OMToken(name, symbol, imageUri, description, curve, msg.sender));

        // 3. Initialiser le clone avec le quoteAsset choisi
        // NOTE: GenericBondingCurve graduation V3 — router/factory non requis sur Arc
        GenericBondingCurve(curve).initialize(
            token,
            msg.sender,
            quoteAsset_,
            treasury,
            address(0), // router — non utilisé sur Arc (graduation V3)
            address(0)  // factory — non utilisé sur Arc (graduation V3)
        );

        // 4. Enregistrer
        allCurves.push(curve);
        isCurve[curve] = true;
        curveQuoteAsset[curve] = quoteAsset_;

        // 5. First buy optionnel
        if (firstBuyQuote > 0) {
            IERC20(quoteAsset_).safeTransferFrom(msg.sender, address(this), firstBuyQuote);
            IERC20(quoteAsset_).approve(curve, firstBuyQuote);
            GenericBondingCurve(curve).buy(firstBuyQuote, 0, msg.sender);
            IERC20(quoteAsset_).approve(curve, 0);
        }

        emit StockPairedTokenCreated(
            curve, token, msg.sender, quoteAsset_,
            name, symbol, imageUri, description, firstBuyQuote
        );
    }

    // ─── View helpers ─────────────────────────────────────────────────────

    function allCurvesLength() external view returns (uint256) {
        return allCurves.length;
    }

    /**
     * @notice Retourne une page de courbes dans l'ordre chronologique inverse.
     */
    function getCurvesPaginated(uint256 offset, uint256 limit)
        external view
        returns (address[] memory result)
    {
        uint256 total = allCurves.length;
        if (offset >= total) return new address[](0);

        uint256 end   = total - offset;
        uint256 count = end < limit ? end : limit;
        result = new address[](count);

        for (uint256 i = 0; i < count; i++) {
            result[i] = allCurves[end - 1 - i];
        }
    }

    /**
     * @notice Vrai si la courbe est un GenericBondingCurve (stock-paired).
     *         Approximation : quoteAsset != usdc.
     */
    function isStockPaired(address curve) external view returns (bool) {
        return isCurve[curve] && curveQuoteAsset[curve] != usdc;
    }
}
