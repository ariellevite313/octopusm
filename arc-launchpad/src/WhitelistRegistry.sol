// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title WhitelistRegistry
 * @notice Registre des quote assets approuvés pour les "Stock-Paired Meme Tokens".
 *
 * Seul l'owner peut ajouter / désactiver des assets (xNVDA, xTSLA, xMSTR, etc.).
 * La LaunchpadFactory consulte isWhitelisted() avant de créer un GenericBondingCurve.
 *
 * Les champs name/symbol/logoUri/decimals servent uniquement d'UI hints —
 * ils ne changent pas la logique on-chain.
 */
contract WhitelistRegistry {

    // ─── Structs ──────────────────────────────────────────────────────────

    struct QuoteAssetInfo {
        string  name;       // ex: "Nvidia Stock Token"
        string  symbol;     // ex: "xNVDA"
        string  logoUri;    // ex: "https://cdn.omdot.fun/stocks/nvda.svg"
        uint8   decimals;   // 6 pour les mocks, peut varier
        bool    active;     // false = désactivé (mais gardé en storage)
    }

    // ─── État ────────────────────────────────────────────────────────────

    address public owner;
    address public pendingOwner;

    /// @notice Infos d'un quote asset
    mapping(address => QuoteAssetInfo) public assets;

    /// @notice Liste ordonnée des assets jamais ajoutés (actifs ou non)
    address[] public assetList;

    // ─── Events ──────────────────────────────────────────────────────────

    event AssetAdded(address indexed asset, string symbol);
    event AssetDeactivated(address indexed asset, string symbol);
    event AssetReactivated(address indexed asset, string symbol);
    event OwnershipTransferred(address indexed previous, address indexed next);

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address owner_) {
        require(owner_ != address(0), "Registry: zero owner");
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
    }

    // ─── Modifiers ────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Registry: not owner");
        _;
    }

    // ─── Gestion des assets ───────────────────────────────────────────────

    /**
     * @notice Ajoute un nouveau quote asset.
     * @param asset_    Adresse du token ERC-20 (ex: MockXStock)
     * @param name_     Nom lisible (ex: "Nvidia Stock Token")
     * @param symbol_   Symbole (ex: "xNVDA")
     * @param logoUri_  URI du logo
     * @param decimals_ Decimals du token (6 pour les mocks USDC-style)
     */
    function addAsset(
        address asset_,
        string  calldata name_,
        string  calldata symbol_,
        string  calldata logoUri_,
        uint8   decimals_
    ) external onlyOwner {
        require(asset_ != address(0),        "Registry: zero asset");
        require(bytes(name_).length   > 0,   "Registry: empty name");
        require(bytes(symbol_).length > 0,   "Registry: empty symbol");
        require(!assets[asset_].active,      "Registry: already active");

        bool existing = bytes(assets[asset_].symbol).length > 0;

        assets[asset_] = QuoteAssetInfo({
            name:     name_,
            symbol:   symbol_,
            logoUri:  logoUri_,
            decimals: decimals_,
            active:   true
        });

        if (!existing) {
            assetList.push(asset_);
            emit AssetAdded(asset_, symbol_);
        } else {
            emit AssetReactivated(asset_, symbol_);
        }
    }

    /**
     * @notice Désactive un quote asset (ne peut plus être utilisé pour de nouveaux tokens).
     *         Les courbes existantes ne sont pas affectées.
     */
    function deactivateAsset(address asset_) external onlyOwner {
        require(assets[asset_].active, "Registry: not active");
        assets[asset_].active = false;
        emit AssetDeactivated(asset_, assets[asset_].symbol);
    }

    // ─── View helpers ─────────────────────────────────────────────────────

    /// @notice Vrai ssi le token est un quote asset actif
    function isWhitelisted(address asset_) external view returns (bool) {
        return assets[asset_].active;
    }

    /// @notice Retourne tous les assets actifs avec leurs infos
    function getActiveAssets()
        external view
        returns (
            address[] memory addrs,
            string[]  memory names,
            string[]  memory symbols,
            string[]  memory logos,
            uint8[]   memory decimalsArr
        )
    {
        uint256 total = assetList.length;

        // Compter les actifs
        uint256 activeCount;
        for (uint256 i = 0; i < total; i++) {
            if (assets[assetList[i]].active) activeCount++;
        }

        addrs      = new address[](activeCount);
        names      = new string[](activeCount);
        symbols    = new string[](activeCount);
        logos      = new string[](activeCount);
        decimalsArr = new uint8[](activeCount);

        uint256 j;
        for (uint256 i = 0; i < total; i++) {
            address a = assetList[i];
            if (assets[a].active) {
                addrs[j]       = a;
                names[j]       = assets[a].name;
                symbols[j]     = assets[a].symbol;
                logos[j]       = assets[a].logoUri;
                decimalsArr[j] = assets[a].decimals;
                j++;
            }
        }
    }

    /// @notice Nombre total d'assets (actifs + désactivés)
    function assetListLength() external view returns (uint256) {
        return assetList.length;
    }

    // ─── Ownership transfer ───────────────────────────────────────────────

    function transferOwnership(address newOwner_) external onlyOwner {
        require(newOwner_ != address(0), "Registry: zero owner");
        pendingOwner = newOwner_;
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Registry: not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }
}
