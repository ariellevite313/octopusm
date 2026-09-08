// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/BondingCurve.sol";
import "../src/LaunchpadFactory.sol";

/**
 * @title Deploy
 * @notice Déploie BondingCurve (implémentation) + LaunchpadFactory sur Arc testnet.
 *
 * Usage :
 *   forge script script/Deploy.s.sol \
 *     --rpc-url arc_testnet \
 *     --broadcast \
 *     --private-key $DEPLOYER_PK \
 *     -vvvv
 *
 * Variables d'environnement requises :
 *   DEPLOYER_PK   — clé privée du déployeur (MetaMask ou wallet dédié)
 *   TREASURY      — adresse treasury OM (recevra 50 % des fees)
 *
 * Adresses Arc testnet (hardcodées) :
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
        address treasury = vm.envAddress("TREASURY");
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(deployerPk);

        console.log("Deployer  :", deployer);
        console.log("Treasury  :", treasury);
        console.log("USDC      :", USDC_ARC);
        console.log("V2 Router :", UNI_ROUTER_ARC);
        console.log("V2 Factory:", UNI_FACTORY_ARC);

        vm.startBroadcast(deployerPk);

        // 1. Déployer l'implémentation BondingCurve (ne sera jamais utilisée directement)
        BondingCurve curveImpl = new BondingCurve();
        console.log("BondingCurve impl:", address(curveImpl));

        // 2. Déployer la factory
        LaunchpadFactory factory = new LaunchpadFactory(
            address(curveImpl),
            USDC_ARC,
            treasury,
            UNI_ROUTER_ARC,
            UNI_FACTORY_ARC
        );
        console.log("LaunchpadFactory :", address(factory));

        vm.stopBroadcast();

        // Résumé pour ADDRESSES.md
        console.log("\n=== ADDRESSES ===");
        console.log("BondingCurve impl:", address(curveImpl));
        console.log("LaunchpadFactory :", address(factory));
        console.log("Network          : Arc Testnet");
    }
}
