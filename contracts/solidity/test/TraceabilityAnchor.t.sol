// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TraceabilityAnchor} from "../src/TraceabilityAnchor.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract TraceabilityAnchorTest is Test {
    TraceabilityAnchor anchor;
    address admin = address(this);
    address nonPauser = address(0x2);

    function setUp() public {
        anchor = new TraceabilityAnchor(admin);
    }

    // ---------------------------------------------------------------
    // anchorLot
    // ---------------------------------------------------------------

    function test_anchorLot_stores_and_emits() public {
        bytes32 root = keccak256("lot-state");

        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.LotAnchored("LOT-001", root, "Green Valley Farms", block.timestamp);

        anchor.anchorLot("LOT-001", "Green Valley Farms", "ES", root);

        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("LOT-001");
        assertEq(lot.lotId, "LOT-001");
        assertEq(lot.producer, "Green Valley Farms");
        assertEq(lot.origin, "ES");
        assertEq(lot.stateRootHash, root);
        assertGt(lot.anchoredAt, 0);
    }

    function test_anchorLot_reverts_on_empty_lotId() public {
        vm.expectRevert("lotId required");
        anchor.anchorLot("", "Producer", "US", bytes32(uint256(1)));
    }

    function test_anchorLot_reverts_on_zero_stateRoot() public {
        vm.expectRevert("stateRoot required");
        anchor.anchorLot("LOT-X", "Producer", "US", bytes32(0));
    }

    function test_anchorLot_overwrites_on_reanchor() public {
        bytes32 root1 = keccak256("v1");
        bytes32 root2 = keccak256("v2");

        anchor.anchorLot("LOT-002", "P1", "US", root1);
        anchor.anchorLot("LOT-002", "P1", "US", root2);

        assertEq(anchor.getLot("LOT-002").stateRootHash, root2);
    }

    // ---------------------------------------------------------------
    // recordShipment
    // ---------------------------------------------------------------

    function test_recordShipment_stores_and_emits() public {
        anchor.anchorLot("LOT-003", "P", "MX", keccak256("s"));

        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.ShipmentRecorded(
            "SHIP-001", "LOT-003", "Houston DC", 590, block.timestamp
        );

        anchor.recordShipment("SHIP-001", "LOT-003", "Houston DC", 590);

        TraceabilityAnchor.ShipmentRecord memory rec = anchor.getShipment("SHIP-001");

        assertEq(rec.shipmentId, "SHIP-001");
        assertEq(rec.lotId, "LOT-003");
        assertEq(rec.destination, "Houston DC");
        assertEq(rec.temperatureCelsius, 590);
    }

    function test_recordShipment_reverts_for_unanchored_lot() public {
        vm.expectRevert("lot not anchored");
        anchor.recordShipment("SHIP-X", "LOT-NONE", "DC", 400);
    }

    function test_recordShipment_reverts_on_empty_shipmentId() public {
        anchor.anchorLot("LOT-004", "P", "US", keccak256("s"));
        vm.expectRevert("shipmentId required");
        anchor.recordShipment("", "LOT-004", "DC", 400);
    }

    function test_recordShipment_negative_temperature() public {
        anchor.anchorLot("LOT-005", "P", "NO", keccak256("s"));
        anchor.recordShipment("SHIP-N", "LOT-005", "Oslo DC", -250);

        assertEq(anchor.getShipment("SHIP-N").temperatureCelsius, -250);
    }

    // ---------------------------------------------------------------
    // issueRecall
    // ---------------------------------------------------------------

    function test_issueRecall_stores_and_emits() public {
        anchor.anchorLot("LOT-006", "P", "ES", keccak256("s"));
        anchor.recordShipment("SHIP-A", "LOT-006", "Rotterdam", 400);
        anchor.recordShipment("SHIP-B", "LOT-006", "Hamburg", 500);

        bytes32 assessHash = keccak256("recall-assessment");
        string[] memory impacted = new string[](2);
        impacted[0] = "SHIP-A";
        impacted[1] = "SHIP-B";

        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.RecallIssued("LOT-006", assessHash, 2, block.timestamp);

        anchor.issueRecall("LOT-006", assessHash, impacted);

        TraceabilityAnchor.RecallEvent memory recall = anchor.getRecall("LOT-006");

        assertEq(recall.lotId, "LOT-006");
        assertEq(recall.assessmentHash, assessHash);
        assertEq(recall.impactedShipmentIds.length, 2);
        assertEq(recall.impactedShipmentIds[0], "SHIP-A");
    }

    function test_issueRecall_reverts_for_unanchored_lot() public {
        string[] memory ids = new string[](0);
        vm.expectRevert("lot not anchored");
        anchor.issueRecall("LOT-NONE", keccak256("h"), ids);
    }

    function test_issueRecall_reverts_on_zero_hash() public {
        anchor.anchorLot("LOT-007", "P", "US", keccak256("s"));
        string[] memory ids = new string[](0);
        vm.expectRevert("assessmentHash required");
        anchor.issueRecall("LOT-007", bytes32(0), ids);
    }

    function test_issueRecall_empty_impacted_list() public {
        anchor.anchorLot("LOT-008", "P", "US", keccak256("s"));
        string[] memory ids = new string[](0);
        anchor.issueRecall("LOT-008", keccak256("h"), ids);

        assertEq(anchor.getRecall("LOT-008").impactedShipmentIds.length, 0);
    }

    // ---------------------------------------------------------------
    // getLot — unknown
    // ---------------------------------------------------------------

    function test_getLot_returns_empty_for_unknown() public view {
        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("UNKNOWN");
        assertEq(lot.anchoredAt, 0);
        assertEq(lot.stateRootHash, bytes32(0));
    }

    // ---------------------------------------------------------------
    // Pausable
    // ---------------------------------------------------------------

    function test_pause_reverts_for_non_pauser() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                nonPauser,
                anchor.PAUSER_ROLE()
            )
        );
        vm.prank(nonPauser);
        anchor.pause();
    }

    function test_pause_succeeds_for_pauser() public {
        anchor.pause();
        assertTrue(anchor.paused());
    }

    function test_unpause_succeeds_for_pauser() public {
        anchor.pause();
        anchor.unpause();
        assertFalse(anchor.paused());
    }

    function test_anchorLot_reverts_when_paused() public {
        anchor.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        anchor.anchorLot("LOT-PAUSE", "Producer", "US", keccak256("state"));
    }

    function test_recordShipment_reverts_when_paused() public {
        anchor.anchorLot("LOT-009", "P", "US", keccak256("s"));
        anchor.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        anchor.recordShipment("SHIP-PAUSE", "LOT-009", "DC", 400);
    }

    function test_issueRecall_reverts_when_paused() public {
        anchor.anchorLot("LOT-010", "P", "US", keccak256("s"));
        anchor.pause();

        string[] memory ids = new string[](0);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        anchor.issueRecall("LOT-010", keccak256("h"), ids);
    }

    function test_view_functions_work_when_paused() public {
        anchor.anchorLot("LOT-011", "P", "US", keccak256("s"));
        anchor.pause();

        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("LOT-011");
        assertEq(lot.lotId, "LOT-011");
    }

    function test_operations_resume_after_unpause() public {
        anchor.pause();
        anchor.unpause();

        anchor.anchorLot("LOT-012", "P", "US", keccak256("s"));

        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("LOT-012");
        assertEq(lot.lotId, "LOT-012");
    }
}
