// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title OMToken
 * @notice Token ERC-20 à supply fixe avec système de dividendes holders pull-based.
 *
 * Dividendes (USDC natif Arc) :
 *  - Alimentés uniquement par le BondingCurveHook via addDividend()
 *  - Distribution O(1) via accPerShare (pattern MasterChef)
 *  - Pull-based : chaque holder claim manuellement via claimDividend()
 *  - Auto-settle sur transfer uniquement pour "from" (actif) — "to" conserve son pending intact
 *  - Fees non-claimées depuis > 2 ans : sweepables par le wallet platform
 *
 * Règles immuables :
 *  - hook     : immutable — seul addDividend() autorisé
 *  - platform : immutable — seul sweepAbandoned() autorisé
 *  - Aucun mint après deploy — supply fixe à TOTAL_SUPPLY
 *  - Pas de fee-on-transfer — taxe uniquement dans le hook au niveau du swap
 *  - Le timer d'inactivité ne reset que sur action active du holder (from == holder)
 *    → recevoir passivement des tokens ne réinitialise PAS le timer
 */
contract OMToken is ERC20 {

    // ─── Immutables ─────────────────────────────────────────────────────────

    /// @notice BondingCurveArcV2 — autorisé à appeler addDividend() (bonding curve)
    address public immutable hook;
    /// @notice GraduationVaultV4 — autorisé à appeler addDividend() (post-graduation)
    address public immutable vault;

    /// @notice Wallet OMdotfun — seul autorisé à sweepAbandoned()
    address public immutable platform;

    /// @notice Wallet créateur du token
    address public immutable creator;

    string  public imageUri;
    string  public description;

    // ─── Constantes ─────────────────────────────────────────────────────────

    uint256 public constant TOTAL_SUPPLY  = 1_000_000_000 * 1e18;
    uint256 public constant PREC          = 1e18;
    uint256 public constant DUST          = 1e12;       // ~0.000001 USDC — seuil minimum claim
    uint256 public constant ABANDON_DELAY = 730 days;   // 2 ans

    // ─── Dividendes holders ─────────────────────────────────────────────────

    /// @dev USDC cumulé par token × PREC (augmente à chaque addDividend)
    uint256 public accPerShare;

    /// @dev Dette comptable par holder — rewardDebt[h] = balance[h] × accPerShare / PREC au dernier settle
    mapping(address => uint256) public rewardDebt;

    /// @dev Timestamp de la dernière action ACTIVE du holder (vente, transfer out, claim)
    ///      Mis à jour uniquement quand from == holder — PAS quand il reçoit passivement
    ///      Initialisé à block.timestamp au premier mint (via _update from == address(0))
    mapping(address => uint256) public lastInteraction;

    /// @dev USDC physique détenu dans ce contrat pour les dividendes
    uint256 public dividendReserve;

    // ─── Events ─────────────────────────────────────────────────────────────

    event DividendAdded(uint256 amount, uint256 newAccPerShare);
    event DividendClaimed(address indexed holder, uint256 amount);
    event AbandonedSwept(address indexed holder, uint256 amount);

    // ─── Constructor ─────────────────────────────────────────────────────────

    /**
     * @param name_       Nom du token
     * @param symbol_     Symbole
     * @param imageUri_   URI de l'image
     * @param description_ Description
     * @param hook_       BondingCurveArcV2 — reçoit le supply total au mint
     * @param vault_      GraduationVaultV4 — autorisé à appeler addDividend post-graduation
     * @param creator_    Wallet créateur
     * @param platform_   Wallet OMdotfun — pour sweepAbandoned
     */
    constructor(
        string memory name_,
        string memory symbol_,
        string memory imageUri_,
        string memory description_,
        address hook_,
        address vault_,
        address creator_,
        address platform_
    ) ERC20(name_, symbol_) {
        require(hook_     != address(0), "OMToken: zero hook");
        require(vault_    != address(0), "OMToken: zero vault");
        require(creator_  != address(0), "OMToken: zero creator");
        require(platform_ != address(0), "OMToken: zero platform");

        hook        = hook_;
        vault       = vault_;
        creator     = creator_;
        platform    = platform_;
        imageUri    = imageUri_;
        description = description_;

        // Mint intégral au hook — aucun mint possible par la suite
        _mint(hook_, TOTAL_SUPPLY);
    }

    /// @notice Reçoit le USDC natif Arc (ETH) envoyé par le hook pour les dividendes.
    receive() external payable {}

    // ─── Dividendes — alimentation ───────────────────────────────────────────

    /**
     * @notice Appelé par le hook à chaque swap pour alimenter les dividendes holders.
     *         msg.value = USDC natif (ETH Arc) à distribuer.
     * @dev    Seul le hook peut appeler cette fonction.
     *         Si le supply est nul ou msg.value == 0, no-op silencieux.
     */
    function addDividend() external payable {
        require(msg.sender == hook || msg.sender == vault, "OMToken: not authorized");
        if (msg.value == 0) return;
        // Supply circulante uniquement : exclure les tokens encore détenus par le hook (bonding curve).
        // Le hook mint→détient la totalité au lancement et vend progressivement.
        // Utiliser totalSupply() distribuerait ~100% aux tokens non-circulants → dividendes quasi-nuls pour les vrais holders.
        uint256 circulating = totalSupply() - balanceOf(hook);
        if (circulating == 0) return;
        accPerShare      += msg.value * PREC / circulating;
        dividendReserve  += msg.value;
        emit DividendAdded(msg.value, accPerShare);
    }

    // ─── Dividendes — lecture ────────────────────────────────────────────────

    /**
     * @notice Dividende en attente pour un holder (en USDC natif, 18 dec).
     */
    function pendingDividend(address holder) public view returns (uint256) {
        uint256 gross = balanceOf(holder) * accPerShare / PREC;
        return gross > rewardDebt[holder] ? gross - rewardDebt[holder] : 0;
    }

    // ─── Dividendes — claim ──────────────────────────────────────────────────

    /**
     * @notice Claim les dividendes de msg.sender.
     *         Personne d'autre ne peut claim à la place du holder.
     */
    function claimDividend() external {
        // Action active : reset le timer d'inactivité
        lastInteraction[msg.sender] = block.timestamp;
        _settleDividend(msg.sender);
    }

    // ─── Dividendes — sweep abandoned ───────────────────────────────────────

    /**
     * @notice Sweep les dividendes non-claimés depuis > 2 ans vers le wallet platform.
     *         Seul le wallet platform peut appeler cette fonction.
     *
     * Règle du timer :
     *  - Seule une action active (vente, transfer out, claim) reset le timer
     *  - Recevoir passivement des tokens (quelqu'un envoie vers ce wallet) ne reset PAS
     *  - Si lastInteraction[h] == 0 : jamais eu d'action active → considéré inactif depuis le deploy
     *
     * @param holders Liste des adresses à sweeper
     */
    function sweepAbandoned(address[] calldata holders) external {
        require(msg.sender == platform, "OMToken: platform only");
        for (uint256 i; i < holders.length; ++i) {
            address h = holders[i];
            if (h == address(0)) continue;

            // Vérifier inactivité > 2 ans
            uint256 last = lastInteraction[h];
            if (last != 0 && block.timestamp - last < ABANDON_DELAY) continue;

            uint256 pending = pendingDividend(h);
            if (pending < DUST) continue;

            // Settle vers platform
            rewardDebt[h]   = balanceOf(h) * accPerShare / PREC;
            dividendReserve -= pending;
            emit AbandonedSwept(h, pending);
            (bool ok,) = platform.call{value: pending}("");
            require(ok, "OMToken: sweep failed");
        }
    }

    // ─── Internals ───────────────────────────────────────────────────────────

    /**
     * @dev Settle et envoie les dividendes d'un holder.
     *      Checks-effects-interactions : rewardDebt mis à jour AVANT l'envoi ETH.
     *
     *      Si pending < DUST : on ne met PAS à jour rewardDebt pour préserver
     *      l'accumulation — la poudre s'accumule jusqu'à dépasser le seuil.
     */
    function _settleDividend(address holder) internal {
        if (holder == address(0)) return;
        uint256 pending = pendingDividend(holder);
        if (pending < DUST) return; // Ne pas écraser rewardDebt — laisser la poudre s'accumuler
        // Mise à jour de la dette AVANT tout envoi (anti-reentrancy)
        rewardDebt[holder] = balanceOf(holder) * accPerShare / PREC;
        dividendReserve -= pending;
        (bool ok,) = holder.call{value: pending}("");
        require(ok, "OMToken: dividend failed");
        emit DividendClaimed(holder, pending);
    }

    /**
     * @dev Override ERC20 _update — appelé sur tout transfer, mint et burn.
     *
     *      Règle : seul "from" (partie active) voit ses dividendes auto-settled.
     *      "to" (destinataire passif) conserve son pending intact :
     *        - rewardDebt[to] += amount * accPerShare / PREC AVANT le transfer
     *        - Ce delta annule exactement l'augmentation de balance → pending préservé
     *        - pending_après = (bal+amt)*acc/PREC - (debt + amt*acc/PREC)
     *                        = bal*acc/PREC - debt = pending_avant ✓
     *
     *      Timer : seul "from" est mis à jour (action active).
     *              Recevoir passivement des tokens ne reset PAS le timer.
     */
    function _update(address from, address to, uint256 amount) internal override {
        // 1. Settle "from" (actif) AVANT modification de balance.
        //    hook = bonding curve, exclu (pas un holder réel).
        //    address(0) = mint, exclu.
        if (from != address(0) && from != hook) _settleDividend(from);

        // 2. Ajuster rewardDebt[to] AVANT le transfer pour conserver son pending.
        //    "to" ne reçoit PAS un auto-settle — il garde ses dividendes accumulés.
        if (to != address(0) && to != hook) {
            rewardDebt[to] += amount * accPerShare / PREC;
        }

        // 3. Timer : seul "from" est considéré actif (hors hook et address(0))
        //    → recevoir passivement des tokens NE reset PAS le timer
        if (from != address(0) && from != hook) {
            lastInteraction[from] = block.timestamp;
        }

        // 4. Transfer ERC20 — modifie les balances
        super._update(from, to, amount);

        // 5. Recalcul rewardDebt[from] avec la nouvelle balance (réduite après vente/transfer).
        //    _settleDividend avait basé le settle sur l'ancienne balance ;
        //    on normalise pour la balance post-transfer.
        if (from != address(0) && from != hook) {
            rewardDebt[from] = balanceOf(from) * accPerShare / PREC;
        }
        // rewardDebt[to] déjà ajusté à l'étape 2 — aucune action supplémentaire.
    }
}
