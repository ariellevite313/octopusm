// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import "forge-std/console.sol";

// V4 core
import {IPoolManager}      from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager}       from "v4-core/src/PoolManager.sol";
import {Hooks}             from "v4-core/src/libraries/Hooks.sol";
import {IHooks}            from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey}           from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {TickMath}          from "v4-core/src/libraries/TickMath.sol";

// V4 periphery
import {HookMiner}         from "v4-periphery/test/shared/HookMiner.sol";

// Nos contrats
import {BondingCurveHook}  from "../src/BondingCurveHook.sol";
import {OMToken}           from "../src/OMToken.sol";

// Mock ERC20
import {MockERC20}         from "forge-std/mocks/MockERC20.sol";

/**
 * @title MockFeeDistributor
 * @notice Mock minimal du FeeDistributor pour les tests.
 *         Enregistre les appels notifyReward et accepte les transferts USDC.
 */
contract MockFeeDistributor {
    address public usdc;
    uint256 public totalNotified;
    uint256 public notifyCallCount;

    constructor(address _usdc) {
        usdc = _usdc;
    }

    function notifyReward(uint256 amount) external {
        totalNotified    += amount;
        notifyCallCount  += 1;
        // Le contrat accepte l'USDC (pas de logique de distribution dans le mock)
    }
}

/**
 * @title BondingCurveHookTest
 * @notice Tests complets du BondingCurveHook V4.
 *
 * Architecture de test :
 *   - Déploie un PoolManager V4 en local
 *   - Mine l'adresse du hook avec HookMiner (flags BEFORE_SWAP + RETURN_DELTA + AFTER_INITIALIZE)
 *   - Déploie le hook à l'adresse minée via CREATE2 salt
 *   - Crée une pool avec notre hook (hookData = 5 params)
 *   - Teste le cycle complet : buy → sell → fees → graduation
 *
 * Deux suites de tests :
 *   - Suite A : creatorKeepBps = 10000 (100% creator, pas de distributor)
 *   - Suite B : creatorKeepBps = 5000  (50/50 creator / holders)
 */
contract BondingCurveHookTest is Test {
    using PoolIdLibrary     for PoolKey;
    using CurrencyLibrary   for Currency;

    // ─── Constantes ────────────────────────────────────────────────────────

    uint256 constant TOTAL_SUPPLY   = 1_000_000_000 * 1e18;
    uint256 constant CURVE_SUPPLY   = 800_000_000   * 1e18;
    uint256 constant LP_RESERVE     = 200_000_000   * 1e18;
    uint256 constant VIRTUAL_USDC   = 3_200_000_000;
    uint256 constant GRAD_THRESHOLD = 4_800_000_000;
    uint256 constant FEE_BPS        = 200;
    uint256 constant BPS            = 10_000;

    // ─── Acteurs ───────────────────────────────────────────────────────────

    address constant CREATOR  = address(0xC1EA);
    address constant BUYER1   = address(0xB001);
    address constant BUYER2   = address(0xB002);
    address constant TREASURY = address(0x7EA5);

    // ─── Contrats ──────────────────────────────────────────────────────────

    PoolManager          poolManager;
    BondingCurveHook     hook;
    MockERC20            usdc;
    OMToken              memeToken;
    MockFeeDistributor   feeDistributor;

    // Suite A : 100% creator, pas de distributor
    PoolKey  keyA;
    PoolId   idA;

    // Suite B : 50/50 creator / holders
    PoolKey  keyB;
    PoolId   idB;
    OMToken  memeTokenB;

    // ─── Setup ─────────────────────────────────────────────────────────────

    function setUp() public {
        // 1. Déployer PoolManager V4
        poolManager = new PoolManager();

        // 2. Mock USDC (6 dec)
        usdc = new MockERC20();
        usdc.initialize("USD Coin", "USDC", 6);

        // 3. FeeDistributor mock
        feeDistributor = new MockFeeDistributor(address(usdc));

        // 4. Miner l'adresse du hook (flags : BEFORE_SWAP + BEFORE_SWAP_RETURNS_DELTA)
        //    Pas de AFTER_INITIALIZE — init via setupCurve() dans cette version de v4-core
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG               |
            Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        );

        bytes memory constructorArgs = abi.encode(address(poolManager));
        (address hookAddr, bytes32 salt) = HookMiner.find(
            address(this),
            flags,
            type(BondingCurveHook).creationCode,
            constructorArgs
        );

        // 5. Déployer le hook à l'adresse minée
        hook = new BondingCurveHook{salt: salt}(IPoolManager(address(poolManager)));
        require(address(hook) == hookAddr, "Hook address mismatch");

        // 5b. Enregistrer le test contract comme "factory" pour pouvoir appeler setupCurve
        hook.setFactory(address(this));

        // 6. Suite A — pool avec creatorKeepBps = 10000 (tout au créateur)
        //    OMToken minte TOTAL_SUPPLY directement au hook (curve_=address(hook))
        memeToken = new OMToken("TestMeme", "TM", "", "", address(hook), CREATOR);
        deal(address(usdc), BUYER1,  2_000_000_000_000);
        deal(address(usdc), BUYER2,  2_000_000_000_000);

        (address t0A, address t1A) = address(usdc) < address(memeToken)
            ? (address(usdc), address(memeToken))
            : (address(memeToken), address(usdc));

        keyA = PoolKey({
            currency0: Currency.wrap(t0A),
            currency1: Currency.wrap(t1A),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        idA = keyA.toId();

        // initialize sans hookData (cette version de v4-core : 2 args)
        poolManager.initialize(keyA, TickMath.getSqrtPriceAtTick(0));
        // Enregistrer l'état via setupCurve (remplace hookData/afterInitialize)
        hook.setupCurve(keyA, address(memeToken), CREATOR, TREASURY, address(0), 10_000);

        // 7. Suite B — pool avec creatorKeepBps = 5000 (50% creator, 50% holders)
        memeTokenB = new OMToken("TestMemeB", "TMB", "", "", address(hook), CREATOR);

        (address t0B, address t1B) = address(usdc) < address(memeTokenB)
            ? (address(usdc), address(memeTokenB))
            : (address(memeTokenB), address(usdc));

        keyB = PoolKey({
            currency0: Currency.wrap(t0B),
            currency1: Currency.wrap(t1B),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        idB = keyB.toId();

        poolManager.initialize(keyB, TickMath.getSqrtPriceAtTick(0));
        hook.setupCurve(keyB, address(memeTokenB), CREATOR, TREASURY, address(feeDistributor), 5_000);
    }

    // ─── SUITE A : 100% creator ────────────────────────────────────────────

    /**
     * @notice L'état initial du hook est correct après initialize.
     */
    function test_A_InitialState() public view {
        BondingCurveHook.CurveState memory s = _getState(keyA);

        assertEq(s.memeToken,       address(memeToken), "memeToken");
        assertEq(s.creator,         CREATOR,            "creator");
        assertEq(s.treasury,        TREASURY,           "treasury");
        assertEq(s.feeDistributor,  address(0),         "no distributor");
        assertEq(s.creatorKeepBps,  10_000,             "100% creator");
        assertEq(s.reserveUsdc,     VIRTUAL_USDC,       "reserveUsdc");
        assertEq(s.reserveTokens,   CURVE_SUPPLY,       "reserveTokens");
        assertEq(s.realUsdcRaised,  0,                  "realUsdcRaised = 0");
        assertFalse(s.graduated,                        "not graduated");
        assertTrue(s.initialized,                       "initialized");

        // Le hook détient TOTAL_SUPPLY (CURVE_SUPPLY bonding + LP_RESERVE graduation)
        // OMToken minte directement au hook, donc 1B tokens dès le départ
        assertEq(memeToken.balanceOf(address(hook)), TOTAL_SUPPLY, "hook holds TOTAL_SUPPLY");
    }

    /**
     * @notice Un buy basique augmente les réserves correctement.
     */
    function test_A_Buy_BasicMechanics() public {
        uint256 usdcIn  = 100_000_000; // 100 USDC
        uint256 fee     = usdcIn * FEE_BPS / BPS;
        uint256 usdcNet = usdcIn - fee;

        uint256 expectedTokens = _computeTokensOut(VIRTUAL_USDC, CURVE_SUPPLY, usdcNet);

        uint256 buyerTokensBefore = memeToken.balanceOf(BUYER1);

        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(keyA, true, -int256(usdcIn), BUYER1);
        vm.stopPrank();

        uint256 tokensReceived = memeToken.balanceOf(BUYER1) - buyerTokensBefore;

        assertApproxEqRel(tokensReceived, expectedTokens, 0.01e18, "tokens received ~= expected");
        assertGt(tokensReceived, 0, "received tokens > 0");

        BondingCurveHook.CurveState memory s = _getState(keyA);
        assertGt(s.reserveUsdc,   VIRTUAL_USDC, "reserveUsdc increased");
        assertLt(s.reserveTokens, CURVE_SUPPLY,  "reserveTokens decreased");
        assertGt(s.realUsdcRaised, 0,            "raised > 0");

        console.log("Buy 100 USDC -> tokens:", tokensReceived / 1e18);
        console.log("Creator fees accrued:", s.creatorFeesAccrued);
    }

    /**
     * @notice Invariant x*y=k préservée après buy (creatorKeepBps = 10000).
     */
    function test_A_Invariant_AfterBuy() public {
        uint256 usdcIn = 200_000_000;
        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(keyA, true, -int256(usdcIn), BUYER1);
        vm.stopPrank();

        BondingCurveHook.CurveState memory s = _getState(keyA);
        uint256 k = s.reserveUsdc * s.reserveTokens;
        assertGe(k, hook.K(), "k >= K constant");
    }

    /**
     * @notice Sell après buy — retour partiel (fees prélevées).
     */
    function test_A_SellAfterBuy() public {
        uint256 usdcIn = 100_000_000;

        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(keyA, true, -int256(usdcIn), BUYER1);

        uint256 tokenBalance = memeToken.balanceOf(BUYER1);
        uint256 usdcBefore   = usdc.balanceOf(BUYER1);

        memeToken.approve(address(poolManager), tokenBalance);
        _swap(keyA, false, -int256(tokenBalance), BUYER1);
        vm.stopPrank();

        uint256 usdcReturned = usdc.balanceOf(BUYER1) - usdcBefore;
        assertLt(usdcReturned, usdcIn, "returned < invested (fees)");
        assertGt(usdcReturned, 0,      "returned > 0");

        console.log("Invested:", usdcIn / 1e6, "USDC");
        console.log("Returned:", usdcReturned / 1e6, "USDC");
    }

    /**
     * @notice Vendre au-delà de la réserve virtuelle → revert.
     */
    function test_A_Sell_CannotGoBelowVirtual() public {
        uint256 usdcIn = 10_000_000;
        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(keyA, true, -int256(usdcIn), BUYER1);

        uint256 tooMany = CURVE_SUPPLY;
        memeToken.approve(address(poolManager), tooMany);
        vm.expectRevert();
        _swap(keyA, false, -int256(tooMany), BUYER1);
        vm.stopPrank();
    }

    /**
     * @notice creatorKeepBps=10000 → toute la part créateur dans creatorFeesAccrued.
     *         Le treasury reçoit exactement 50% des fees.
     */
    function test_A_Fees_AllToCreator() public {
        uint256 usdcIn = 1_000_000_000; // 1 000 USDC

        uint256 treasuryBefore = usdc.balanceOf(TREASURY);

        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(keyA, true, -int256(usdcIn), BUYER1);
        vm.stopPrank();

        uint256 totalFee      = usdcIn * FEE_BPS / BPS;  // 20 USDC
        uint256 expectedCreator  = totalFee / 2;           // 10 USDC
        uint256 expectedTreasury = totalFee - expectedCreator;

        BondingCurveHook.CurveState memory s = _getState(keyA);

        // Tout va au créateur (pas de distributor)
        assertApproxEqRel(s.creatorFeesAccrued, expectedCreator, 0.01e18, "100% creator fees");

        // Treasury a reçu 50%
        uint256 treasuryReceived = usdc.balanceOf(TREASURY) - treasuryBefore;
        assertApproxEqRel(treasuryReceived, expectedTreasury, 0.01e18, "50% treasury fees");

        // FeeDistributor n'a rien reçu
        assertEq(feeDistributor.totalNotified, 0, "no holder rewards");

        console.log("Total fee:", totalFee / 1e6, "USDC");
        console.log("Creator:", s.creatorFeesAccrued / 1e6, "USDC");
        console.log("Treasury:", treasuryReceived / 1e6, "USDC");
    }

    /**
     * @notice Le créateur peut claim ses fees.
     */
    function test_A_ClaimFees() public {
        uint256 usdcIn = 100_000_000;
        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(keyA, true, -int256(usdcIn), BUYER1);
        vm.stopPrank();

        uint256 accrued = _getState(keyA).creatorFeesAccrued;
        assertGt(accrued, 0, "fees accrued");

        uint256 creatorBefore = usdc.balanceOf(CREATOR);
        vm.prank(CREATOR);
        hook.claimFees(keyA, CREATOR);

        assertEq(usdc.balanceOf(CREATOR) - creatorBefore, accrued, "claimed amount correct");
        assertEq(_getState(keyA).creatorFeesAccrued, 0, "fees reset after claim");
    }

    /**
     * @notice Seul le créateur peut claim.
     */
    function test_A_ClaimFees_OnlyCreator() public {
        vm.expectRevert("BondingCurveHook: not creator");
        vm.prank(BUYER1);
        hook.claimFees(keyA, BUYER1);
    }

    /**
     * @notice Graduation automatique quand GRAD_THRESHOLD est atteint.
     */
    function test_A_Graduation() public {
        _forceGraduation(keyA, memeToken);
        BondingCurveHook.CurveState memory s = _getState(keyA);
        assertTrue(s.graduated, "graduated");
        console.log("Graduated! raised:", s.realUsdcRaised / 1e6, "USDC");
    }

    /**
     * @notice Progress avant/après buy.
     */
    function test_A_GraduationProgress() public {
        assertEq(hook.graduationProgressBps(keyA), 0, "0% initially");

        uint256 usdcIn  = 2_000_000_000;
        uint256 usdcNet = usdcIn * (BPS - FEE_BPS) / BPS;
        uint256 expectedBps = usdcNet * BPS / GRAD_THRESHOLD;

        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(keyA, true, -int256(usdcIn), BUYER1);
        vm.stopPrank();

        uint256 actualBps = hook.graduationProgressBps(keyA);
        assertApproxEqAbs(actualBps, expectedBps, 100, "progress ~= correct");
        console.log("Progress:", actualBps / 100, "%");
    }

    /**
     * @notice Spot price augmente avec les achats.
     */
    function test_A_SpotPrice_Increases() public {
        uint256 priceBefore = hook.spotPrice(keyA);

        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), 500_000_000);
        _swap(keyA, true, -int256(500_000_000), BUYER1);
        vm.stopPrank();

        assertGt(hook.spotPrice(keyA), priceBefore, "price increases after buy");
    }

    /**
     * @notice Full lifecycle : buy × 5 → sell partiel → graduation.
     */
    function test_A_FullLifecycle() public {
        for (uint i = 0; i < 5; i++) {
            address buyer = address(uint160(0xABC0 + i));
            deal(address(usdc), buyer, 1_000_000_000);
            vm.startPrank(buyer);
            usdc.approve(address(poolManager), 500_000_000);
            _swap(keyA, true, -int256(500_000_000), buyer);
            vm.stopPrank();
        }

        // Vendeur partiel
        vm.startPrank(address(uint160(0xABC0)));
        uint256 bal = memeToken.balanceOf(address(uint160(0xABC0)));
        memeToken.approve(address(poolManager), bal / 2);
        _swap(keyA, false, -int256(bal / 2), address(uint160(0xABC0)));
        vm.stopPrank();

        _forceGraduation(keyA, memeToken);
        assertTrue(_getState(keyA).graduated, "GRADUATED");
        console.log("=== Token Graduated! ===");
    }

    // ─── SUITE B : 50% creator / 50% holders ──────────────────────────────

    /**
     * @notice État initial suite B — feeDistributor et creatorKeepBps=5000 enregistrés.
     */
    function test_B_InitialState() public view {
        BondingCurveHook.CurveState memory s = _getState(keyB);

        assertEq(s.feeDistributor, address(feeDistributor), "distributor set");
        assertEq(s.creatorKeepBps, 5_000,                   "50% creator");
        assertTrue(s.initialized,                            "initialized");
    }

    /**
     * @notice creatorKeepBps=5000 → 50% créateur / 50% holders / 50% treasury.
     *
     * Avec fee = 20 USDC sur 1000 USDC :
     *   treasury     = 10 USDC
     *   creatorKeep  =  5 USDC → creatorFeesAccrued
     *   holderShare  =  5 USDC → FeeDistributor.notifyReward()
     */
    function test_B_Fees_Split50_50() public {
        uint256 usdcIn = 1_000_000_000; // 1 000 USDC

        uint256 treasuryBefore = usdc.balanceOf(TREASURY);

        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(keyB, true, -int256(usdcIn), BUYER1);
        vm.stopPrank();

        uint256 totalFee         = usdcIn * FEE_BPS / BPS;  // 20 USDC
        uint256 creatorShare     = totalFee / 2;              // 10 USDC (50% fixe)
        uint256 expectedKeep     = creatorShare * 5000 / BPS; // 5 USDC (50% de la part créateur)
        uint256 expectedHolder   = creatorShare - expectedKeep;// 5 USDC
        uint256 expectedTreasury = totalFee - creatorShare;   // 10 USDC

        BondingCurveHook.CurveState memory s = _getState(keyB);

        // Créateur : 50% × 50% = 25% des fees totales
        assertApproxEqRel(s.creatorFeesAccrued, expectedKeep, 0.01e18, "creator keep ~= 25% fees");

        // FeeDistributor : 50% × 50% = 25% des fees totales
        assertApproxEqRel(feeDistributor.totalNotified, expectedHolder, 0.01e18, "holder share ~= 25%");
        assertGt(feeDistributor.notifyCallCount, 0, "notifyReward called");

        // Treasury : 50% fixe
        uint256 treasuryReceived = usdc.balanceOf(TREASURY) - treasuryBefore;
        assertApproxEqRel(treasuryReceived, expectedTreasury, 0.01e18, "treasury = 50%");

        console.log("Fee total:", totalFee / 1e6, "USDC");
        console.log("Creator keep:", s.creatorFeesAccrued / 1e6, "USDC");
        console.log("Holder share:", feeDistributor.totalNotified / 1e6, "USDC");
        console.log("Treasury:", treasuryReceived / 1e6, "USDC");
    }

    /**
     * @notice notifyReward est appelé à chaque swap (non à zéro).
     */
    function test_B_NotifyReward_CalledPerSwap() public {
        assertEq(feeDistributor.notifyCallCount, 0, "no calls before swap");

        for (uint i = 1; i <= 3; i++) {
            vm.startPrank(BUYER1);
            usdc.approve(address(poolManager), 50_000_000);
            _swap(keyB, true, -int256(50_000_000), BUYER1);
            vm.stopPrank();

            assertEq(feeDistributor.notifyCallCount, i, "notifyReward called each swap");
        }
    }

    /**
     * @notice creatorKeepBps=5000, créateur peut encore claim sa part.
     */
    function test_B_ClaimFees_Partial() public {
        uint256 usdcIn = 100_000_000;
        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(keyB, true, -int256(usdcIn), BUYER1);
        vm.stopPrank();

        uint256 accrued = _getState(keyB).creatorFeesAccrued;
        assertGt(accrued, 0, "creator has fees");

        // 5000 bps → les fees créateur = 25% du total → accrued < total fee / 2
        uint256 totalFee = usdcIn * FEE_BPS / BPS;
        assertLt(accrued, totalFee / 2, "creator gets < 50% of total (rest to holders)");

        uint256 creatorBefore = usdc.balanceOf(CREATOR);
        vm.prank(CREATOR);
        hook.claimFees(keyB, CREATOR);
        assertEq(usdc.balanceOf(CREATOR) - creatorBefore, accrued, "claimed correct amount");
    }

    /**
     * @notice Graduation suite B — les fees distribuées aux holders n'empêchent pas la graduation.
     */
    function test_B_Graduation() public {
        _forceGraduation(keyB, memeTokenB);
        assertTrue(_getState(keyB).graduated, "graduated suite B");
        assertGt(feeDistributor.totalNotified, 0, "holders received rewards during graduation run");
    }

    // ─── FUZZ ─────────────────────────────────────────────────────────────

    /**
     * @notice Fuzz buy — invariant k toujours préservée.
     */
    function testFuzz_Buy_InvariantPreserved(uint256 usdcIn) public {
        usdcIn = bound(usdcIn, 1_000_000, 2_000_000_000);
        deal(address(usdc), BUYER1, usdcIn);

        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(keyA, true, -int256(usdcIn), BUYER1);
        vm.stopPrank();

        BondingCurveHook.CurveState memory s = _getState(keyA);
        assertGe(s.reserveUsdc * s.reserveTokens, hook.K(), "k >= K");
    }

    /**
     * @notice Fuzz split : creatorKeepBps peut être n'importe quelle valeur 0–10000.
     *         Vérifie que creatorFeesAccrued + holderNotified ≈ creatorShare.
     */
    function testFuzz_FeeDistribution(uint256 keepBps) public {
        keepBps = bound(keepBps, 0, 10_000);

        // Déployer un token et une pool ad-hoc avec ce keepBps
        OMToken t = new OMToken("FuzzToken", "FZZ", TOTAL_SUPPLY, address(this));
        MockFeeDistributor fd = new MockFeeDistributor(address(usdc));

        (address c0, address c1) = address(usdc) < address(t)
            ? (address(usdc), address(t))
            : (address(t), address(usdc));

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(c0),
            currency1: Currency.wrap(c1),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        t.approve(address(hook), CURVE_SUPPLY);
        address distAddr = keepBps < BPS ? address(fd) : address(0);
        bytes memory hd  = abi.encode(address(t), CREATOR, TREASURY, distAddr, keepBps);
        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(0), hd);

        uint256 usdcIn = 100_000_000;
        deal(address(usdc), BUYER1, usdcIn);
        vm.startPrank(BUYER1);
        usdc.approve(address(poolManager), usdcIn);
        _swap(key, true, -int256(usdcIn), BUYER1);
        vm.stopPrank();

        BondingCurveHook.CurveState memory s = hook.curves(key.toId());
        uint256 totalFee     = usdcIn * FEE_BPS / BPS;
        uint256 creatorShare = totalFee / 2;
        uint256 expectedKeep = creatorShare * keepBps / BPS;

        assertApproxEqAbs(s.creatorFeesAccrued, expectedKeep, 2, "creator keep matches keepBps");

        if (keepBps < BPS) {
            uint256 expectedHolder = creatorShare - expectedKeep;
            assertApproxEqAbs(fd.totalNotified, expectedHolder, 2, "holder notified = remainder");
        }
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    function _getState(PoolKey memory key)
        internal view
        returns (BondingCurveHook.CurveState memory s)
    {
        return hook.curves(key.toId());
    }

    function _swap(
        PoolKey memory key,
        bool zeroForOne,
        int256 amountSpecified,
        address recipient
    ) internal {
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams({
            zeroForOne:        zeroForOne,
            amountSpecified:   amountSpecified,
            sqrtPriceLimitX96: zeroForOne
                ? TickMath.MIN_SQRT_PRICE + 1
                : TickMath.MAX_SQRT_PRICE - 1
        });
        poolManager.swap(key, params, abi.encode(recipient));
    }

    function _forceGraduation(PoolKey memory key, OMToken token) internal {
        uint256 needed = GRAD_THRESHOLD + (GRAD_THRESHOLD * FEE_BPS / (BPS - FEE_BPS)) + 1;
        address whale  = address(uint160(0x13370000));
        deal(address(usdc), whale, needed * 2);
        vm.startPrank(whale);
        usdc.approve(address(poolManager), type(uint256).max);
        _swap(key, true, -int256(needed), whale);
        vm.stopPrank();
    }

    function _computeTokensOut(uint256 rU, uint256 rT, uint256 usdcNet)
        internal pure
        returns (uint256)
    {
        uint256 newRU = rU + usdcNet;
        uint256 newRT = (rU * rT) / newRU;
        return rT > newRT ? rT - newRT : 0;
    }
}
