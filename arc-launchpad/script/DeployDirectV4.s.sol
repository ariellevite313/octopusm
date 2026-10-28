// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import "../src/DirectV4Vault.sol";
import "../src/LaunchpadFactoryArcV4Direct.sol";
import "../src/DirectV4Router.sol";

/**
 * @notice Déploie DirectV4Vault (implémentation) + LaunchpadFactoryArcV4Direct + DirectV4Router sur Arc mainnet.
 *
 * Usage :
 *   forge script script/DeployDirectV4.s.sol \
 *     --rpc-url https://rpc.mainnet.arc.io --private-key $DEPLOYER_PK --broadcast --legacy
 *
 * Variables d'env : DEPLOYER_PK, TREASURY_ADDR
 * Ensuite dans .env : NEXT_PUBLIC_ARC_FACTORY_DIRECT=<factory> et NEXT_PUBLIC_ARC_DIRECT_ROUTER=<router>
 */
contract DeployDirectV4 is Script {
    address constant POOL_MANAGER     = 0x8366a39CC670B4001A1121B8F6A443A643e40951;
    address constant POSITION_MANAGER = 0x6049c9a0e26405C0985f9E3685C87d0aE917f82B;
    address constant PERMIT2          = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    function run() external {
        address treasury = vm.envAddress("TREASURY_ADDR");
        uint256 pk = vm.envUint("DEPLOYER_PK");
        vm.startBroadcast(pk);
        DirectV4Vault impl = new DirectV4Vault();
        LaunchpadFactoryArcV4Direct factory = new LaunchpadFactoryArcV4Direct(address(impl), treasury, POOL_MANAGER, POSITION_MANAGER, PERMIT2);
        DirectV4Router router = new DirectV4Router(IPoolManager(POOL_MANAGER));
        vm.stopBroadcast();
        console.log("DirectV4Vault impl:", address(impl));
        console.log("Factory:", address(factory));
        console.log("Router:", address(router));
    }
}
