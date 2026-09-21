// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/BondingCurveArcV2.sol";
import "../src/GraduationVaultV4.sol";
import "../src/LaunchpadFactoryArcV2.sol";

/**
 * @notice Déploie BondingCurveArcV2 + GraduationVaultV4 + LaunchpadFactoryArcV2 sur Arc mainnet.
 *
 * Usage :
 *   forge script script/DeployArcV2.s.sol \
 *     --rpc-url https://rpc.mainnet.arc.io \
 *     --private-key $DEPLOYER_PK \
 *     --broadcast \
 *     --legacy
 *
 * Variables d'env requises :
 *   DEPLOYER_PK   = clé privée du déployeur
 *   TREASURY_ADDR = adresse de la treasury
 */
contract DeployArcV2 is Script {

    function run() external {
        address treasury = vm.envAddress("TREASURY_ADDR");
        uint256 pk       = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(pk);

        // 1. Déployer les implémentations (clones EIP-1167)
        BondingCurveArcV2  curveImpl = new BondingCurveArcV2();
        GraduationVaultV4  vaultImpl = new GraduationVaultV4();

        // 2. Déployer la factory
        LaunchpadFactoryArcV2 factory = new LaunchpadFactoryArcV2(
            address(curveImpl),
            address(vaultImpl),
            treasury
        );

        vm.stopBroadcast();

        console.log("=== Arc Launchpad V2 deploye ===");
        console.log("BondingCurveArcV2 impl : ", address(curveImpl));
        console.log("GraduationVaultV4 impl : ", address(vaultImpl));
        console.log("LaunchpadFactoryArcV2  : ", address(factory));
        console.log("Treasury               : ", treasury);
        console.log("");
        console.log("--- A mettre dans lib/arc-launchpad.ts ---");
        console.log("ARC_FACTORY_V2_ADDRESS  =", address(factory));
        console.log("ARC_CURVE_V2_IMPL       =", address(curveImpl));
        console.log("ARC_VAULT_V4_IMPL       =", address(vaultImpl));
    }
}
