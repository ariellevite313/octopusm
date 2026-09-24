// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/LaunchpadFactoryArcV2.sol";

/**
 * @notice Redéploie UNIQUEMENT LaunchpadFactoryArcV2 en réutilisant les implémentations
 *         BondingCurveArcV2 et GraduationVaultV4 déjà déployées sur Arc mainnet.
 *
 *         Raison : OMToken.sol a été corrigé (bug auto-settle dividendes pour le
 *         destinataire passif). La factory embarque le bytecode de OMToken via
 *         `new OMToken(...)` — redéployer la factory suffit pour que tous les
 *         nouveaux tokens utilisent l'OMToken corrigé.
 *
 *         Les tokens DÉJÀ déployés conservent l'ancien OMToken. Ils ne sont pas
 *         affectés par ce redéploiement.
 *
 * Usage :
 *   forge script script/RedeployFactoryArcV2.s.sol \
 *     --rpc-url https://rpc.mainnet.arc.io \
 *     --private-key $DEPLOYER_PK \
 *     --broadcast \
 *     --legacy
 *
 * Variables d'env requises :
 *   DEPLOYER_PK   = clé privée du déployeur
 *   TREASURY_ADDR = adresse de la treasury (même qu'avant)
 *   CURVE_IMPL    = 0x269C958be7DC92BAaDa2705aE40BccAE70D779Ee
 *   VAULT_IMPL    = 0x57dC80fbd32161b05Ee5C08B145AFaA90E786D6B
 */
contract RedeployFactoryArcV2 is Script {

    function run() external {
        address treasury  = vm.envAddress("TREASURY_ADDR");
        address curveImpl = vm.envAddress("CURVE_IMPL");
        address vaultImpl = vm.envAddress("VAULT_IMPL");
        uint256 pk        = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(pk);

        LaunchpadFactoryArcV2 factory = new LaunchpadFactoryArcV2(
            curveImpl,
            vaultImpl,
            treasury
        );

        vm.stopBroadcast();

        console.log("=== LaunchpadFactoryArcV2 redeployee (OMToken fix) ===");
        console.log("Nouvelle factory   : ", address(factory));
        console.log("BondingCurve impl  : ", curveImpl, " (inchange)");
        console.log("GraduationVault impl:", vaultImpl, " (inchange)");
        console.log("Treasury           : ", treasury);
        console.log("");
        console.log("--- Mettre a jour dans lib/arc-launchpad.ts ---");
        console.log("ARC_FACTORY_V2_ADDRESS =", address(factory));
        console.log("");
        console.log("--- Mettre a jour dans ADDRESSES.md ---");
        console.log("LaunchpadFactoryArcV2 =", address(factory));
    }
}
