// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/BondingCurve.sol";
import "../src/GenericBondingCurve.sol";
import "../src/LaunchpadFactory.sol";
import "../src/WhitelistRegistry.sol";
import "../src/MockXStock.sol";

/**
 * @title Deploy
 * @notice Déploie l'intégralité du launchpad OM sur Arc testnet/mainnet.
 *
 * Usage :
 *   forge script script/Deploy.s.sol \
 *     --rpc-url arc_testnet \
 *     --broadcast \
 *     --private-key $DEPLOYER_PK \
 *     -vvvv
 *
 * Variables d'environnement requises :
 *   DEPLOYER_PK  — clé privée du déployeur
 *   TREASURY     — adresse treasury OM
 *
 * Adresses Arc testnet :
 *   USDC     : 0x3600000000000000000000000000000000000000
 *   V2Router : 0x54599C3e0bcb99ca37b286242b5eC5D331AB9D18
 *   V2Factory: 0xB56B00C38EF85633A789644415A16b4C8ea12EF8
 */
contract Deploy is Script {
    // ─── Adresses Arc testnet ─────────────────────────────────────────────
    address constant USDC_ARC        = 0x3600000000000000000000000000000000000000;
    address constant UNI_ROUTER_ARC  = 0x54599C3e0bcb99ca37b286242b5eC5D331AB9D18;
    address constant UNI_FACTORY_ARC = 0xB56B00C38EF85633A789644415A16b4C8ea12EF8;

    function run() external {
        address treasury   = vm.envAddress("TREASURY");
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address deployer   = vm.addr(deployerPk);

        console.log("=== OM Launchpad Deploy ===");
        console.log("Deployer  :", deployer);
        console.log("Treasury  :", treasury);
        console.log("Network   : Arc Testnet (chainId 5042002)");

        vm.startBroadcast(deployerPk);

        // 1. Implémentation BondingCurve (USDC-paired)
        BondingCurve curveImpl = new BondingCurve();
        console.log("BondingCurve impl       :", address(curveImpl));

        // 2. Implémentation GenericBondingCurve (stock-paired)
        GenericBondingCurve genericCurveImpl = new GenericBondingCurve();
        console.log("GenericBondingCurve impl:", address(genericCurveImpl));

        // 3. WhitelistRegistry
        WhitelistRegistry registry = new WhitelistRegistry(deployer);
        console.log("WhitelistRegistry       :", address(registry));

        // 4. Mock xStock tokens (testnet uniquement)
        MockXStock xNVDA = new MockXStock("Nvidia Stock Token",       "xNVDA");
        MockXStock xTSLA = new MockXStock("Tesla Stock Token",        "xTSLA");
        MockXStock xMSTR = new MockXStock("MicroStrategy Stock Token","xMSTR");
        MockXStock xAAPL = new MockXStock("Apple Stock Token",        "xAAPL");
        MockXStock xSPY  = new MockXStock("S&P 500 ETF Token",        "xSPY");
        console.log("xNVDA                   :", address(xNVDA));
        console.log("xTSLA                   :", address(xTSLA));
        console.log("xMSTR                   :", address(xMSTR));
        console.log("xAAPL                   :", address(xAAPL));
        console.log("xSPY                    :", address(xSPY));

        // 5. Ajouter les mocks dans le registry
        registry.addAsset(
            address(xNVDA), "Nvidia Stock Token", "xNVDA",
            "https://cdn.omdot.fun/stocks/nvda.svg", 6
        );
        registry.addAsset(
            address(xTSLA), "Tesla Stock Token", "xTSLA",
            "https://cdn.omdot.fun/stocks/tsla.svg", 6
        );
        registry.addAsset(
            address(xMSTR), "MicroStrategy Stock Token", "xMSTR",
            "https://cdn.omdot.fun/stocks/mstr.svg", 6
        );
        registry.addAsset(
            address(xAAPL), "Apple Stock Token", "xAAPL",
            "https://cdn.omdot.fun/stocks/aapl.svg", 6
        );
        registry.addAsset(
            address(xSPY), "S&P 500 ETF Token", "xSPY",
            "https://cdn.omdot.fun/stocks/spy.svg", 6
        );
        console.log("Registry: 5 assets whitelisted");

        // 6. LaunchpadFactory (USDC + stock-paired)
        LaunchpadFactory factory = new LaunchpadFactory(
            address(curveImpl),
            address(genericCurveImpl),
            USDC_ARC,
            treasury,
            UNI_ROUTER_ARC,
            UNI_FACTORY_ARC,
            address(registry)
        );
        console.log("LaunchpadFactory        :", address(factory));

        // 7. Mint quelques tokens de test pour le deployer (faucet interne)
        // 10 000 de chaque pour tester
        uint256 faucetAmount = 10_000 * 1e6; // 10 000 unités (6 dec)
        xNVDA.mint(deployer, faucetAmount);
        xTSLA.mint(deployer, faucetAmount);
        xMSTR.mint(deployer, faucetAmount);
        xAAPL.mint(deployer, faucetAmount);
        xSPY.mint(deployer,  faucetAmount);
        console.log("Minted 10 000 of each xStock to deployer");

        vm.stopBroadcast();

        // Résumé
        console.log("\n=== DEPLOY SUMMARY ===");
        console.log("BondingCurve impl       :", address(curveImpl));
        console.log("GenericBondingCurve impl:", address(genericCurveImpl));
        console.log("WhitelistRegistry       :", address(registry));
        console.log("LaunchpadFactory        :", address(factory));
        console.log("xNVDA                   :", address(xNVDA));
        console.log("xTSLA                   :", address(xTSLA));
        console.log("xMSTR                   :", address(xMSTR));
        console.log("xAAPL                   :", address(xAAPL));
        console.log("xSPY                    :", address(xSPY));
        console.log("======================");
    }
}
