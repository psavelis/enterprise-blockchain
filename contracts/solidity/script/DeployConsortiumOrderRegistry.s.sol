// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ConsortiumOrderRegistry} from "../src/ConsortiumOrderRegistry.sol";

/**
 * @title DeployConsortiumOrderRegistry
 * @notice Deployment script for the ConsortiumOrderRegistry contract.
 *
 * Usage:
 *   forge script script/DeployConsortiumOrderRegistry.s.sol:DeployConsortiumOrderRegistry \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify
 *
 * Environment variables:
 *   PRIVATE_KEY - Deployer's private key
 *   ADMIN_ADDRESS - (Optional) Admin address, defaults to deployer
 */
contract DeployConsortiumOrderRegistry is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);

        console.log("Deployer:", deployer);
        console.log("Admin:", admin);

        vm.startBroadcast(deployerPrivateKey);

        ConsortiumOrderRegistry registry = new ConsortiumOrderRegistry(admin);

        vm.stopBroadcast();

        console.log("ConsortiumOrderRegistry deployed at:", address(registry));
        console.log("Admin has DEFAULT_ADMIN_ROLE and PAUSER_ROLE");
    }
}
