// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./OMToken.sol";
import "./BondingCurveArcV2.sol";
import "./GraduationVaultV4.sol";

/**
 * @title LaunchpadFactoryArcV2
 * @notice Factory pour créer des meme tokens sur Arc avec :
 *   • Bonding curve standalone (pre-graduation) — invisible sur DEX aggregators
 *   • Pool V4 standard à la graduation (fee=2500, spacing=25, hook=0x0) — indexé immédiatement
 *
 * Chaque createToken() déploie :
 *   1. OMToken (ERC-20 18 dec, supply 1B)
 *   2. BondingCurveArcV2 (clone EIP-1167) — gère buy/sell pre-graduation
 *   3. GraduationVaultV4 (clone EIP-1167) — crée le pool V4 à la graduation
 *
 * Fee de création : 10 USDC natif (msg.value) → treasury.
 */
contract LaunchpadFactoryArcV2 {
    using Clones for address;

    // ─── Immutables ───────────────────────────────────────────────────────────

    address public immutable curveImplementation;
    address public immutable vaultImplementation;
    address public immutable treasury;

    uint256 public constant CREATION_FEE = 10 ether; // 10 USDC natif Arc

    // ─── État ─────────────────────────────────────────────────────────────────

    address[] public allCurves;

    struct TokenRecord {
        address token;
        address curve;
        address vault;
        address creator;
        bool    graduated;
    }

    mapping(address => TokenRecord) public curveRecord; // curve → record
    mapping(address => bool)        public isCurve;

    // ─── Events ───────────────────────────────────────────────────────────────

    event TokenLaunched(
        address indexed curve,
        address indexed token,
        address indexed creator,
        address vault,
        string  name,
        string  symbol,
        string  imageUri,
        string  description,
        uint256 firstBuyUsdc
    );

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(
        address curveImpl_,
        address vaultImpl_,
        address treasury_
    ) {
        require(curveImpl_  != address(0), "Factory: zero curve impl");
        require(vaultImpl_  != address(0), "Factory: zero vault impl");
        require(treasury_   != address(0), "Factory: zero treasury");
        curveImplementation = curveImpl_;
        vaultImplementation = vaultImpl_;
        treasury            = treasury_;
    }

    // ─── createToken ──────────────────────────────────────────────────────────

    /**
     * @notice Crée un nouveau meme token sur la bonding curve Arc V2.
     *
     * @param name        Nom du token
     * @param symbol      Symbole (ticker)
     * @param imageUri    URL de l'image (IPFS recommandé)
     * @param description Description courte
     * @param firstBuyUsdc USDC natif pour le premier achat (0 = pas de premier achat).
     *                    Doit être inclus dans msg.value en plus de la CREATION_FEE.
     */
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata imageUri,
        string calldata description,
        uint256         firstBuyUsdc
    ) external payable returns (address curve, address token_, address vault) {
        require(bytes(name).length > 0 && bytes(symbol).length > 0, "Factory: empty name/symbol");
        require(msg.value >= CREATION_FEE + firstBuyUsdc, "Factory: insufficient value");

        // Fee de création → treasury
        _safeTransferETH(treasury, CREATION_FEE);

        // ── 1. Deploy GraduationVaultV4 (clone) ───────────────────────────────
        vault = vaultImplementation.clone();

        // ── 2. Deploy BondingCurveArcV2 (clone) ──────────────────────────────
        curve = curveImplementation.clone();

        // ── 3. Deploy OMToken (1B supply → tout à la curve) ──────────────────
        token_ = address(new OMToken(
            name,
            symbol,
            imageUri,
            description,
            curve,        // bondingCurve — reçoit le supply initial
            msg.sender,   // creator
            treasury      // platform = treasury (require(platform != 0) dans OMToken)
        ));

        // ── 4. Initialize vault ───────────────────────────────────────────────
        GraduationVaultV4(payable(vault)).initialize(
            curve,
            token_,
            msg.sender,
            treasury
        );

        // ── 5. Initialize bonding curve ───────────────────────────────────────
        BondingCurveArcV2(payable(curve)).initialize(
            token_,
            msg.sender,
            treasury,
            vault
        );

        // ── 6. Enregistrer ───────────────────────────────────────────────────
        allCurves.push(curve);
        isCurve[curve] = true;
        curveRecord[curve] = TokenRecord({
            token:     token_,
            curve:     curve,
            vault:     vault,
            creator:   msg.sender,
            graduated: false
        });

        emit TokenLaunched(curve, token_, msg.sender, vault, name, symbol, imageUri, description, firstBuyUsdc);

        // ── 7. Premier achat optionnel ────────────────────────────────────────
        if (firstBuyUsdc > 0) {
            BondingCurveArcV2(payable(curve)).buy{value: firstBuyUsdc}(0);
        }

        // ── 8. Rembourser l'excédent ──────────────────────────────────────────
        uint256 spent = CREATION_FEE + firstBuyUsdc;
        if (msg.value > spent) {
            _safeTransferETH(msg.sender, msg.value - spent);
        }
    }

    // ─── View ─────────────────────────────────────────────────────────────────

    function allCurvesLength() external view returns (uint256) {
        return allCurves.length;
    }

    function getCurvesPaginated(uint256 offset, uint256 limit)
        external view
        returns (address[] memory result)
    {
        uint256 total = allCurves.length;
        if (offset >= total) return new address[](0);
        uint256 end   = total - offset;
        uint256 count = end < limit ? end : limit;
        result = new address[](count);
        for (uint256 i = 0; i < count; i++) result[i] = allCurves[end - 1 - i];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _safeTransferETH(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = payable(to).call{value: amount}("");
        require(ok, "Factory: ETH transfer failed");
    }

    receive() external payable {}
}
