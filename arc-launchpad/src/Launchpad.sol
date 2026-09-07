// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Token.sol";

/// @notice Launchpad avec courbe linéaire en USDC (6 décimales) sur Arc.
/// Arc spécifique :
///   - USDC natif exposé en ERC-20 à 0x3600...0000 (6 dec)
///   - Pas de PREVRANDAO
///   - maxFeePerGas >= 20 gwei requis (hors scope contrat)
///   - Pas de transfert vers address(0)
contract Launchpad {
    // ─── Types ────────────────────────────────────────────────────────────────

    struct Launch {
        address token;     // adresse du Token.sol déployé
        address creator;   // créateur du token
        uint256 supply;    // supply totale (18 dec)
        uint256 sold;      // tokens vendus (18 dec)
        uint256 raised;    // USDC net accumulé (6 dec, après fee)
        uint256 basePrice; // prix USDC (6 dec) pour 1 token (1e18) à sold=0
        bool graduated;    // true quand GRADUATE_THRESHOLD atteint
    }

    // ─── State ────────────────────────────────────────────────────────────────

    /// @notice USDC ERC-20 sur Arc Testnet
    IERC20 public immutable usdc;

    /// @notice Fee en basis points (100 = 1 %)
    uint256 public immutable feeBps;

    /// @notice Destinataire des fees
    address public immutable feeRecipient;

    /// @notice USDC net levé pour auto-graduation (6 dec). 10 000 USDC = 10_000 * 1e6
    uint256 public constant GRADUATE_THRESHOLD = 10_000 * 1e6;

    Launch[] public launches;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Created(
        uint256 indexed id,
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        uint256 supply,
        uint256 basePrice
    );

    event Bought(
        uint256 indexed id,
        address indexed buyer,
        uint256 tokenAmount, // 18 dec
        uint256 usdcCost,    // 6 dec total payé (fee incluse)
        uint256 fee          // 6 dec
    );

    event Graduated(uint256 indexed id, uint256 raised);

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param usdc_         USDC ERC-20 (Arc: 0x3600000000000000000000000000000000000000)
    /// @param feeBps_       Fee en basis points, ex: 100 = 1 %
    /// @param feeRecipient_ Adresse qui reçoit les fees
    constructor(
        address usdc_,
        uint256 feeBps_,
        address feeRecipient_
    ) {
        require(usdc_ != address(0), "usdc=0");
        require(feeRecipient_ != address(0), "feeRecipient=0");
        require(feeBps_ <= 1000, "fee>10%");
        usdc = IERC20(usdc_);
        feeBps = feeBps_;
        feeRecipient = feeRecipient_;
    }

    // ─── Write ────────────────────────────────────────────────────────────────

    /// @notice Crée un nouveau token et une nouvelle vente.
    /// @param name       Nom du token
    /// @param symbol     Symbole du token
    /// @param supply     Supply totale en 18 décimales (ex: 1_000_000_000 * 1e18)
    /// @param basePrice  Prix USDC (6 dec) pour 1 token (1e18) à sold=0
    ///                   Exemple : 1 = 0.000001 USDC, 1_000 = 0.001 USDC
    /// @return id        Index de la vente dans launches[]
    function create(
        string calldata name,
        string calldata symbol,
        uint256 supply,
        uint256 basePrice
    ) external returns (uint256 id) {
        require(supply > 0,    "supply=0");
        require(basePrice > 0, "basePrice=0");

        Token token = new Token(name, symbol, supply, address(this));

        id = launches.length;
        launches.push(Launch({
            token:     address(token),
            creator:   msg.sender,
            supply:    supply,
            sold:      0,
            raised:    0,
            basePrice: basePrice,
            graduated: false
        }));

        emit Created(id, address(token), msg.sender, name, symbol, supply, basePrice);
    }

    /// @notice Achète `tokenAmount` tokens pour la vente `id`.
    ///         L'acheteur doit avoir approuvé ce contrat pour le montant USDC calculé.
    /// @param id          Index de la vente
    /// @param tokenAmount Nombre de tokens à acheter (18 dec)
    function buy(uint256 id, uint256 tokenAmount) external {
        require(tokenAmount > 0, "amount=0");

        Launch storage l = launches[id];
        require(!l.graduated,                      "graduated");
        require(l.sold + tokenAmount <= l.supply,  "exceeds supply");

        // ── Prix ──────────────────────────────────────────────────────────────
        // Courbe linéaire : cost = tokenAmount * basePrice * (supply + sold) / supply / 1e18
        // Numérateur = tokenAmount * basePrice * (supply + sold)
        // Diviseur   = supply * 1e18
        // Résultat en 6 décimales USDC
        uint256 cost = _cost(l, tokenAmount);
        require(cost > 0, "cost=0");

        uint256 fee = cost * feeBps / 10_000;
        uint256 net = cost - fee;

        // ── Transferts USDC ───────────────────────────────────────────────────
        require(usdc.transferFrom(msg.sender, address(this), cost), "usdc pull failed");

        if (fee > 0) {
            require(usdc.transfer(feeRecipient, fee), "fee transfer failed");
        }

        // ── Transfert tokens ──────────────────────────────────────────────────
        require(IERC20(l.token).transfer(msg.sender, tokenAmount), "token transfer failed");

        l.sold   += tokenAmount;
        l.raised += net;

        emit Bought(id, msg.sender, tokenAmount, cost, fee);

        // ── Auto-graduation ───────────────────────────────────────────────────
        if (l.raised >= GRADUATE_THRESHOLD) {
            _graduate(id, l);
        }
    }

    /// @notice Force la graduation si le seuil est atteint (appelable par n'importe qui).
    function graduate(uint256 id) external {
        Launch storage l = launches[id];
        require(!l.graduated,                       "already graduated");
        require(l.raised >= GRADUATE_THRESHOLD,     "threshold not reached");
        _graduate(id, l);
    }

    // ─── Read ─────────────────────────────────────────────────────────────────

    /// @notice Coût USDC (6 dec) pour acheter `tokenAmount` tokens dans la vente `id`.
    function getBuyCost(uint256 id, uint256 tokenAmount) external view returns (uint256) {
        return _cost(launches[id], tokenAmount);
    }

    /// @notice Nombre total de ventes créées.
    function launchCount() external view returns (uint256) {
        return launches.length;
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _cost(Launch storage l, uint256 tokenAmount) internal view returns (uint256) {
        // cost (6 dec) = tokenAmount (18 dec) * basePrice (6 dec) * (supply + sold) / supply / 1e18
        // Pour éviter overflow : on divise d'abord par supply, ensuite par 1e18
        // Ordre : (tokenAmount * basePrice / 1e18) * (supply + sold) / supply
        //       = (tokenAmount / 1e18) * basePrice * (supply + sold) / supply
        // On garde la précision maximale en faisant :
        //   num = tokenAmount * basePrice * (supply + sold)
        //   den = supply * 1e18
        // Avec supply = 1e27 (1B tokens * 1e18) et tokenAmount = 1e18, basePrice = 1 :
        //   num = 1e18 * 1 * 1e27 = 1e45
        //   den = 1e27 * 1e18     = 1e45  → cost = 1 ✓
        // uint256 peut tenir jusqu'à ~1.15e77, donc pas d'overflow dans ce cas.
        uint256 num = tokenAmount * l.basePrice * (l.supply + l.sold);
        uint256 den = l.supply * 1e18;
        uint256 c   = num / den;
        return c == 0 ? 1 : c; // minimum 1 (0.000001 USDC)
    }

    function _graduate(uint256 id, Launch storage l) internal {
        l.graduated = true;
        emit Graduated(id, l.raised);
        // Phase 1 : les USDC restent dans ce contrat.
        // Phase 2 (mainnet) : envoyer vers un pool de liquidité sur Arc.
    }
}
