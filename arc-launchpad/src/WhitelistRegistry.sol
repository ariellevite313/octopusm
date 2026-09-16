// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
contract WhitelistRegistry {
    struct QuoteAssetInfo { string name; string symbol; string logoUri; uint8 decimals; bool active; }
    address public owner; address public pendingOwner;
    mapping(address => QuoteAssetInfo) public assets;
    address[] public assetList;
    event AssetAdded(address indexed asset, string symbol);
    event AssetDeactivated(address indexed asset, string symbol);
    event AssetReactivated(address indexed asset, string symbol);
    event OwnershipTransferred(address indexed previous, address indexed next);
    constructor(address owner_) { require(owner_ != address(0)); owner = owner_; emit OwnershipTransferred(address(0), owner_); }
    modifier onlyOwner() { require(msg.sender == owner, "Registry: not owner"); _; }
    function addAsset(address asset_, string calldata name_, string calldata symbol_, string calldata logoUri_, uint8 decimals_) external onlyOwner {
        require(asset_ != address(0) && bytes(name_).length > 0 && bytes(symbol_).length > 0 && !assets[asset_].active);
        bool existing = bytes(assets[asset_].symbol).length > 0;
        assets[asset_] = QuoteAssetInfo({ name: name_, symbol: symbol_, logoUri: logoUri_, decimals: decimals_, active: true });
        if (!existing) { assetList.push(asset_); emit AssetAdded(asset_, symbol_); } else { emit AssetReactivated(asset_, symbol_); }
    }
    function deactivateAsset(address asset_) external onlyOwner { require(assets[asset_].active); assets[asset_].active = false; emit AssetDeactivated(asset_, assets[asset_].symbol); }
    function isWhitelisted(address asset_) external view returns (bool) { return assets[asset_].active; }
    function assetListLength() external view returns (uint256) { return assetList.length; }
    function transferOwnership(address newOwner_) external onlyOwner { require(newOwner_ != address(0)); pendingOwner = newOwner_; }
    function acceptOwnership() external { require(msg.sender == pendingOwner); emit OwnershipTransferred(owner, pendingOwner); owner = pendingOwner; pendingOwner = address(0); }
}
