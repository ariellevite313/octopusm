// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC-20 token déployé par le Launchpad.
/// La totalité du supply est minté au launchpad au constructeur.
contract Token is ERC20 {
    address public immutable launchpad;

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 supply_,
        address launchpad_
    ) ERC20(name_, symbol_) {
        launchpad = launchpad_;
        _mint(launchpad_, supply_);
    }
}
