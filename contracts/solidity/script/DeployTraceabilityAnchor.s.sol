// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {TraceabilityAnchor} from "../src/TraceabilityAnchor.sol";

/**
 * @title DeployTraceabilityAnchor
 * @notice Deployment script for the TraceabilityAnchor contract with oracle setup.
 *
 * Usage:
 *   forge script script/DeployTraceabilityAnchor.s.sol:DeployTraceabilityAnchor \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify
 *
 * Environment variables:
 *   PRIVATE_KEY - Deployer's private key
 *   ADMIN_ADDRESS - (Optional) Admin address, defaults to deployer
 *   ORACLE_ADDRESS - (Optional) Initial oracle to register
 */
contract DeployTraceabilityAnchor is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);

        console.log("Deployer:", deployer);
        console.log("Admin:", admin);

        vm.startBroadcast(deployerPrivateKey);

        TraceabilityAnchor anchor = new TraceabilityAnchor(admin);
        console.log("TraceabilityAnchor deployed at:", address(anchor));

        // Register initial oracle if provided
        address oracle = vm.envOr("ORACLE_ADDRESS", address(0));
        if (oracle != address(0)) {
            anchor.registerOracle(oracle);
            console.log("Registered oracle:", oracle);
        }

        vm.stopBroadcast();

        console.log("");
        console.log("Admin has DEFAULT_ADMIN_ROLE, PAUSER_ROLE, and ORACLE_ADMIN_ROLE");
        console.log("Use registerOracle() to add Fabric-to-Besu bridge oracles");
    }
}
