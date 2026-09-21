// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/LaunchpadFactoryArcV2.sol";

/**
 * @notice Crée un token test (TEST123) via LaunchpadFactoryArcV2.
 *         Premier achat = 0.1 USDC natif.
 *
 * Usage :
 *   forge script script/TestLaunchV2.s.sol \
 *     --rpc-url https://rpc.mainnet.arc.io \
 *     --private-key $DEPLOYER_PK \
 *     --broadcast \
 *     --legacy
 *
 * Variables :
 *   DEPLOYER_PK          = clé privée
 *   FACTORY_V2_ADDR      = adresse LaunchpadFactoryArcV2 (après DeployArcV2)
 */
contract TestLaunchV2 is Script {

    function run() external {
        uint256 pk      = vm.envUint("DEPLOYER_PK");
        address factory = vm.envAddress("FACTORY_V2_ADDR");

        uint256 creationFee = 10 ether;  // 10 USDC
        uint256 firstBuy    = 0.1 ether; // 0.1 USDC
        uint256 total       = creationFee + firstBuy;

        vm.startBroadcast(pk);

        (address curve, address token, address vault) = LaunchpadFactoryArcV2(payable(factory))
            .createToken{value: total}(
                "Test123",
                "TEST123",
                "",
                "Token test Arc V2 — pool V4 standard hook=0x0 fee=2500",
                firstBuy
            );

        vm.stopBroadcast();

        console.log("=== Token TEST123 lance ===");
        console.log("Token  :", token);
        console.log("Curve  :", curve);
        console.log("Vault  :", vault);
        console.log("");
        console.log("Verifier sur explorer.arc.io :");
        console.log("  Token  : https://explorer.arc.io/token/", token);
        console.log("  Curve  : https://explorer.arc.io/address/", curve);
        console.log("");
        console.log("Verifier events PoolManager 0x8366a39CC670B4001A1121B8F6A443A643e40951");
        console.log("  DexScreener (apres graduation): https://dexscreener.com/arc/<poolId>");
    }
}
