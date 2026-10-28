// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./OMTokenDirect.sol";
import "./DirectV4Vault.sol";

/**
 * @title LaunchpadFactoryArcV4Direct
 * @notice Lance un token Arc directement sur Uniswap V4 : le pool existe dès la transaction de création,
 *         100 % du supply est en liquidité d'un seul côté, la liquidité est verrouillée à vie.
 *         Visible et indexable tout de suite, sans bonding curve ni graduation.
 *
 * createToken() déploie : OMToken (supply 1 Md, tout vers le vault) + DirectV4Vault (clone EIP-1167).
 * Tiers : 0 = Standard, 2 = Creator (les tiers à dividendes holders ne sont pas pris en charge ici).
 */
contract LaunchpadFactoryArcV4Direct {
    using Clones for address;

    address public immutable vaultImplementation;
    address public immutable treasury;
    address public immutable poolManager;
    address public immutable positionManager;
    address public immutable permit2;

    /// @dev Premier achat du créateur : au plus 480 USDC (environ 10 % du supply au prix de départ).
    uint256 public constant MAX_FIRST_BUY = 480 ether; // USDC natif, 18 décimales (msg.value)

    address[] public allVaults;
    struct TokenRecord { address token; address vault; address creator; }
    mapping(address => TokenRecord) public vaultRecord;
    mapping(address => bool) public isVault;

    event TokenLaunchedDirect(
        address indexed vault,
        address indexed token,
        address indexed creator,
        string name,
        string symbol,
        string imageUri,
        string description,
        uint256 firstBuyUsdc,
        uint8 feeTier
    );

    constructor(address vaultImpl_, address treasury_, address poolManager_, address positionManager_, address permit2_) {
        require(poolManager_ != address(0) && positionManager_ != address(0) && permit2_ != address(0), "Factory: zero v4 address");
        poolManager = poolManager_;
        positionManager = positionManager_;
        permit2 = permit2_;
        require(vaultImpl_ != address(0), "Factory: zero vault impl");
        require(treasury_ != address(0), "Factory: zero treasury");
        vaultImplementation = vaultImpl_;
        treasury = treasury_;
    }

    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata imageUri,
        string calldata description,
        uint256 firstBuyUsdc,
        uint8 feeTier_
    ) external payable returns (address vault, address token_) {
        require(feeTier_ <= 2, "Factory: tier not supported");
        require(bytes(name).length > 0 && bytes(symbol).length > 0, "Factory: empty name/symbol");
        require(firstBuyUsdc <= MAX_FIRST_BUY, "Factory: first buy too large");
        require(msg.value >= firstBuyUsdc, "Factory: insufficient value");

        vault = vaultImplementation.clone();
        // hook = vault et vault = vault : tout le supply est minté vers le vault
        token_ = address(new OMTokenDirect(name, symbol, imageUri, description, vault, vault, msg.sender, treasury, poolManager));
        DirectV4Vault(payable(vault)).initialize(token_, msg.sender, treasury, feeTier_, poolManager, positionManager, permit2);
        DirectV4Vault(payable(vault)).seedPool();

        allVaults.push(vault);
        isVault[vault] = true;
        vaultRecord[vault] = TokenRecord({token: token_, vault: vault, creator: msg.sender});
        emit TokenLaunchedDirect(vault, token_, msg.sender, name, symbol, imageUri, description, firstBuyUsdc, feeTier_);

        if (firstBuyUsdc > 0) DirectV4Vault(payable(vault)).firstBuy{value: firstBuyUsdc}(msg.sender);
        if (msg.value > firstBuyUsdc) {
            (bool ok,) = payable(msg.sender).call{value: msg.value - firstBuyUsdc}("");
            require(ok, "Factory: refund failed");
        }
    }

    function allVaultsLength() external view returns (uint256) { return allVaults.length; }

    function getVaultsPaginated(uint256 offset, uint256 limit) external view returns (address[] memory result) {
        uint256 total = allVaults.length;
        if (offset >= total) return new address[](0);
        uint256 end = total - offset;
        uint256 count = end < limit ? end : limit;
        result = new address[](count);
        for (uint256 i = 0; i < count; i++) result[i] = allVaults[end - 1 - i];
    }

    receive() external payable {}
}
