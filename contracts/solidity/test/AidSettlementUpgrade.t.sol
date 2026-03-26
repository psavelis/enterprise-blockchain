// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/AidSettlementUpgradeable.sol";

/**
 * @title AidSettlementV2Mock
 * @notice Simulates a V2 upgrade that adds a new `note` field to grants.
 *         Used to test that V1 data survives the upgrade intact.
 */
contract AidSettlementV2Mock is AidSettlementUpgradeable {
    function initializeV2() external reinitializer(2) {
        // In a real upgrade this could migrate data or set new defaults.
    }

    function v2Ping() external pure returns (string memory) {
        return "v2";
    }
}

contract AidSettlementUpgradeTest is Test {
    AidSettlementUpgradeable implementation;
    AidSettlementUpgradeable proxy;
    address admin = address(this);

    string[] twoCategories;

    function setUp() public {
        implementation = new AidSettlementUpgradeable();

        bytes memory initData = abi.encodeCall(
            AidSettlementUpgradeable.initialize,
            (admin)
        );

        ERC1967Proxy erc1967Proxy = new ERC1967Proxy(
            address(implementation),
            initData
        );

        proxy = AidSettlementUpgradeable(address(erc1967Proxy));

        twoCategories = new string[](2);
        twoCategories[0] = "groceries";
        twoCategories[1] = "pharmacy";
    }

    // ---------------------------------------------------------------
    // Initialization
    // ---------------------------------------------------------------

    function test_version_is_1() public view {
        assertEq(proxy.version(), "1");
    }

    function test_owner_is_admin() public view {
        assertEq(proxy.owner(), admin);
    }

    function test_initialize_cannot_be_called_twice() public {
        vm.expectRevert();
        proxy.initialize(address(0xdead));
    }

    // ---------------------------------------------------------------
    // V1 functionality
    // ---------------------------------------------------------------

    function test_registerGrant_and_submitClaim() public {
        proxy.registerGrant("G-1", "B-1", "Urban Food", 1000, 9999, twoCategories, 50000);

        AidSettlementUpgradeable.Grant memory g = proxy.getGrant("G-1");
        assertEq(g.amountUsd, 50000);
        assertEq(g.consumedUsd, 0);

        proxy.submitClaim("C-1", "G-1", "M-1", "groceries", "INV-1", 10000, 1500);

        AidSettlementUpgradeable.Claim memory c = proxy.getClaim("C-1");
        assertEq(
            uint8(c.status),
            uint8(AidSettlementUpgradeable.ClaimStatus.Settled)
        );

        g = proxy.getGrant("G-1");
        assertEq(g.consumedUsd, 10000);
    }

    // ---------------------------------------------------------------
    // Upgrade to V2
    // ---------------------------------------------------------------

    function test_upgrade_preserves_v1_data() public {
        // Seed V1 data
        proxy.registerGrant("G-UP", "B-1", "Aid", 100, 9999, twoCategories, 80000);
        proxy.submitClaim("C-UP", "G-UP", "M-1", "groceries", "INV-UP", 5000, 500);

        AidSettlementUpgradeable.Grant memory gBefore = proxy.getGrant("G-UP");
        assertEq(gBefore.consumedUsd, 5000);

        // Deploy V2 and upgrade
        AidSettlementV2Mock v2Impl = new AidSettlementV2Mock();
        proxy.upgradeToAndCall(
            address(v2Impl),
            abi.encodeCall(AidSettlementV2Mock.initializeV2, ())
        );

        // Verify V1 data intact
        AidSettlementUpgradeable.Grant memory gAfter = proxy.getGrant("G-UP");
        assertEq(gAfter.amountUsd, 80000);
        assertEq(gAfter.consumedUsd, 5000);
        assertTrue(gAfter.exists);

        AidSettlementUpgradeable.Claim memory c = proxy.getClaim("C-UP");
        assertEq(
            uint8(c.status),
            uint8(AidSettlementUpgradeable.ClaimStatus.Settled)
        );

        // Verify V2 functionality
        assertEq(AidSettlementV2Mock(address(proxy)).v2Ping(), "v2");
    }

    function test_upgrade_reverts_for_non_owner() public {
        AidSettlementV2Mock v2Impl = new AidSettlementV2Mock();
        address rando = address(0xbeef);

        vm.prank(rando);
        vm.expectRevert();
        proxy.upgradeToAndCall(address(v2Impl), "");
    }
}
