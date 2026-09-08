// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title OMToken
 * @notice Token ERC-20 à supply fixe, minté intégralement au BondingCurve au déploiement.
 *         Aucune fonction de mint externe : le supply est définitif à la création.
 *         L'adresse `curve` est stockée pour permettre aux frontends de vérifier l'origine.
 */
contract OMToken is ERC20 {
    // ─── Immutables ─────────────────────────────────────────────────────────
    address public immutable curve;
    address public immutable creator;
    string  public imageUri;
    string  public description;

    // Supply total : 1 000 000 000 tokens × 10^18
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18;

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(
        string memory name_,
        string memory symbol_,
        string memory imageUri_,
        string memory description_,
        address curve_,
        address creator_
    ) ERC20(name_, symbol_) {
        require(curve_    != address(0), "OMToken: zero curve");
        require(creator_  != address(0), "OMToken: zero creator");

        curve       = curve_;
        creator     = creator_;
        imageUri    = imageUri_;
        description = description_;

        // Mint intégral au BondingCurve — aucun mint possible par la suite
        _mint(curve_, TOTAL_SUPPLY);
    }
}
