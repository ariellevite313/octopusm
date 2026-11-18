// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {PositionManager} from "v4-periphery/src/PositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IPositionDescriptor} from "v4-periphery/src/interfaces/IPositionDescriptor.sol";
import {IWETH9} from "v4-periphery/src/interfaces/external/IWETH9.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/OMTokenDirect.sol";
import "../src/DirectV4Vault.sol";
import "../src/LaunchpadFactoryArcV4Direct.sol";
import "../src/LaunchpadFactoryArcV2.sol";
import "../src/BondingCurveArcV2.sol";
import "../src/GraduationVaultV4.sol";
import "../src/DirectV4Router.sol";

contract MockP2b {
    mapping(address => mapping(address => mapping(address => uint160))) public a;
    function approve(address token, address spender, uint160 amount, uint48) external { a[msg.sender][token][spender] = amount; }
    function transferFrom(address from, address to, uint160 amount, address token) external { IERC20(token).transferFrom(from, to, amount); }
}

/// Ajoute de la liquidité 100 % USDC (le token n'existe pas encore : impossible d'en apporter).
contract UsdcLiquidityAdder {
    IPoolManager immutable pm;
    constructor(IPoolManager pm_) { pm = pm_; }
    function add(PoolKey memory k, int24 lo, int24 hi, int256 liquidity) external payable {
        pm.unlock(abi.encode(k, lo, hi, liquidity));
    }
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        (PoolKey memory k, int24 lo, int24 hi, int256 liquidity) = abi.decode(data, (PoolKey, int24, int24, int256));
        (BalanceDelta d,) = pm.modifyLiquidity(k, ModifyLiquidityParams({tickLower: lo, tickUpper: hi, liquidityDelta: liquidity, salt: 0}), "");
        if (d.amount0() < 0) pm.settle{value: uint256(uint128(-d.amount0()))}();
        if (d.amount1() < 0) {
            pm.sync(k.currency1);
            IERC20(Currency.unwrap(k.currency1)).transfer(address(pm), uint256(uint128(-d.amount1())));
            pm.settle();
        }
        return "";
    }
    receive() external payable {}
}

/// Attaque : quelqu'un initialise le pool Uniswap V4 d'un token AVANT nous (initialize est sans permission).
/// Avant la correction, le lancement direct et la graduation échouaient à jamais.
contract PreInitTest is Test {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    address constant PM = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant POSM = 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B;
    address constant P2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    LaunchpadFactoryArcV4Direct direct;
    LaunchpadFactoryArcV2 curveFactory;
    PoolSwapTest swapper;
    PoolModifyLiquidityTest liq;
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address attacker = makeAddr("attacker");
    address buyer = makeAddr("buyer");

    function setUp() public {
        deployCodeTo("PoolManager.sol:PoolManager", abi.encode(address(this)), PM);
        deployCodeTo("PositionManager.sol:PositionManager", abi.encode(PM, P2, uint256(100_000), address(0), address(0)), POSM);
        vm.etch(P2, address(new MockP2b()).code);
        direct = new LaunchpadFactoryArcV4Direct(address(new DirectV4Vault()), treasury, PM, POSM, P2);
        curveFactory = new LaunchpadFactoryArcV2(address(new BondingCurveArcV2()), address(new GraduationVaultV4()), treasury);
        swapper = new PoolSwapTest(IPoolManager(PM));
        liq = new PoolModifyLiquidityTest(IPoolManager(PM));
        vm.deal(creator, 100 ether); vm.deal(attacker, 100_000 ether); vm.deal(buyer, 100_000 ether);
    }

    function _key(address token, uint24 fee) internal pure returns (PoolKey memory) {
        return PoolKey({currency0: Currency.wrap(address(0)), currency1: Currency.wrap(token), fee: fee, tickSpacing: 60, hooks: IHooks(address(0))});
    }

    function _price(PoolKey memory k) internal view returns (uint160 p) { (p,,,) = IPoolManager(PM).getSlot0(k.toId()); }

    /// Adresse du prochain token créé par la factory directe : le clone du vault d'abord, puis le token.
    function _nextDirectToken() internal view returns (address) {
        return vm.computeCreateAddress(address(direct), vm.getNonce(address(direct)) + 1);
    }

    function _directLaunchAfterPreInit(int24 attackerTick) internal {
        address next = _nextDirectToken();
        vm.prank(attacker);
        IPoolManager(PM).initialize(_key(next, 15_000), TickMath.getSqrtPriceAtTick(attackerTick));

        vm.prank(creator);
        (address vault, address token) = direct.createToken{value: 1 ether}("Meme", "MEME", "u", "d", 1 ether, 0);
        assertEq(token, next, "adresse prevue");
        DirectV4Vault v = DirectV4Vault(payable(vault));
        assertTrue(v.seeded(), "pool cree malgre l'attaque");
        assertGt(IERC20(token).balanceOf(creator), 0, "premier achat recu");

        // Le prix est celui du lancement normal (au premier achat pres)
        uint160 start = TickMath.getSqrtPriceAtTick(v.TICK_UPPER());
        uint160 p = _price(v.poolKey());
        assertLe(p, start, "prix au plus au depart");
        assertGt(p, start * 99 / 100, "prix proche du depart");
    }

    function test_direct_launch_survives_preinit_cheaper_price() public { _directLaunchAfterPreInit(200_000); }
    function test_direct_launch_survives_preinit_dearer_price() public { _directLaunchAfterPreInit(-50_000); }

    /// L'attaquant initialise ET met de l'USDC en liquidité au-dessus du prix : le vault lui vend des tokens au-dessus
    /// du prix de départ (bonne affaire pour le vault), puis le lancement se fait normalement.
    function test_direct_launch_with_attacker_usdc_liquidity() public {
        address next = _nextDirectToken();
        PoolKey memory k = _key(next, 15_000);
        vm.startPrank(attacker);
        IPoolManager(PM).initialize(k, TickMath.getSqrtPriceAtTick(60_000));
        // Liquidité 100 % USDC : plage au-dessus du prix actuel, sous le prix de départ
        UsdcLiquidityAdder adder = new UsdcLiquidityAdder(IPoolManager(PM));
        adder.add{value: 1_000 ether}(k, 60_060, 120_000, 1e22);
        vm.stopPrank();

        uint256 t0 = treasury.balance;
        vm.prank(creator);
        (address vault,) = direct.createToken{value: 0}("Meme", "MEME", "u", "d", 0, 0);
        DirectV4Vault v = DirectV4Vault(payable(vault));
        assertTrue(v.seeded(), "lancement reussi");
        assertEq(_price(v.poolKey()), TickMath.getSqrtPriceAtTick(v.TICK_UPPER()), "prix ramene au depart");
        assertGt(treasury.balance, t0, "l'USDC de l'attaquant part a la plateforme");
    }

    function test_graduation_survives_preinit() public {
        vm.prank(creator);
        (address curve, address token, address vaultAddr) = curveFactory.createToken("Meme", "MEME", "u", "d", 0, 0);
        BondingCurveArcV2 c = BondingCurveArcV2(payable(curve));
        GraduationVaultV4 v = GraduationVaultV4(payable(vaultAddr));
        PoolKey memory k = v.poolKey();
        vm.prank(attacker);
        IPoolManager(PM).initialize(k, TickMath.getSqrtPriceAtTick(-200_000));

        vm.startPrank(buyer);
        for (uint256 i; i < 20 && !c.graduated(); i++) c.buy{value: 700 ether}(0);
        vm.stopPrank();
        assertTrue(c.graduated(), "la courbe gradue malgre l'attaque");
        assertTrue(v.poolCreated(), "pool cree");
        assertGt(IERC20(token).balanceOf(PM), 0, "liquidite en place");
    }

    /// L'attaquant achète des tokens sur la courbe et met une vraie liquidité (USDC + token) à un prix faux.
    /// La graduation doit réussir et le pool finir au prix de la courbe.
    function test_graduation_survives_preinit_with_attacker_liquidity() public {
        vm.prank(creator);
        (address curve, address token, address vaultAddr) = curveFactory.createToken("Meme", "MEME", "u", "d", 0, 0);
        BondingCurveArcV2 c = BondingCurveArcV2(payable(curve));
        GraduationVaultV4 v = GraduationVaultV4(payable(vaultAddr));
        PoolKey memory k = v.poolKey();

        vm.startPrank(attacker);
        c.buy{value: 500 ether}(0);
        UsdcLiquidityAdder adder = new UsdcLiquidityAdder(IPoolManager(PM));
        IERC20(token).transfer(address(adder), IERC20(token).balanceOf(attacker));
        IPoolManager(PM).initialize(k, TickMath.getSqrtPriceAtTick(276_000)); // token ~100x trop bon marché
        adder.add{value: 5 ether}(k, -887_220, 887_220, 1e15);
        vm.stopPrank();

        vm.startPrank(buyer);
        for (uint256 i; i < 20 && !c.graduated(); i++) c.buy{value: 700 ether}(0);
        vm.stopPrank();
        assertTrue(v.poolCreated(), "pool cree malgre la liquidite de l'attaquant");
        (uint160 p,,,) = IPoolManager(PM).getSlot0(k.toId());
        // Le prix final est proche du prix de la courbe (et non de celui de l'attaquant)
        assertLt(p, TickMath.getSqrtPriceAtTick(276_000) / 2, "prix ramene");
    }
}
