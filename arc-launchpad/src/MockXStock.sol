// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockXStock
 * @notice Token ERC-20 de test représentant un stock tokenisé (xNVDA, xTSLA, xMSTR…).
 *
 * Utilisé sur Arc testnet/mainnet early en attendant que xStocks.fi
 * déploie leurs vrais tokens sur Arc.
 *
 * • 6 decimals (cohérent avec USDC et l'architecture BondingCurve existante)
 * • Mintable uniquement par le deployer (owner)
 * • Pas de pause, pas de blacklist — token de test uniquement
 *
 * Déployer une instance par stock :
 *   new MockXStock("Nvidia Stock Token", "xNVDA")
 *   new MockXStock("Tesla Stock Token",  "xTSLA")
 *   new MockXStock("MicroStrategy Stock Token", "xMSTR")
 */
contract MockXStock is ERC20 {

    address public immutable owner;
    uint8   private  immutable _decimals;

    event Minted(address indexed to, uint256 amount);

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        owner     = msg.sender;
        _decimals = 6;
    }

    /// @dev Override pour retourner 6 decimals
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint des tokens. Réservé au deployer (owner).
     * @param to     Adresse destinataire
     * @param amount Montant en unités de base (6 dec) — ex: 1_000_000 = 1 xNVDA
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "MockXStock: not owner");
        require(to != address(0),   "MockXStock: zero address");
        _mint(to, amount);
        emit Minted(to, amount);
    }
}
