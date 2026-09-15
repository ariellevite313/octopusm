// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/BondingCurve.sol";
import "../src/GenericBondingCurve.sol";
import "../src/V3LPVault.sol";
import "../src/FeeDistributor.sol";
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
 * Adresses Arc :
 *   USDC     : 0x3600000000000000000000000000000000000000  (gas token natif)
 *   NFPM V3  : 0x6049c9a0e26405c0985f9e3685c87d0ae917f82b  (NonfungiblePositionManager)
 */
contract Deploy is Script {
    // ─── Adresses Arc (testnet 5042002 / mainnet 5042) ───────────────────────
    address constant USDC_ARC = 0x3600000000000000000000000000000000000000;
    // NFPM est hard-codé dans V3LPVault.sol et BondingCurve.sol — pas besoin ici

    function run() external {
        address treasury   = vm.envAddress("TREASURY");
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address deployer   = vm.addr(deployerPk);

        console.log("=== OM Launchpad Deploy ===");
        console.log("Deployer  :", deployer);
        console.log("Treasury  :", treasury);
        console.log("Network   : Arc (chainId 5042002 testnet / 5042 mainnet)");

        vm.startBroadcast(deployerPk);

        // 1. Implémentation BondingCurve (USDC-paired)
        BondingCurve curveImpl = new BondingCurve();
        console.log("BondingCurve impl        :", address(curveImpl));

        // 2. Implémentation GenericBondingCurve (stock-paired)
        GenericBondingCurve genericCurveImpl = new GenericBondingCurve();
        console.log("GenericBondingCurve impl :", address(genericCurveImpl));

        // 3. Implémentation V3LPVault (clone template)
        V3LPVault vaultImpl = new V3LPVault();
        console.log("V3LPVault impl           :", address(vaultImpl));

        // 4. Implémentation FeeDistributor (clone template)
        FeeDistributor distributorImpl = new FeeDistributor();
        console.log("FeeDistributor impl      :", address(distributorImpl));

        // 5. WhitelistRegistry
        WhitelistRegistry registry = new WhitelistRegistry(deployer);
        console.log("WhitelistRegistry        :", address(registry));

        // 6. Mock xStock tokens (testnet uniquement)
        MockXStock xNVDA = new MockXStock("Nvidia Stock Token",        "xNVDA");
        MockXStock xTSLA = new MockXStock("Tesla Stock Token",         "xTSLA");
        MockXStock xMSTR = new MockXStock("MicroStrategy Stock Token", "xMSTR");
        MockXStock xAAPL = new MockXStock("Apple Stock Token",         "xAAPL");
        MockXStock xSPY  = new MockXStock("S&P 500 ETF Token",         "xSPY");
        console.log("xNVDA                    :", address(xNVDA));
        console.log("xTSLA                    :", address(xTSLA));
        console.log("xMSTR                    :", address(xMSTR));
        console.log("xAAPL                    :", address(xAAPL));
        console.log("xSPY                     :", address(xSPY));

        // 7. Ajouter les mocks dans le registry
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

        // 8. LaunchpadFactory — nouveau constructeur 7 params
        LaunchpadFactory factory = new LaunchpadFactory(
            address(curveImpl),          // BondingCurve impl (USDC-paired)
            address(genericCurveImpl),   // GenericBondingCurve impl (stock-paired)
            address(vaultImpl),          // V3LPVault impl
            address(distributorImpl),    // FeeDistributor impl
            USDC_ARC,                    // USDC (gas token Arc)
            treasury,                    // treasury OM
            address(registry)            // WhitelistRegistry
        );
        console.log("LaunchpadFactory         :", address(factory));

        // 9. Mint quelques tokens de test pour le deployer (faucet interne)
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
        console.log("BondingCurve impl        :", address(curveImpl));
        console.log("GenericBondingCurve impl :", address(genericCurveImpl));
        console.log("V3LPVault impl           :", address(vaultImpl));
        console.log("FeeDistributor impl      :", address(distributorImpl));
        console.log("WhitelistRegistry        :", address(registry));
        console.log("LaunchpadFactory         :", address(factory));
        console.log("--- xStock mocks ---");
        console.log("xNVDA                    :", address(xNVDA));
        console.log("xTSLA                    :", address(xTSLA));
        console.log("xMSTR                    :", address(xMSTR));
        console.log("xAAPL                    :", address(xAAPL));
        console.log("xSPY                     :", address(xSPY));
        console.log("======================");
        console.log("NOTE: Copier LaunchpadFactory dans .env.local (NEXT_PUBLIC_LAUNCHPAD_FACTORY_ADDRESS)");
        console.log("NOTE: Verifier NFPM sur Arc: 0x6049c9a0e26405c0985f9e3685c87d0ae917f82b");
    }
}
