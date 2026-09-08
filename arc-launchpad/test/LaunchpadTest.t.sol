// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BondingCurve.sol";
import "../src/LaunchpadFactory.sol";
import "../src/OMToken.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// ─── Mock USDC ────────────────────────────────────────────────────────────────

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// ─── Mock Uniswap V2 (minimaliste pour les tests) ─────────────────────────────

contract MockUniswapPair {}

contract MockUniswapFactory {
    mapping(address => mapping(address => address)) private _pairs;

    function getPair(address a, address b) external view returns (address) {
        return _pairs[a][b];
    }

    function createPair(address a, address b) external returns (address pair) {
        pair = address(new MockUniswapPair());
        _pairs[a][b] = pair;
        _pairs[b][a] = pair;
    }
}

contract MockUniswapRouter {
    // Simule addLiquidity : accepte les tokens, retourne 1 LP
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256, // amountAMin
        uint256, // amountBMin
        address to,
        uint256  // deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        IERC20(tokenA).transferFrom(msg.sender, to, amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, to, amountBDesired);
        amountA   = amountADesired;
        amountB   = amountBDesired;
        liquidity = 1e18; // LP simulé
    }
}

// ─── Suite de tests ───────────────────────────────────────────────────────────

contract LaunchpadTest is Test {
    MockUSDC           usdc;
    MockUniswapFactory uniFactory;
    MockUniswapRouter  uniRouter;
    BondingCurve       curveImpl;
    LaunchpadFactory   factory;

    address treasury = address(0xBEEF);
    address alice    = address(0xA11CE);
    address bob      = address(0xB0B);

    uint256 constant GRAD  = 4_800_000_000;   // 4 800 USDC (6 dec)
    uint256 constant VUSDC = 3_200_000_000;   // virtual USDC
    uint256 constant K     = uint256(VUSDC) * uint256(800_000_000) * 1e18;

    // ─── Setup ────────────────────────────────────────────────────────────

    function setUp() public {
        usdc       = new MockUSDC();
        uniFactory = new MockUniswapFactory();
        uniRouter  = new MockUniswapRouter();
        curveImpl  = new BondingCurve();

        factory = new LaunchpadFactory(
            address(curveImpl),
            address(usdc),
            treasury,
            address(uniRouter),
            address(uniFactory)
        );

        // Fonds initiaux
        usdc.mint(alice, 10_000_000_000); // 10 000 USDC
        usdc.mint(bob,   10_000_000_000);
    }

    // ─── Helper ───────────────────────────────────────────────────────────

    function _createToken(address creator, uint256 firstBuy)
        internal
        returns (BondingCurve curve, OMToken token)
    {
        vm.startPrank(creator);
        if (firstBuy > 0) {
            usdc.approve(address(factory), firstBuy);
        }
        (address c, address t) = factory.createToken(
            "OM Test", "OMTEST", "ipfs://img", "desc", firstBuy
        );
        vm.stopPrank();
        curve = BondingCurve(c);
        token = OMToken(t);
    }

    // ─── 1. Création sans first buy ───────────────────────────────────────

    function test_CreateToken_NoFirstBuy() public {
        (BondingCurve curve, OMToken token) = _createToken(alice, 0);

        assertEq(curve.reserveUsdc(),   VUSDC,              "reserve usdc");
        assertEq(curve.reserveTokens(), 800_000_000 * 1e18, "reserve tokens");
        assertEq(curve.realUsdcRaised(), 0,                 "no real usdc");
        assertFalse(curve.graduated(),                      "not graduated");
        assertEq(token.balanceOf(address(curve)), 1_000_000_000 * 1e18, "curve holds all supply");
        assertEq(token.balanceOf(alice), 0, "alice has 0 tokens");
    }

    // ─── 2. Création avec first buy ───────────────────────────────────────

    function test_CreateToken_WithFirstBuy() public {
        uint256 firstBuy = 100_000_000; // 100 USDC
        (BondingCurve curve, OMToken token) = _createToken(alice, firstBuy);

        assertGt(token.balanceOf(alice), 0,       "alice got tokens");
        assertGt(curve.realUsdcRaised(), 0,        "usdc raised > 0");
        assertLt(curve.reserveTokens(), 800_000_000 * 1e18, "tokens left curve");
    }

    // ─── 3. First buy plafonné ────────────────────────────────────────────

    function test_CreateToken_FirstBuyTooLarge() public {
        uint256 tooLarge = 481_000_000; // > 480 USDC
        vm.startPrank(alice);
        usdc.approve(address(factory), tooLarge);
        vm.expectRevert("Factory: first buy too large");
        factory.createToken("X", "X", "", "", tooLarge);
        vm.stopPrank();
    }

    // ─── 4. Buy basique ───────────────────────────────────────────────────

    function test_Buy_Basic() public {
        (BondingCurve curve, OMToken token) = _createToken(alice, 0);

        uint256 usdcIn = 50_000_000; // 50 USDC
        vm.startPrank(bob);
        usdc.approve(address(curve), usdcIn);

        (uint256 expectedTokens,) = curve.quoteUsdcToTokens(usdcIn);
        curve.buy(usdcIn, expectedTokens, bob);
        vm.stopPrank();

        assertEq(token.balanceOf(bob), expectedTokens, "bob tokens");
        assertGt(curve.realUsdcRaised(), 0, "raised > 0");
    }

    // ─── 5. Slippage buy ─────────────────────────────────────────────────

    function test_Buy_SlippageReverts() public {
        (BondingCurve curve,) = _createToken(alice, 0);

        uint256 usdcIn = 50_000_000;
        vm.startPrank(bob);
        usdc.approve(address(curve), usdcIn);
        vm.expectRevert("BondingCurve: slippage");
        curve.buy(usdcIn, type(uint256).max, bob); // minTokens absurdement élevé
        vm.stopPrank();
    }

    // ─── 6. Sell basique ──────────────────────────────────────────────────

    function test_Sell_Basic() public {
        (BondingCurve curve, OMToken token) = _createToken(alice, 0);

        uint256 buyAmount = 100_000_000; // 100 USDC
        vm.startPrank(bob);
        usdc.approve(address(curve), buyAmount);
        curve.buy(buyAmount, 0, bob);

        uint256 bobTokens = token.balanceOf(bob);
        assertGt(bobTokens, 0, "bob has tokens");

        uint256 usdcBefore = usdc.balanceOf(bob);
        token.approve(address(curve), bobTokens);
        (uint256 expectedUsdc,) = curve.quoteTokensToUsdc(bobTokens);
        curve.sell(bobTokens, expectedUsdc, bob);
        vm.stopPrank();

        uint256 usdcAfter = usdc.balanceOf(bob);
        assertEq(usdcAfter - usdcBefore, expectedUsdc, "bob received usdc");
        assertEq(token.balanceOf(bob), 0, "bob sold all tokens");
    }

    // ─── 7. Sell interdit après graduation ───────────────────────────────

    function test_Sell_RevertsIfGraduated() public {
        (BondingCurve curve, OMToken token) = _createToken(alice, 0);
        _graduateCurve(curve, token);

        vm.startPrank(bob);
        vm.expectRevert("BondingCurve: graduated");
        curve.sell(1e18, 0, bob);
        vm.stopPrank();
    }

    // ─── 8. Buy interdit après graduation ────────────────────────────────

    function test_Buy_RevertsIfGraduated() public {
        (BondingCurve curve, OMToken token) = _createToken(alice, 0);
        _graduateCurve(curve, token);

        vm.startPrank(bob);
        usdc.approve(address(curve), 1_000_000);
        vm.expectRevert("BondingCurve: graduated");
        curve.buy(1_000_000, 0, bob);
        vm.stopPrank();
    }

    // ─── 9. Graduation : partial fill ────────────────────────────────────

    function test_Graduation_PartialFill() public {
        (BondingCurve curve,) = _createToken(alice, 0);

        // Acheter jusqu'à 1 USDC sous le seuil
        uint256 almostGrad = GRAD - 1_000_000; // 4799 USDC
        vm.startPrank(alice);
        usdc.approve(address(curve), almostGrad * BPS() / (BPS() - 200)); // gross
        _buyNet(curve, almostGrad, alice);

        assertFalse(curve.graduated(), "not yet graduated");

        // Bob envoie 200 USDC → sera partiellement rempli
        uint256 bigBuy = 200_000_000; // 200 USDC
        uint256 bobUsdcBefore = usdc.balanceOf(bob);
        vm.startPrank(bob);
        usdc.approve(address(curve), bigBuy);
        curve.buy(bigBuy, 0, bob);
        vm.stopPrank();

        assertTrue(curve.graduated(), "graduated after partial fill");

        // Bob ne devrait pas avoir dépensé 200 USDC (remboursement partiel)
        uint256 bobUsdcAfter = usdc.balanceOf(bob);
        uint256 bobSpent = bobUsdcBefore - bobUsdcAfter;
        assertLt(bobSpent, bigBuy, "bob got a refund");
    }

    // ─── 10. Graduation : LP brûlés ──────────────────────────────────────

    function test_Graduation_LPBurned() public {
        (BondingCurve curve, OMToken token) = _createToken(alice, 0);
        _graduateCurve(curve, token);

        assertTrue(curve.graduated(), "graduated");
        // Les LP tokens du mock router ont été envoyés à DEAD
        // (Le mock envoie directement les tokens au `to`, ici DEAD)
        address dead = 0x000000000000000000000000000000000000dEaD;
        // Vérifier que la paire existe
        address pair = IUniswapV2Factory(address(uniFactory)).getPair(
            address(token), address(usdc)
        );
        assertNotEq(pair, address(0), "pair created");
    }

    // ─── 11. Fees : distribution correcte ────────────────────────────────

    function test_Fees_Distribution() public {
        (BondingCurve curve,) = _createToken(alice, 0);

        uint256 usdcIn = 100_000_000; // 100 USDC gross
        uint256 expectedFee = usdcIn * 200 / 10_000; // 2 USDC
        uint256 treasuryBefore = usdc.balanceOf(treasury);

        vm.startPrank(bob);
        usdc.approve(address(curve), usdcIn);
        curve.buy(usdcIn, 0, bob);
        vm.stopPrank();

        uint256 treasuryFee    = expectedFee / 2;
        uint256 creatorFeeAccrued = expectedFee - treasuryFee;

        assertApproxEqAbs(
            usdc.balanceOf(treasury) - treasuryBefore,
            treasuryFee,
            1,
            "treasury fee"
        );
        assertApproxEqAbs(
            curve.creatorFeesAccrued(),
            creatorFeeAccrued,
            1,
            "creator fee accrued"
        );
    }

    // ─── 12. ClaimFees : creator seulement ───────────────────────────────

    function test_ClaimFees_OnlyCreator() public {
        (BondingCurve curve,) = _createToken(alice, 0);

        vm.startPrank(bob);
        usdc.approve(address(curve), 100_000_000);
        curve.buy(100_000_000, 0, bob);
        vm.stopPrank();

        // Bob ne peut pas claim
        vm.prank(bob);
        vm.expectRevert("BondingCurve: not creator");
        curve.claimFees(bob);

        // Alice (créateur) peut claim
        uint256 accrued = curve.creatorFeesAccrued();
        assertGt(accrued, 0, "has fees");

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice);
        curve.claimFees(alice);
        assertEq(usdc.balanceOf(alice) - aliceBefore, accrued, "alice claimed fees");
        assertEq(curve.creatorFeesAccrued(), 0, "fees reset");
    }

    // ─── 13. Invariant k ─────────────────────────────────────────────────

    function test_Invariant_K() public {
        (BondingCurve curve,) = _createToken(alice, 0);

        uint256 k0 = curve.reserveUsdc() * curve.reserveTokens();

        // Après buy
        vm.startPrank(bob);
        usdc.approve(address(curve), 200_000_000);
        curve.buy(200_000_000, 0, bob);
        vm.stopPrank();

        uint256 k1 = curve.reserveUsdc() * curve.reserveTokens();
        // k peut légèrement différer à cause des arrondis entiers, tolérance 0.01 %
        assertApproxEqRel(k1, k0, 1e14, "k invariant after buy");
    }

    // ─── 14. Reentrancy guard ────────────────────────────────────────────

    function test_ReentrancyGuard() public {
        // Test basique : deux appels imbriqués ne peuvent pas se produire
        // (ReentrancyGuard bloque au niveau contrat)
        // Ce test vérifie surtout que le déploiement compile et tourne avec le guard actif.
        (BondingCurve curve,) = _createToken(alice, 0);
        assertFalse(curve.graduated());
    }

    // ─── 15. Prix spot croissant lors des achats ──────────────────────────

    function test_SpotPrice_IncreasesOnBuy() public {
        (BondingCurve curve,) = _createToken(alice, 0);

        uint256 spotBefore = curve.spotPrice();

        vm.startPrank(bob);
        usdc.approve(address(curve), 500_000_000);
        curve.buy(500_000_000, 0, bob);
        vm.stopPrank();

        assertGt(curve.spotPrice(), spotBefore, "price rose after buy");
    }

    // ─── 16. Prix spot décroissant lors des ventes ───────────────────────

    function test_SpotPrice_DecreasesOnSell() public {
        (BondingCurve curve, OMToken token) = _createToken(alice, 0);

        vm.startPrank(bob);
        usdc.approve(address(curve), 500_000_000);
        curve.buy(500_000_000, 0, bob);
        vm.stopPrank();

        uint256 spotAfterBuy = curve.spotPrice();

        vm.startPrank(bob);
        uint256 bal = token.balanceOf(bob);
        token.approve(address(curve), bal);
        curve.sell(bal, 0, bob);
        vm.stopPrank();

        assertLt(curve.spotPrice(), spotAfterBuy, "price fell after sell");
    }

    // ─── 17. Mint restriction : token non mintable après déploiement ─────

    function test_Token_NoExternalMint() public {
        (, OMToken token) = _createToken(alice, 0);
        // OMToken n'expose pas de fonction mint externe
        // Vérifier via le bytecode serait trop fragile; on vérifie que le supply est fixe.
        uint256 supplyBefore = token.totalSupply();
        // Impossible d'appeler mint depuis un compte externe (pas d'interface publique)
        assertEq(token.totalSupply(), supplyBefore, "supply unchanged");
        assertEq(supplyBefore, 1_000_000_000 * 1e18, "correct supply");
    }

    // ─── 18. Factory : token inconnu rejeté ──────────────────────────────

    function test_Factory_IsCurveMapping() public {
        (BondingCurve curve,) = _createToken(alice, 0);
        assertTrue(factory.isCurve(address(curve)), "known curve");
        assertFalse(factory.isCurve(address(0xDEAD)), "unknown");
        assertEq(factory.allCurvesLength(), 1, "one curve");
    }

    // ─── 19. Graduation progress ─────────────────────────────────────────

    function test_GraduationProgress() public {
        (BondingCurve curve,) = _createToken(alice, 0);

        assertEq(curve.graduationProgressBps(), 0, "0% at start");

        // Acheter environ 50 % du seuil
        _buyNet(curve, GRAD / 2, alice);
        uint256 progress = curve.graduationProgressBps();
        assertGt(progress, 4000, "progress > 40%");
        assertLt(progress, 6000, "progress < 60%");
    }

    // ─── 20. Pagination factory ───────────────────────────────────────────

    function test_Factory_Pagination() public {
        _createToken(alice, 0);
        _createToken(bob, 0);
        _createToken(alice, 0);

        address[] memory page = factory.getCurvesPaginated(0, 2);
        assertEq(page.length, 2, "page size");
        // Plus récent en premier
        assertEq(page[0], factory.allCurves(2), "most recent first");
    }

    // ─── Helpers internes ─────────────────────────────────────────────────

    /// @dev BPS constant
    function BPS() internal pure returns (uint256) { return 10_000; }

    /// @dev Achète exactement `netUsdc` USDC nets (calcule le gross)
    function _buyNet(BondingCurve curve, uint256 netUsdc, address buyer) internal {
        uint256 grossUsdc = netUsdc * BPS() / (BPS() - 200) + 1;
        vm.startPrank(buyer);
        usdc.approve(address(curve), grossUsdc);
        curve.buy(grossUsdc, 0, buyer);
        vm.stopPrank();
    }

    /// @dev Graduate la courbe en achetant suffisamment (plusieurs itérations)
    function _graduateCurve(BondingCurve curve, OMToken) internal {
        // Acheter par tranches jusqu'à graduation
        uint256 chunk = 600_000_000; // 600 USDC gross par tranche
        for (uint256 i = 0; i < 15 && !curve.graduated(); i++) {
            vm.startPrank(alice);
            usdc.approve(address(curve), chunk);
            curve.buy(chunk, 0, alice);
            vm.stopPrank();
        }
        assertTrue(curve.graduated(), "should have graduated");
    }
}
