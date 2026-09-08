// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/BondingCurve.sol";
import "../src/LaunchpadFactory.sol";

/**
 * @title Interactions
 * @notice Scripts d'interaction post-déploiement sur Arc testnet :
 *         - CreateToken  : crée OMTEST avec first buy de 50 USDC
 *         - BuyTokens    : achat depuis un second wallet
 *         - PushToGrad   : pousse la courbe jusqu'à graduation
 *
 * Usage :
 *   # Créer un token
 *   forge script script/Interactions.s.sol:CreateToken \
 *     --rpc-url arc_testnet --broadcast --private-key $ALICE_PK -vvvv
 *
 *   # Acheter depuis Bob
 *   CURVE_ADDRESS=0x... forge script script/Interactions.s.sol:BuyTokens \
 *     --rpc-url arc_testnet --broadcast --private-key $BOB_PK -vvvv
 *
 *   # Pousser à la graduation
 *   CURVE_ADDRESS=0x... forge script script/Interactions.s.sol:PushToGrad \
 *     --rpc-url arc_testnet --broadcast --private-key $ALICE_PK -vvvv
 *
 * Variables d'environnement :
 *   FACTORY_ADDRESS — adresse de LaunchpadFactory déployée
 *   CURVE_ADDRESS   — adresse du clone BondingCurve (après CreateToken)
 *   ALICE_PK / BOB_PK — clés privées de test
 */

address constant USDC_ARC = 0x3600000000000000000000000000000000000000;

// ─── CreateToken ─────────────────────────────────────────────────────────────

contract CreateToken is Script {
    function run() external {
        address factoryAddr = vm.envAddress("FACTORY_ADDRESS");
        uint256 alicePk     = vm.envUint("ALICE_PK");
        address alice       = vm.addr(alicePk);

        LaunchpadFactory factory = LaunchpadFactory(factoryAddr);
        IERC20 usdc = IERC20(USDC_ARC);

        uint256 firstBuy = 50_000_000; // 50 USDC gross

        console.log("Alice     :", alice);
        console.log("Factory   :", factoryAddr);
        console.log("First buy :", firstBuy, "(USDC 6dec)");

        // Vérifier le solde USDC
        uint256 usdcBal = usdc.balanceOf(alice);
        console.log("USDC balance:", usdcBal);
        require(usdcBal >= firstBuy, "Interactions: insufficient USDC");

        vm.startBroadcast(alicePk);

        usdc.approve(factoryAddr, firstBuy);

        (address curve, address token) = factory.createToken(
            "OM Test Token",
            "OMTEST",
            "ipfs://QmPlaceholder",
            "Token de test pour le launchpad Arc OM",
            firstBuy
        );

        vm.stopBroadcast();

        console.log("\n=== TOKEN CREATED ===");
        console.log("Curve :", curve);
        console.log("Token :", token);
        console.log("Set CURVE_ADDRESS=", curve, "pour les prochains scripts");
    }
}

// ─── BuyTokens ────────────────────────────────────────────────────────────────

contract BuyTokens is Script {
    function run() external {
        address curveAddr = vm.envAddress("CURVE_ADDRESS");
        uint256 bobPk     = vm.envUint("BOB_PK");
        address bob       = vm.addr(bobPk);

        BondingCurve curve = BondingCurve(curveAddr);
        IERC20 usdc = IERC20(USDC_ARC);

        uint256 usdcIn = 100_000_000; // 100 USDC gross

        (uint256 expectedTokens,) = curve.quoteUsdcToTokens(usdcIn);

        console.log("Bob         :", bob);
        console.log("Curve       :", curveAddr);
        console.log("USDC in     :", usdcIn);
        console.log("Tokens out  :", expectedTokens);
        console.log("Spot price  :", curve.spotPrice());
        console.log("Progress bps:", curve.graduationProgressBps());

        vm.startBroadcast(bobPk);
        usdc.approve(curveAddr, usdcIn);
        curve.buy(usdcIn, expectedTokens * 99 / 100, bob); // 1% slippage tolérance
        vm.stopBroadcast();

        console.log("\n=== AFTER BUY ===");
        console.log("Spot price  :", curve.spotPrice());
        console.log("Progress bps:", curve.graduationProgressBps());
        console.log("Real raised :", curve.realUsdcRaised());
    }
}

// ─── PushToGrad ───────────────────────────────────────────────────────────────

contract PushToGrad is Script {
    function run() external {
        address curveAddr = vm.envAddress("CURVE_ADDRESS");
        uint256 alicePk   = vm.envUint("ALICE_PK");
        address alice     = vm.addr(alicePk);

        BondingCurve curve = BondingCurve(curveAddr);
        IERC20 usdc = IERC20(USDC_ARC);

        require(!curve.graduated(), "Interactions: already graduated");

        // Calculer combien il manque
        uint256 raised  = curve.realUsdcRaised();
        uint256 needed  = curve.GRAD_THRESHOLD() - raised;
        // Ajouter 10 % de marge pour couvrir les fees et le partial fill
        uint256 gross   = needed * 110 / 100;

        console.log("Alice         :", alice);
        console.log("Raised so far :", raised);
        console.log("Still needed  :", needed);
        console.log("Sending gross :", gross);

        uint256 usdcBal = usdc.balanceOf(alice);
        require(usdcBal >= gross, "Interactions: insufficient USDC");

        vm.startBroadcast(alicePk);
        usdc.approve(curveAddr, gross);
        curve.buy(gross, 0, alice);
        vm.stopBroadcast();

        console.log("\n=== RESULT ===");
        console.log("Graduated :", curve.graduated());
    }
}
