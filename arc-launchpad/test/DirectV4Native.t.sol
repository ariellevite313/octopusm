// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PositionManager} from "v4-periphery/src/PositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IPositionDescriptor} from "v4-periphery/src/interfaces/IPositionDescriptor.sol";
import {IWETH9} from "v4-periphery/src/interfaces/external/IWETH9.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/OMTokenDirect.sol";
import "../src/DirectV4VaultNative.sol";
import "../src/LaunchpadFactoryV4DirectNative.sol";
import "../src/DirectV4Router.sol";

/// @dev Permit2 minimal : suffit au PositionManager (approve + transferFrom).
contract MockPermit2 {
    mapping(address => mapping(address => mapping(address => uint160))) public allowanceOf;
    function approve(address token, address spender, uint160 amount, uint48) external { allowanceOf[msg.sender][token][spender] = amount; }
    function transferFrom(address from, address to, uint160 amount, address token) external {
        uint160 a = allowanceOf[from][token][msg.sender];
        require(a >= amount, "permit2: allowance");
        allowanceOf[from][token][msg.sender] = a - amount;
        require(IERC20(token).transferFrom(from, to, amount), "permit2: transfer");
    }
    function permit(address, IAllowanceTransfer.PermitSingle calldata, bytes calldata) external {}
    function permit(address, IAllowanceTransfer.PermitBatch calldata, bytes calldata) external {}
    function allowance(address owner, address token, address spender) external view returns (uint160, uint48, uint48) { return (allowanceOf[owner][token][spender], type(uint48).max, 0); }
}


/// @dev Elysium : paire en HYPE natif. Prix du HYPE supposé 40 $ : départ ~100 HYPE de capitalisation (~4 000 $).
contract DirectV4NativeTest is Test {
    PoolManager pm;
    PositionManager posm;
    MockPermit2 permit2;
    PoolSwapTest router;
    LaunchpadFactoryV4DirectNative factory;

    int24 constant START_TICK = 161_160;   // 1,0001^161160 ≈ 9,97 M tokens par HYPE
    uint256 constant MAX_FIRST = 12 ether; // ~10 % du supply

    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address buyer = makeAddr("buyer");

    function setUp() public {
        pm = new PoolManager(address(this));
        permit2 = new MockPermit2();
        posm = new PositionManager(IPoolManager(address(pm)), IAllowanceTransfer(address(permit2)), 100_000, IPositionDescriptor(address(0)), IWETH9(address(0)));
        router = new PoolSwapTest(IPoolManager(address(pm)));
        factory = new LaunchpadFactoryV4DirectNative(address(new DirectV4VaultNative()), treasury, address(pm), address(posm), address(permit2), START_TICK, MAX_FIRST);
        vm.deal(creator, 10_000 ether);
        vm.deal(buyer, 10_000 ether);
    }

    function _launch(uint256 firstBuy, uint8 tier) internal returns (DirectV4VaultNative v, OMTokenDirect t) {
        vm.prank(creator);
        (address vault, address token) = factory.createToken{value: firstBuy}("Meme", "MEME", "ipfs://x", "desc", firstBuy, tier);
        v = DirectV4VaultNative(payable(vault)); t = OMTokenDirect(payable(token));
    }

    function _buy(DirectV4VaultNative v, uint256 amt) internal returns (uint256 got) {
        OMTokenDirect t = OMTokenDirect(payable(v.token()));
        uint256 before = t.balanceOf(buyer);
        PoolKey memory key = v.poolKey();
        vm.prank(buyer);
        router.swap{value: amt}(key, SwapParams({zeroForOne: true, amountSpecified: -int256(amt), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}), PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), "");
        got = t.balanceOf(buyer) - before;
    }

    function _sellBack(DirectV4VaultNative v, OMTokenDirect t, uint256 amount) internal {
        PoolKey memory key = v.poolKey();
        vm.startPrank(buyer);
        t.approve(address(router), amount);
        router.swap(key, SwapParams({zeroForOne: false, amountSpecified: -int256(amount), sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1}), PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), "");
        vm.stopPrank();
    }

    function test_start_price_and_locked_lp() public {
        (DirectV4VaultNative v, OMTokenDirect t) = _launch(0, 0);
        assertEq(v.tickUpper(), START_TICK);
        assertEq(posm.ownerOf(v.positionId()), address(v));
        assertGt(t.balanceOf(address(pm)), t.TOTAL_SUPPLY() * 999999 / 1_000_000);
    }

    function test_curve_in_hype() public {
        // ~100 HYPE achetés : environ la moitié du supply
        (DirectV4VaultNative v, OMTokenDirect t) = _launch(0, 0);
        uint256 share = _buy(v, 100 ether) * 100 / t.TOTAL_SUPPLY();
        assertGe(share, 48); assertLe(share, 51);
        // 12 HYPE sur un pool neuf : ~10 % du supply
        (DirectV4VaultNative v2, OMTokenDirect t2) = _launch(0, 0);
        uint256 share2 = _buy(v2, 12 ether) * 1000 / t2.TOTAL_SUPPLY();
        assertGe(share2, 100); assertLe(share2, 110);
    }

    function test_first_buy_cap_and_refund() public {
        (, OMTokenDirect t) = _launch(12 ether, 0);
        uint256 share = t.balanceOf(creator) * 1000 / t.TOTAL_SUPPLY();
        assertGe(share, 100); assertLe(share, 110);
        uint256 before = creator.balance;
        vm.prank(creator);
        factory.createToken{value: 5 ether}("Meme", "MEME", "u", "d", 1 ether, 0);
        assertEq(before - creator.balance, 1 ether);
        vm.prank(creator);
        vm.expectRevert(bytes("Factory: first buy too large"));
        factory.createToken{value: 13 ether}("Meme", "MEME", "u", "d", 13 ether, 0);
    }

    function test_sell_back_and_fees_plan1() public {
        (DirectV4VaultNative v, OMTokenDirect t) = _launch(0, 1);
        assertEq(v.poolFee(), 20_000);
        uint256 got = _buy(v, 50 ether);
        _sellBack(v, t, got / 2);
        uint256 c0 = creator.balance; uint256 t0 = treasury.balance;
        v.collectFees();
        // ~1 HYPE de frais : 1 % createur (~0,5), 0,5 % plateforme (~0,25)
        assertApproxEqRel(creator.balance - c0, 0.5 ether, 0.1e18);
        assertApproxEqRel(treasury.balance - t0, 0.25 ether, 0.1e18);
        assertEq(posm.ownerOf(v.positionIds(1)), address(v));
    }

    function test_bad_start_tick_rejected() public {
        address impl = address(new DirectV4VaultNative());
        vm.expectRevert(bytes("Factory: bad start tick"));
        new LaunchpadFactoryV4DirectNative(impl, treasury, address(pm), address(posm), address(permit2), 161_161, MAX_FIRST);
    }

    function test_same_as_arc_with_arc_tick() public {
        // Avec le tick d'Arc (124320) la variante se comporte comme la version Arc : ~10,5 % du supply pour 480
        LaunchpadFactoryV4DirectNative f = new LaunchpadFactoryV4DirectNative(address(new DirectV4VaultNative()), treasury, address(pm), address(posm), address(permit2), 124_320, 480 ether);
        vm.prank(creator);
        (address vault, address token) = f.createToken("Meme", "MEME", "u", "d", 0, 0);
        uint256 share = _buy(DirectV4VaultNative(payable(vault)), 480 ether) * 1000 / OMTokenDirect(payable(token)).TOTAL_SUPPLY();
        assertGe(share, 100); assertLe(share, 108);
    }
}
