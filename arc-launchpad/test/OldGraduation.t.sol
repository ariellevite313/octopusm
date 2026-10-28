// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PositionManager} from "v4-periphery/src/PositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IPositionDescriptor} from "v4-periphery/src/interfaces/IPositionDescriptor.sol";
import {IWETH9} from "v4-periphery/src/interfaces/external/IWETH9.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../src/GraduationVaultV4.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

contract MockP2 {
    mapping(address => mapping(address => mapping(address => uint160))) public a;
    function approve(address token, address spender, uint160 amount, uint48) external { a[msg.sender][token][spender] = amount; }
    function transferFrom(address from, address to, uint160 amount, address token) external { ERC20(token).transferFrom(from, to, amount); }
}
contract Tok is ERC20 { constructor() ERC20("T","T") { _mint(msg.sender, 1_000_000_000 ether); } }

/// Diagnostic de l'ancien flux : GraduationVaultV4 contre le vrai Uniswap V4 (adresses Arc simulées).
contract OldGraduationTest is Test {
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant POSM = 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B;
    address constant P2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function test_old_vault_graduation() public {
        deployCodeTo("PoolManager.sol:PoolManager", abi.encode(address(this)), PM);
        deployCodeTo("PositionManager.sol:PositionManager", abi.encode(PM, P2, uint256(100_000), address(0), address(0)), POSM);
        vm.etch(P2, address(new MockP2()).code);

        Tok t = new Tok();

        GraduationVaultV4 v = new GraduationVaultV4();
        address curve = address(this);
        v.initialize(curve, address(t), makeAddr("c"), makeAddr("tr"), 0);
        t.transfer(address(v), 200_000_000 ether);
        vm.deal(address(v), 4_800 ether);
        try v.createV4Pool(address(t), -887_220, 887_220) {
            emit log("GRADUATION: OK");
            assertGt(v.positionId(), 0, "position creee");
            assertEq(IERC721(POSM).ownerOf(v.positionId()), address(v), "NFT dans le vault");
            // le prix du pool est coherent: acheter 10 USDC donne des tokens (pool liquide)
            assertGt(t.balanceOf(address(0xdead)), 0, "premier swap execute (event Swap pour l'indexation)");
            assertEq(address(v).balance, 0, "plus d'USDC bloque dans le vault");
            v.collectFees();
            
        } catch Error(string memory r) {
            emit log_named_string("OLD GRADUATION: REVERT", r);
            fail();
        } catch {
            emit log("OLD GRADUATION: REVERT (sans message)");
            fail();
        }
    }
}
