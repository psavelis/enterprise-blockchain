// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {AidSettlementUpgradeable} from "../src/AidSettlementUpgradeable.sol";

/**
 * @title DeployAidSettlementUpgradeable
 * @notice Deployment script for UUPS-upgradeable AidSettlement with ERC1967 proxy.
 *
 * Usage:
 *   forge script script/DeployAidSettlementUpgradeable.s.sol:DeployAidSettlementUpgradeable \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --verify
 *
 * Environment variables:
 *   PRIVATE_KEY - Deployer's private key
 *   ADMIN_ADDRESS - (Optional) Admin/upgrade authority, defaults to deployer
 */
contract DeployAidSettlementUpgradeable is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);

        console.log("Deployer:", deployer);
        console.log("Admin (upgrade authority):", admin);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy implementation
        AidSettlementUpgradeable implementation = new AidSettlementUpgradeable();
        console.log("Implementation deployed at:", address(implementation));

        // Encode initialize call
        bytes memory initData = abi.encodeWithSelector(
            AidSettlementUpgradeable.initialize.selector,
            admin
        );

        // Deploy proxy pointing to implementation
        ERC1967Proxy proxy = new ERC1967Proxy(address(implementation), initData);

        vm.stopBroadcast();

        console.log("Proxy deployed at:", address(proxy));
        console.log("");
        console.log("Use proxy address for all interactions.");
        console.log("Admin can upgrade via UUPS pattern.");
    }
}
