// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {Hooks}              from "v4-core/src/libraries/Hooks.sol";
import {IPoolManager}       from "v4-core/src/interfaces/IPoolManager.sol";
import {HookMiner}          from "v4-periphery/test/shared/HookMiner.sol";
import {BondingCurveHook}   from "../src/BondingCurveHook.sol";
import {BondingCurveRouter} from "../src/BondingCurveRouter.sol";
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

    // ─── Adresses Arc Mainnet (Chain ID 5042) ─────────────────────────────
    // USDC est le token NATIF d'Arc = address(0) en Uniswap V4
    address constant USDC_ARC_MAINNET        = address(0);
    address constant ARC_V4_POOL_MANAGER     = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant ARC_V4_POSITION_MANAGER = 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B;
    address constant ARC_PERMIT2             = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // Uniswap V2 sur Arc Mainnet (façade pour indexation GMGN/DexScreener)
    address constant ARC_V2_FACTORY          = 0xB56B00C38EF85633A789644415A16b4C8ea12EF8;
    address constant ARC_V2_ROUTER           = 0x54599C3e0bcb99ca37b286242b5eC5D331AB9D18;

    address V4_POOL_MANAGER; // lu depuis l'env (fallback) ou ARC_V4_POOL_MANAGER ci-dessus

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address deployerAddr = vm.addr(deployerKey);  // EOA — passé comme owner explicite
        // Utilise la constante connue ; peut être overridée via env pour tests
        V4_POOL_MANAGER     = vm.envOr("ARC_V4_POOL_MANAGER", ARC_V4_POOL_MANAGER);
        address treasury    = vm.envAddress("TREASURY");

        vm.startBroadcast(deployerKey);

        // 1. Miner l'adresse du BondingCurveHook
        //    Flags : BEFORE_SWAP + BEFORE_SWAP_RETURNS_DELTA (pas AFTER_INITIALIZE — init via setupCurve)
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG               |
            Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG
        );

        // Note : on passe deployerAddr comme _owner pour que l'EOA reste propriétaire
        // même quand le déploiement passe via le CREATE2Deployer (où msg.sender != EOA).
        bytes memory constructorArgs = abi.encode(V4_POOL_MANAGER, deployerAddr);
        (address hookAddr, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,   // deployer déterministe (0x4e59b44...956C sur Arc)
            flags,
            type(BondingCurveHook).creationCode,
            constructorArgs
        );

        // 2. Déployer le hook via CREATE2
        BondingCurveHook hook = new BondingCurveHook{salt: salt}(
            IPoolManager(V4_POOL_MANAGER),
            deployerAddr
        );
        require(address(hook) == hookAddr, "Hook address mismatch");
        console.log("BondingCurveHook deployed at:", address(hook));

        // 3. Déployer la factory (avec V2 façade)
        LaunchpadFactoryV4 factory = new LaunchpadFactoryV4(
            USDC_ARC_MAINNET,
            V4_POOL_MANAGER,
            address(hook),
            treasury,
            ARC_V2_FACTORY,
            ARC_V2_ROUTER
        );
        console.log("LaunchpadFactoryV4 deployed at:", address(factory));

        // 4. Lier le hook à la factory (une seule fois)
        hook.setFactory(address(factory));

        // 5. Déployer le routeur (permet aux EOA de swapper via unlock/callback)
        BondingCurveRouter router = new BondingCurveRouter(IPoolManager(V4_POOL_MANAGER));
        console.log("BondingCurveRouter deployed at:", address(router));

        vm.stopBroadcast();

        // 6. Afficher le résumé
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Network:            Arc Mainnet (5042)");
        console.log("PoolManager:       ", V4_POOL_MANAGER);
        console.log("BondingCurveHook:  ", address(hook));
        console.log("LaunchpadFactoryV4:", address(factory));
        console.log("BondingCurveRouter:", address(router));
        console.log("USDC:              ", USDC_ARC_MAINNET);
        console.log("Treasury:          ", treasury);
        console.log("==========================\n");
        console.log("NOTE: Mettez a jour ADDRESSES_V4.md avec ces adresses");
        console.log("NOTE: Mettez a jour lib/arc-launchpad.ts : ARC_FACTORY_V4_ADDRESS, ARC_HOOK_ADDRESS, ARC_ROUTER_ADDRESS");
    }

    // Adresse du déployeur CREATE2 déterministe sur Arc
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
}
