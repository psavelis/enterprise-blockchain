// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AidSettlement} from "../src/AidSettlement.sol";

/**
 * @title DeployAidSettlement
 * @notice Deployment script for the non-upgradeable AidSettlement contract.
 *
 * Usage:
 *   forge script script/DeployAidSettlement.s.sol:DeployAidSettlement \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify
 *
 * Environment variables:
 *   PRIVATE_KEY - Deployer's private key
 *   ADMIN_ADDRESS - (Optional) Admin address, defaults to deployer
 */
contract DeployAidSettlement is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);

        console.log("Deployer:", deployer);
        console.log("Admin:", admin);

        vm.startBroadcast(deployerPrivateKey);

        AidSettlement settlement = new AidSettlement(admin);

        vm.stopBroadcast();

        console.log("AidSettlement deployed at:", address(settlement));
        console.log("Admin has DEFAULT_ADMIN_ROLE and PAUSER_ROLE");
    }
}
