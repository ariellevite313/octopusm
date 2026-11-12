// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import "../src/DirectV4VaultNative.sol";
import "../src/LaunchpadFactoryV4DirectNative.sol";
import "../src/DirectV4Router.sol";

/**
 * @notice Déploie le lancement direct Uniswap V4 sur Elysium (chain 99901), paire en HYPE natif.
 *
 * 1. Calculer le prix de départ : node scripts/elysium-start-tick.mjs <prix du HYPE en $>
 * 2. Usage :
 *   forge script script/DeployElysium.s.sol --rpc-url https://rpc.elysium.kinetiq.xyz --private-key $DEPLOYER_PK --broadcast
 *
 * Variables d'env : TREASURY_ADDR (wallet plateforme EVM), POOL_MANAGER et POSITION_MANAGER (Uniswap v4 sur Elysium,
 * page officielle des déploiements Uniswap), PERMIT2 (par défaut l'adresse canonique), START_TICK, MAX_FIRST_BUY_WEI.
 * Ensuite dans .env : NEXT_PUBLIC_ELYSIUM_FACTORY=<factory> et NEXT_PUBLIC_ELYSIUM_ROUTER=<router>
 */
contract DeployElysium is Script {
    function run() external {
        require(block.chainid == 99901, "Not Elysium mainnet (99901)");
        address treasury = vm.envAddress("TREASURY_ADDR");
        address poolManager = vm.envAddress("POOL_MANAGER");
        address positionManager = vm.envAddress("POSITION_MANAGER");
        address permit2 = vm.envOr("PERMIT2", address(0x000000000022D473030F116dDEE9F6B43aC78BA3));
        int24 startTick = int24(vm.envInt("START_TICK"));
        uint256 maxFirstBuy = vm.envUint("MAX_FIRST_BUY_WEI");
        require(poolManager.code.length > 0 && positionManager.code.length > 0 && permit2.code.length > 0, "Uniswap v4 / Permit2 not found at these addresses");

        vm.startBroadcast();
        DirectV4VaultNative impl = new DirectV4VaultNative();
        LaunchpadFactoryV4DirectNative factory = new LaunchpadFactoryV4DirectNative(address(impl), treasury, poolManager, positionManager, permit2, startTick, maxFirstBuy);
        DirectV4Router router = new DirectV4Router(IPoolManager(poolManager));
        vm.stopBroadcast();
        console.log("DirectV4VaultNative impl:", address(impl));
        console.log("Factory (NEXT_PUBLIC_ELYSIUM_FACTORY):", address(factory));
        console.log("Router  (NEXT_PUBLIC_ELYSIUM_ROUTER):", address(router));
    }
}
