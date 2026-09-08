// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./BondingCurve.sol";
import "./OMToken.sol";

/**
 * @title LaunchpadFactory
 * @notice Déploie des paires (BondingCurve clone + OMToken) via EIP-1167.
 *
 * Flow createToken :
 *   1. Clone l'implémentation BondingCurve
 *   2. Déploie OMToken (minte au clone)
 *   3. Initialise le clone (references usdc, treasury, router, factory)
 *   4. Si firstBuyUsdc > 0 : transfère l'USDC de l'appelant → this → approve → BondingCurve.buy
 *   5. Émet TokenCreated
 */
contract LaunchpadFactory {
    using SafeERC20 for IERC20;
    using Clones for address;

    // ─── Configuration immuable ───────────────────────────────────────────

    address public immutable curveImplementation;
    address public immutable usdc;
    address public immutable treasury;
    address public immutable uniswapRouter;
    address public immutable uniswapFactory;

    /// @dev Plafond first buy (= BondingCurve.MAX_FIRST_BUY = 10 % de GRAD_THRESHOLD)
    uint256 public constant MAX_FIRST_BUY = 480_000_000; // 480 USDC (6 dec)

    // ─── Stockage des tokens créés ────────────────────────────────────────

    /// @notice Tous les tokens dans l'ordre de création
    address[] public allCurves;

    /// @notice Vrai ssi l'adresse est un clone déployé par cette factory
    mapping(address => bool) public isCurve;

    // ─── Events ──────────────────────────────────────────────────────────

    event TokenCreated(
        address indexed curve,
        address indexed token,
        address indexed creator,
        string  name,
        string  symbol,
        string  imageUri,
        string  description,
        uint256 firstBuyUsdc
    );

    // ─── Constructor ─────────────────────────────────────────────────────

    /**
     * @param curveImplementation_ Adresse de l'implémentation BondingCurve (pas un clone)
     * @param usdc_                USDC ERC-20 sur Arc (0x3600...0000, 6 dec)
     * @param treasury_            Adresse OM treasury qui reçoit 50 % des fees
     * @param uniswapRouter_       Uniswap V2 Router sur Arc testnet
     * @param uniswapFactory_      Uniswap V2 Factory sur Arc testnet
     */
    constructor(
        address curveImplementation_,
        address usdc_,
        address treasury_,
        address uniswapRouter_,
        address uniswapFactory_
    ) {
        require(curveImplementation_ != address(0), "Factory: zero impl");
        require(usdc_                != address(0), "Factory: zero usdc");
        require(treasury_            != address(0), "Factory: zero treasury");
        require(uniswapRouter_       != address(0), "Factory: zero router");
        require(uniswapFactory_      != address(0), "Factory: zero factory");

        curveImplementation = curveImplementation_;
        usdc                = usdc_;
        treasury            = treasury_;
        uniswapRouter       = uniswapRouter_;
        uniswapFactory      = uniswapFactory_;
    }

    // ─── Fonction principale ──────────────────────────────────────────────

    /**
     * @notice Crée un nouveau token avec sa courbe de bonding.
     * @param name          Nom du token
     * @param symbol        Symbole du token
     * @param imageUri      URI de l'image (IPFS ou HTTPS)
     * @param description   Description du projet
     * @param firstBuyUsdc  USDC bruts à acheter immédiatement (0 = désactivé). 6 dec.
     *                      Doit être approuvé sur USDC avant l'appel si > 0.
     * @return curve  Adresse du clone BondingCurve
     * @return token  Adresse du OMToken
     */
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata imageUri,
        string calldata description,
        uint256         firstBuyUsdc
    ) external returns (address curve, address token) {
        require(bytes(name).length   > 0, "Factory: empty name");
        require(bytes(symbol).length > 0, "Factory: empty symbol");
        require(firstBuyUsdc <= MAX_FIRST_BUY, "Factory: first buy too large");

        // 1. Cloner l'implémentation BondingCurve
        curve = curveImplementation.clone();

        // 2. Déployer le token (mint intégral au clone)
        token = address(new OMToken(
            name,
            symbol,
            imageUri,
            description,
            curve,
            msg.sender
        ));

        // 3. Initialiser le clone
        BondingCurve(curve).initialize(
            token,
            msg.sender,
            usdc,
            treasury,
            uniswapRouter,
            uniswapFactory
        );

        // 4. Enregistrer
        allCurves.push(curve);
        isCurve[curve] = true;

        // 5. First buy optionnel
        if (firstBuyUsdc > 0) {
            // Transférer les USDC du créateur vers la factory
            IERC20(usdc).safeTransferFrom(msg.sender, address(this), firstBuyUsdc);
            // Approuver le clone
            IERC20(usdc).approve(curve, firstBuyUsdc);
            // Exécuter le buy — les tokens vont directement au créateur
            BondingCurve(curve).buy(firstBuyUsdc, 0, msg.sender);
            // Réinitialiser l'allowance par sécurité
            IERC20(usdc).approve(curve, 0);
        }

        emit TokenCreated(
            curve,
            token,
            msg.sender,
            name,
            symbol,
            imageUri,
            description,
            firstBuyUsdc
        );
    }

    // ─── View helpers ─────────────────────────────────────────────────────

    /// @notice Nombre total de tokens créés
    function allCurvesLength() external view returns (uint256) {
        return allCurves.length;
    }

    /**
     * @notice Retourne une page de courbes dans l'ordre chronologique inverse.
     * @param offset  Index de départ (0 = plus récent)
     * @param limit   Nombre maximum d'éléments
     */
    function getCurvesPaginated(uint256 offset, uint256 limit)
        external view
        returns (address[] memory result)
    {
        uint256 total = allCurves.length;
        if (offset >= total) return new address[](0);

        uint256 end = total - offset;
        uint256 count = end < limit ? end : limit;
        result = new address[](count);

        for (uint256 i = 0; i < count; i++) {
            result[i] = allCurves[end - 1 - i];
        }
    }
}
