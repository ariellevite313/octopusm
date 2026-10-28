// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PositionManager} from "v4-periphery/src/PositionManager.sol";
import "../src/BondingCurveArcV2.sol";
import "../src/GraduationVaultV4.sol";
import "../src/LaunchpadFactoryArcV2.sol";
import "../src/OMTokenDirect.sol";
import "../src/DirectV4Router.sol";

contract MockP2 {
    mapping(address => mapping(address => mapping(address => uint160))) public a;
    function approve(address token, address spender, uint160 amount, uint48) external { a[msg.sender][token][spender] = amount; }
    function transferFrom(address from, address to, uint160 amount, address token) external { ERC20(token).transferFrom(from, to, amount); }
}

/// Flux complet de l'ancien modele, avec les nouveaux plans : courbe -> graduation -> pool Uniswap V4, contre le vrai V4.
contract CurveFlowTest is Test {
    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant POSM = 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B;
    address constant P2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    LaunchpadFactoryArcV2 factory;
    DirectV4Router router;
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        deployCodeTo("PoolManager.sol:PoolManager", abi.encode(address(this)), PM);
        deployCodeTo("PositionManager.sol:PositionManager", abi.encode(PM, P2, uint256(100_000), address(0), address(0)), POSM);
        vm.etch(P2, address(new MockP2()).code);
        factory = new LaunchpadFactoryArcV2(address(new BondingCurveArcV2()), address(new GraduationVaultV4()), treasury);
        router = new DirectV4Router(IPoolManager(PM));
        vm.deal(creator, 100 ether); vm.deal(alice, 100_000 ether); vm.deal(bob, 100_000 ether);
    }

    function _launch(uint8 tier) internal returns (BondingCurveArcV2 c, OMTokenDirect t, GraduationVaultV4 v) {
        vm.prank(creator);
        (address curve, address token, address vault) = factory.createToken("Meme", "MEME", "u", "d", 0, tier);
        c = BondingCurveArcV2(payable(curve)); t = OMTokenDirect(payable(token)); v = GraduationVaultV4(payable(vault));
    }

    function _graduate(BondingCurveArcV2 c, address who) internal {
        vm.startPrank(who);
        for (uint256 i; i < 20 && !c.graduated(); i++) c.buy{value: 700 ether}(0);
        vm.stopPrank();
        assertTrue(c.graduated(), "la courbe gradue");
    }

    function test_plan0_curve_fees_are_third_each() public {
        (BondingCurveArcV2 c,,) = _launch(0);
        (uint256 total, uint256 cr, uint256 pl, uint256 lp, uint256 ho) = c.tierBps();
        assertEq(total, 150); assertEq(cr, 50); assertEq(pl, 50); assertEq(lp, 50); assertEq(ho, 0);
        uint256 t0 = treasury.balance;
        vm.prank(alice); c.buy{value: 1_000 ether}(0);
        assertEq(c.creatorAccrued(), 5 ether, "0,5 % createur");
        assertEq(treasury.balance - t0, 5 ether, "0,5 % plateforme");
        assertEq(c.lockedLpAccrued(), 5 ether, "0,5 % liquidite");
    }

    function test_plan1_curve_pays_holders() public {
        (BondingCurveArcV2 c, OMTokenDirect t,) = _launch(1);
        (uint256 total,,,, uint256 ho) = c.tierBps();
        assertEq(total, 200); assertEq(ho, 50);
        vm.prank(alice); c.buy{value: 500 ether}(0);
        vm.prank(bob); c.buy{value: 500 ether}(0);
        // alice detient des tokens quand bob achete : elle recoit une part des 0,5 % de bob
        assertGt(t.pendingDividend(alice), 0);
        assertEq(t.pendingDividend(address(c)), 0, "la courbe n'est pas un holder");
    }

    function test_graduation_creates_pool_and_trades() public {
        (BondingCurveArcV2 c, OMTokenDirect t, GraduationVaultV4 v) = _launch(1);
        _graduate(c, alice);
        assertTrue(v.poolCreated());
        assertEq(v.poolFee(), 20_000, "le pool garde les frais du plan : 2 %");
        assertEq(IERC721(POSM).ownerOf(v.positionId()), address(v), "NFT verrouille dans le vault");
        assertEq(address(v).balance, 0, "aucun USDC bloque");
        // le prix reste coherent avec la courbe : on peut acheter puis revendre via le routeur
        uint24 fee = v.poolFee();
        uint256 q = router.quoteBuy(address(t), fee, 50 ether);
        assertGt(q, 0);
        vm.prank(bob);
        uint256 got = router.buy{value: 50 ether}(address(t), fee, q, bob);
        assertEq(got, q);
        vm.startPrank(bob);
        t.approve(address(router), got);
        uint256 back = router.sell(address(t), fee, got, 0, bob);
        vm.stopPrank();
        assertGt(back, 50 ether * 94 / 100);
    }

    function test_graduated_fees_split_holders_and_compound() public {
        (BondingCurveArcV2 c, OMTokenDirect t, GraduationVaultV4 v) = _launch(1);
        _graduate(c, alice);
        uint24 fee = v.poolFee();
        // du volume dans le pool
        vm.prank(bob);
        uint256 got = router.buy{value: 1_000 ether}(address(t), fee, 0, bob);
        vm.startPrank(bob); t.approve(address(router), got); router.sell(address(t), fee, got / 2, 0, bob); vm.stopPrank();

        uint256 c0 = creator.balance; uint256 t0 = treasury.balance;
        uint256 pend0 = t.pendingDividend(alice) + t.pendingDividend(bob);
        v.collectFees();
        // 1 000 USDC achetes a 2 % = ~20 USDC de frais : 5 createur, 5 plateforme, 5 holders, 5 liquidite
        assertApproxEqRel(creator.balance - c0, 5 ether, 0.1e18);
        assertApproxEqRel(treasury.balance - t0, 5 ether, 0.1e18);
        uint256 pend1 = t.pendingDividend(alice) + t.pendingDividend(bob);
        assertApproxEqRel(pend1 - pend0, 5 ether, 0.1e18, "dividendes aux vrais holders (pas au pool)");
        assertEq(v.positionCount(), 2, "la part liquidite est ajoutee au pool");
        assertLt(address(v).balance, 0.01 ether);
    }
}
