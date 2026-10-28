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
import "../src/DirectV4Vault.sol";
import "../src/LaunchpadFactoryArcV4Direct.sol";
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

contract DirectV4Test is Test {
    PoolManager pm;
    PositionManager posm;
    MockPermit2 permit2;
    PoolSwapTest router;
    DirectV4Vault vaultImpl;
    LaunchpadFactoryArcV4Direct factory;

    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address buyer = makeAddr("buyer");

    function setUp() public {
        pm = new PoolManager(address(this));
        permit2 = new MockPermit2();
        posm = new PositionManager(IPoolManager(address(pm)), IAllowanceTransfer(address(permit2)), 100_000, IPositionDescriptor(address(0)), IWETH9(address(0)));
        router = new PoolSwapTest(IPoolManager(address(pm)));
        vaultImpl = new DirectV4Vault();
        factory = new LaunchpadFactoryArcV4Direct(address(vaultImpl), treasury, address(pm), address(posm), address(permit2));
        vm.deal(creator, 10_000 ether);
        vm.deal(buyer, 10_000 ether);
    }

    function _launch(uint256 firstBuy, uint8 tier) internal returns (DirectV4Vault v, OMTokenDirect t) {
        vm.prank(creator);
        (address vault, address token) = factory.createToken{value: firstBuy}("Meme", "MEME", "ipfs://x", "desc", firstBuy, tier);
        v = DirectV4Vault(payable(vault)); t = OMTokenDirect(payable(token));
    }

    function _buy(DirectV4Vault v, uint256 usdc) internal returns (uint256 got) {
        OMTokenDirect t = OMTokenDirect(payable(v.token()));
        uint256 before = t.balanceOf(buyer);
        PoolKey memory key = v.poolKey();
        vm.prank(buyer);
        router.swap{value: usdc}(key, SwapParams({zeroForOne: true, amountSpecified: -int256(usdc), sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1}), PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), "");
        got = t.balanceOf(buyer) - before;
    }

    function test_launch_creates_pool_with_all_supply_and_locked_lp() public {
        (DirectV4Vault v, OMTokenDirect t) = _launch(0, 0);
        assertTrue(v.seeded());
        assertEq(posm.ownerOf(v.positionId()), address(v), "NFT LP dans le vault");
        // Presque tout le supply est dans le pool (PoolManager), rien dans le vault
        assertEq(t.balanceOf(address(v)), 0);
        assertGt(t.balanceOf(address(pm)), t.TOTAL_SUPPLY() * 999999 / 1_000_000);
        assertEq(t.balanceOf(creator), 0);
    }

    function test_buying_moves_price_like_a_curve() public {
        (DirectV4Vault v, OMTokenDirect t) = _launch(0, 0);
        // 4 000 USDC achetés : environ la moitié du supply (réserve virtuelle ~3 990 USDC, frais 0,5 % inclus)
        uint256 got = _buy(v, 4_000 ether);
        uint256 share = got * 100 / t.TOTAL_SUPPLY();
        assertGe(share, 48); assertLe(share, 51);
        // 480 USDC : environ 10,5 % du supply sur un pool neuf
        (DirectV4Vault v2,) = _launch(0, 0);
        uint256 got2 = _buy(v2, 480 ether);
        uint256 share2 = got2 * 1000 / OMTokenDirect(payable(v2.token())).TOTAL_SUPPLY();
        assertGe(share2, 100); assertLe(share2, 108);
    }

    function test_sell_back_works() public {
        (DirectV4Vault v, OMTokenDirect t) = _launch(0, 0);
        uint256 got = _buy(v, 100 ether);
        assertGt(got, 0);
        PoolKey memory key = v.poolKey();
        vm.startPrank(buyer);
        t.approve(address(router), got);
        uint256 usdcBefore = buyer.balance;
        router.swap(key, SwapParams({zeroForOne: false, amountSpecified: -int256(got), sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1}), PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), "");
        vm.stopPrank();
        assertGt(buyer.balance - usdcBefore, 94 ether); // moins les frais 2,5 % x 2
        assertEq(t.balanceOf(buyer), 0);
    }

    function test_first_buy_goes_to_creator_in_the_same_transaction() public {
        (DirectV4Vault v, OMTokenDirect t) = _launch(480 ether, 0);
        uint256 share = t.balanceOf(creator) * 1000 / t.TOTAL_SUPPLY();
        assertGe(share, 100); assertLe(share, 108);
        assertEq(t.balanceOf(address(v)), 0);
    }

    function test_first_buy_refunds_excess_and_caps() public {
        uint256 before = creator.balance;
        vm.prank(creator);
        factory.createToken{value: 50 ether}("Meme", "MEME", "u", "d", 10 ether, 0);
        assertEq(before - creator.balance, 10 ether);
        vm.prank(creator);
        vm.expectRevert(bytes("Factory: first buy too large"));
        factory.createToken{value: 500 ether}("Meme", "MEME", "u", "d", 481 ether, 0);
    }

    function _sellBack(DirectV4Vault v, OMTokenDirect t, uint256 amount) internal {
        PoolKey memory key = v.poolKey();
        vm.startPrank(buyer);
        t.approve(address(router), amount);
        router.swap(key, SwapParams({zeroForOne: false, amountSpecified: -int256(amount), sqrtPriceLimitX96: TickMath.MAX_SQRT_PRICE - 1}), PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), "");
        vm.stopPrank();
    }

    function test_plan0_fees_1pct_creator_05_platform_1_liquidity() public {
        (DirectV4Vault v, OMTokenDirect t) = _launch(0, 0);
        assertEq(v.poolFee(), 25_000, "2,5 %");
        uint256 got = _buy(v, 1_000 ether);
        _sellBack(v, t, got / 2);
        uint256 c0 = creator.balance; uint256 t0 = treasury.balance;
        v.collectFees();
        // 1 000 USDC achetés a 2,5 % = ~25 USDC de frais : 40 % createur (~10), 20 % plateforme (~5), 40 % liquidite (~10)
        assertApproxEqRel(creator.balance - c0, 10 ether, 0.1e18);
        assertApproxEqRel(treasury.balance - t0, 5 ether, 0.1e18);
        assertEq(v.positionCount(), 2, "la part liquidite est ajoutee au pool");
        assertLt(address(v).balance, 0.01 ether, "presque rien ne reste dans le vault");
        assertEq(t.balanceOf(address(v)), 0);
        v.collectFees(); // 2e appel sans nouveaux frais : ne casse rien
    }

    function test_compounded_liquidity_is_locked_and_supports_the_price() public {
        (DirectV4Vault v, OMTokenDirect t) = _launch(0, 0);
        uint256 got = _buy(v, 2_000 ether);
        _sellBack(v, t, got / 2);
        v.collectFees();
        assertEq(v.positionCount(), 2);
        assertEq(posm.ownerOf(v.positionIds(1)), address(v), "le NFT reste dans le vault : verrouille");
    }

    function test_plan1_pays_holders_dividends_and_excludes_the_pool() public {
        (DirectV4Vault v, OMTokenDirect t) = _launch(0, 1);
        assertEq(v.poolFee(), 20_000, "2,0 %");
        uint256 got = _buy(v, 1_000 ether);
        _sellBack(v, t, got / 2);
        uint256 c0 = creator.balance; uint256 t0 = treasury.balance;
        v.collectFees();
        // ~20 USDC de frais : 25 % chacun (~5)
        assertApproxEqRel(creator.balance - c0, 5 ether, 0.1e18);
        assertApproxEqRel(treasury.balance - t0, 5 ether, 0.1e18);
        // le seul holder reel (buyer) recoit toute la part holders (~5 USDC), pas le PoolManager
        uint256 pending = t.pendingDividend(buyer);
        assertApproxEqRel(pending, 5 ether, 0.1e18, "les dividendes vont aux vrais holders");
        assertEq(t.pendingDividend(address(pm)), 0);
        uint256 b0 = buyer.balance;
        vm.prank(buyer);
        t.claimDividend();
        assertEq(buyer.balance - b0, pending);
    }

    function test_unsupported_tier_reverts() public {
        vm.prank(creator);
        vm.expectRevert(bytes("Factory: tier not supported"));
        factory.createToken("Meme", "MEME", "u", "d", 0, 2);
    }

    function test_only_factory_can_seed_or_first_buy() public {
        (DirectV4Vault v,) = _launch(0, 0);
        vm.expectRevert(bytes("DV4: only factory"));
        v.seedPool();
        vm.expectRevert(bytes("DV4: only factory"));
        v.firstBuy{value: 1 ether}(address(this));
    }

    function test_clone_cannot_be_initialized_twice() public {
        (DirectV4Vault v, OMTokenDirect t) = _launch(0, 0);
        vm.expectRevert(bytes("DV4: already initialized"));
        v.initialize(address(t), creator, treasury, 0, address(pm), address(posm), address(permit2));
    }

    function test_router_buy_sell_and_quotes_match() public {
        (DirectV4Vault v, OMTokenDirect t) = _launch(0, 0);
        DirectV4Router r = new DirectV4Router(IPoolManager(address(pm)));
        address token = address(t);
        uint256 q = r.quoteBuy(token, v.poolFee(), 200 ether);
        assertGt(q, 0);
        vm.prank(buyer);
        uint256 got = r.buy{value: 200 ether}(token, v.poolFee(), q, buyer);
        assertEq(got, q, "le devis correspond a l'achat");
        assertEq(t.balanceOf(buyer), got);
        uint256 qs = r.quoteSell(token, v.poolFee(), got);
        vm.startPrank(buyer);
        t.approve(address(r), got);
        uint256 before = buyer.balance;
        uint256 out = r.sell(token, v.poolFee(), got, qs, buyer);
        vm.stopPrank();
        assertEq(out, qs);
        assertEq(buyer.balance - before, out);
        assertGt(out, 200 ether * 94 / 100);
        assertEq(address(r).balance, 0);
        assertEq(t.balanceOf(address(r)), 0);
        // protection contre le glissement
        uint24 fee = v.poolFee();
        vm.prank(buyer);
        vm.expectRevert(bytes("R: slippage"));
        r.buy{value: 1 ether}(token, fee, type(uint256).max, buyer);
    }
}
