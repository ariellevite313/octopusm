// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract MockXStock is ERC20 {
    address public immutable owner;
    uint8 private immutable _decimals;
    event Minted(address indexed to, uint256 amount);
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) { owner = msg.sender; _decimals = 6; }
    function decimals() public view override returns (uint8) { return _decimals; }
    function mint(address to, uint256 amount) external {
        require(msg.sender == owner, "MockXStock: not owner");
        require(to != address(0));
        _mint(to, amount);
        emit Minted(to, amount);
    }
}
