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

contract Deploy is Script {
    // Arc testnet
    address constant USDC_ARC = 0x3600000000000000000000000000000000000000;

    function run() external {
        address treasury   = vm.envAddress("TREASURY");
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address deployer   = vm.addr(deployerPk);

        console.log("=== OM Launchpad Deploy (V3) ===");
        console.log("Deployer :", deployer);
        console.log("Treasury :", treasury);

        vm.startBroadcast(deployerPk);

        // ── Implementations ────────────────────────────────────────────────
        BondingCurve        curveImpl        = new BondingCurve();
        GenericBondingCurve genericCurveImpl = new GenericBondingCurve();
        V3LPVault           vaultImpl        = new V3LPVault();
        FeeDistributor      distributorImpl  = new FeeDistributor();

        // ── WhitelistRegistry ──────────────────────────────────────────────
        WhitelistRegistry registry = new WhitelistRegistry(deployer);

        // ── Mock xStocks (testnet only) ────────────────────────────────────
        MockXStock xNVDA = new MockXStock("Nvidia Stock Token",        "xNVDA");
        MockXStock xTSLA = new MockXStock("Tesla Stock Token",         "xTSLA");
        MockXStock xMSTR = new MockXStock("MicroStrategy Stock Token", "xMSTR");
        MockXStock xAAPL = new MockXStock("Apple Stock Token",         "xAAPL");
        MockXStock xSPY  = new MockXStock("S&P 500 ETF Token",         "xSPY");

        registry.addAsset(address(xNVDA), "Nvidia Stock Token",        "xNVDA", "https://cdn.omdot.fun/stocks/nvda.svg", 6);
        registry.addAsset(address(xTSLA), "Tesla Stock Token",         "xTSLA", "https://cdn.omdot.fun/stocks/tsla.svg", 6);
        registry.addAsset(address(xMSTR), "MicroStrategy Stock Token", "xMSTR", "https://cdn.omdot.fun/stocks/mstr.svg", 6);
        registry.addAsset(address(xAAPL), "Apple Stock Token",         "xAAPL", "https://cdn.omdot.fun/stocks/aapl.svg", 6);
        registry.addAsset(address(xSPY),  "S&P 500 ETF Token",         "xSPY",  "https://cdn.omdot.fun/stocks/spy.svg",  6);

        // ── LaunchpadFactory ───────────────────────────────────────────────
        LaunchpadFactory factory = new LaunchpadFactory(
            address(curveImpl),
            address(genericCurveImpl),
            address(vaultImpl),
            address(distributorImpl),
            USDC_ARC,
            treasury,
            address(registry)
        );

        // ── Faucet xStocks au deployer ─────────────────────────────────────
        uint256 faucet = 10_000 * 1e6;
        xNVDA.mint(deployer, faucet); xTSLA.mint(deployer, faucet);
        xMSTR.mint(deployer, faucet); xAAPL.mint(deployer, faucet);
        xSPY.mint(deployer,  faucet);

        vm.stopBroadcast();

        console.log("\n=== DEPLOY SUMMARY ===");
        console.log("LaunchpadFactory         :", address(factory));
        console.log("BondingCurve impl        :", address(curveImpl));
        console.log("GenericBondingCurve impl :", address(genericCurveImpl));
        console.log("V3LPVault impl           :", address(vaultImpl));
        console.log("FeeDistributor impl      :", address(distributorImpl));
        console.log("WhitelistRegistry        :", address(registry));
        console.log("xNVDA                    :", address(xNVDA));
        console.log("xTSLA                    :", address(xTSLA));
        console.log("xMSTR                    :", address(xMSTR));
        console.log("xAAPL                    :", address(xAAPL));
        console.log("xSPY                     :", address(xSPY));
        console.log("======================");
    }
}
