// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {IPoolManager}      from "v4-core/src/interfaces/IPoolManager.sol";
import {BondingCurveRouter} from "../src/BondingCurveRouter.sol";

/**
 * @notice Déploie uniquement le BondingCurveRouter (re-déploiement sans toucher hook/factory).
 *
 * Usage :
 *   forge script script/DeployRouter.s.sol \
 *     --rpc-url https://rpc.mainnet.arc.io \
 *     --broadcast \
 *     --private-key $DEPLOYER_PK
 *
 * Après déploiement : mettre à jour ARC_ROUTER_ADDRESS dans lib/arc-launchpad.ts
 */
contract DeployRouter is Script {
    address constant ARC_V4_POOL_MANAGER = 0x8366a39CC670B4001A1121B8F6A443A643e40951;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(deployerKey);

        BondingCurveRouter router = new BondingCurveRouter(
            IPoolManager(ARC_V4_POOL_MANAGER)
        );

        vm.stopBroadcast();

        console.log("=== BondingCurveRouter deployed ===");
        console.log("Address:", address(router));
        console.log("PoolManager:", address(router.poolManager()));
        console.log("");
        console.log(">>> Update lib/arc-launchpad.ts:");
        console.log('export const ARC_ROUTER_ADDRESS = "', address(router), '" as `0x${string}`;');
    }
}
