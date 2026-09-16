// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {Hooks}            from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager}     from "v4-core/src/interfaces/IPoolManager.sol";
import {HookMiner}        from "v4-periphery/src/utils/HookMiner.sol";
import {BondingCurveHook} from "../src/BondingCurveHook.sol";
import {LaunchpadFactoryV4} from "../src/LaunchpadFactoryV4.sol";

/**
 * @title DeployV4
 * @notice Script de déploiement sur Arc Mainnet avec Uniswap V4.
 *
 * Prérequis :
 *   - Uniswap V4 PoolManager déployé sur Arc mainnet
 *   - Adresses V4 dans Constants.sol
 *
 * Usage :
 *   forge script script/DeployV4.s.sol --rpc-url arc_mainnet --broadcast --verify
 *
 * Variables d'environnement requises :
 *   DEPLOYER_PRIVATE_KEY  — clé privée du déployeur
 *   ARC_V4_POOL_MANAGER   — adresse du PoolManager V4 sur Arc
 *   TREASURY              — adresse de la treasury
 */
contract DeployV4 is Script {

    // ─── Adresses Arc Mainnet ──────────────────────────────────────────────
    // ⚠️  À mettre à jour quand les adresses V4 seront confirmées sur Arc mainnet
    address constant USDC_ARC_MAINNET = 0x3600000000000000000000000000000000000000;
    address V4_POOL_MANAGER; // lu depuis l'env

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        V4_POOL_MANAGER     = vm.envAddress("ARC_V4_POOL_MANAGER");
        address treasury    = vm.envAddress("TREASURY");

        vm.startBroadcast(deployerKey);

        // 1. Miner l'adresse du BondingCurveHook
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG          |
            Hooks.BEFORE_SWAP_RETURN_DELTA  |
            Hooks.AFTER_INITIALIZE_FLAG
        );

        bytes memory constructorArgs = abi.encode(V4_POOL_MANAGER);
        (address hookAddr, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,   // deployer déterministe (0x4e59b44...956C sur Arc)
            flags,
            type(BondingCurveHook).creationCode,
            constructorArgs
        );

        // 2. Déployer le hook via CREATE2
        BondingCurveHook hook = new BondingCurveHook{salt: salt}(
            IPoolManager(V4_POOL_MANAGER)
        );
        require(address(hook) == hookAddr, "Hook address mismatch");
        console.log("BondingCurveHook deployed at:", address(hook));

        // 3. Déployer la factory
        LaunchpadFactoryV4 factory = new LaunchpadFactoryV4(
            USDC_ARC_MAINNET,
            V4_POOL_MANAGER,
            address(hook),
            treasury
        );
        console.log("LaunchpadFactoryV4 deployed at:", address(factory));

        vm.stopBroadcast();

        // 4. Afficher le résumé
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Network:            Arc Mainnet (5042)");
        console.log("PoolManager:       ", V4_POOL_MANAGER);
        console.log("BondingCurveHook:  ", address(hook));
        console.log("LaunchpadFactoryV4:", address(factory));
        console.log("USDC:              ", USDC_ARC_MAINNET);
        console.log("Treasury:          ", treasury);
        console.log("==========================\n");
        console.log("NOTE: Mettez a jour ADDRESSES_V4.md avec ces adresses");
        console.log("NOTE: Mettez a jour lib/arc-launchpad.ts avec la nouvelle factory ABI");
    }

    // Adresse du déployeur CREATE2 déterministe sur Arc
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
}
