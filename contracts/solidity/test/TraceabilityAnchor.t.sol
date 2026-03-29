// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TraceabilityAnchor} from "../src/TraceabilityAnchor.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract TraceabilityAnchorTest is Test {
    using MessageHashUtils for bytes32;

    TraceabilityAnchor anchor;

    uint256 internal oracleKey = 0xA11CE;
    address internal oracle;

    function setUp() public {
        anchor = new TraceabilityAnchor();
        oracle = vm.addr(oracleKey);
        anchor.registerOracle(oracle);
    }

    function _sign(
        string memory lotId,
        bytes32 stateRoot
    ) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(lotId, stateRoot));
        bytes32 ethHash = digest.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    // -- Oracle registry --

    function test_registerOracle_emits() public {
        address newOracle = address(0xBEEF);
        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.OracleRegistered(newOracle);
        anchor.registerOracle(newOracle);
        assertTrue(anchor.oracleRegistry(newOracle));
    }

    function test_registerOracle_reverts_zero_address() public {
        vm.expectRevert("zero address");
        anchor.registerOracle(address(0));
    }

    function test_registerOracle_reverts_for_non_admin() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert("caller is not admin");
        anchor.registerOracle(address(0xBEEF));
    }

    function test_removeOracle_emits() public {
        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.OracleRemoved(oracle);
        anchor.removeOracle(oracle);
        assertFalse(anchor.oracleRegistry(oracle));
    }

    function test_removeOracle_reverts_for_non_admin() public {
        vm.prank(address(0xCAFE));
        vm.expectRevert("caller is not admin");
        anchor.removeOracle(oracle);
    }

    // -- anchorLot --

    function test_anchorLot_stores_and_emits() public {
        bytes32 root = keccak256("lot-state");
        bytes memory sig = _sign("LOT-001", root);

        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.LotAnchored(
            "LOT-001", root, "Green Valley Farms", block.timestamp
        );

        anchor.anchorLot("LOT-001", "Green Valley Farms", "ES", root, sig);

        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("LOT-001");
        assertEq(lot.lotId, "LOT-001");
        assertEq(lot.producer, "Green Valley Farms");
        assertEq(lot.origin, "ES");
        assertEq(lot.stateRootHash, root);
        assertGt(lot.anchoredAt, 0);
    }

    function test_anchorLot_reverts_on_empty_lotId() public {
        bytes memory sig = _sign("", bytes32(uint256(1)));
        vm.expectRevert("lotId required");
        anchor.anchorLot("", "Producer", "US", bytes32(uint256(1)), sig);
    }

    function test_anchorLot_reverts_on_zero_stateRoot() public {
        bytes memory sig = _sign("LOT-X", bytes32(0));
        vm.expectRevert("stateRoot required");
        anchor.anchorLot("LOT-X", "Producer", "US", bytes32(0), sig);
    }

    function test_anchorLot_overwrites_on_reanchor() public {
        bytes32 root1 = keccak256("v1");
        bytes32 root2 = keccak256("v2");

        anchor.anchorLot("LOT-002", "P1", "US", root1, _sign("LOT-002", root1));
        anchor.anchorLot("LOT-002", "P1", "US", root2, _sign("LOT-002", root2));

        assertEq(anchor.getLot("LOT-002").stateRootHash, root2);
    }

    function test_anchorLot_reverts_for_unregistered_oracle() public {
        uint256 rogueKey = 0xBAD;
        bytes32 root = keccak256("rogue");
        bytes32 digest = keccak256(abi.encodePacked("LOT-R", root));
        bytes32 ethHash = digest.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(rogueKey, ethHash);
        bytes memory rogueSig = abi.encodePacked(r, s, v);

        vm.expectRevert("signer is not a registered oracle");
        anchor.anchorLot("LOT-R", "P", "US", root, rogueSig);
    }

    function test_anchorLot_reverts_for_invalid_signature() public {
        bytes32 root = keccak256("tampered");
        bytes memory wrongSig = _sign("LOT-T", keccak256("original"));

        vm.expectRevert("signer is not a registered oracle");
        anchor.anchorLot("LOT-T", "P", "US", root, wrongSig);
    }

    function test_anchorLot_reverts_after_oracle_removed() public {
        anchor.removeOracle(oracle);
        bytes32 root = keccak256("s");
        bytes memory sig = _sign("LOT-REM", root);

        vm.expectRevert("signer is not a registered oracle");
        anchor.anchorLot("LOT-REM", "P", "US", root, sig);
    }

    // -- recordShipment --

    function test_recordShipment_stores_and_emits() public {
        bytes32 root = keccak256("s");
        anchor.anchorLot("LOT-003", "P", "MX", root, _sign("LOT-003", root));

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
        bytes32 root = keccak256("s");
        anchor.anchorLot("LOT-004", "P", "US", root, _sign("LOT-004", root));
        vm.expectRevert("shipmentId required");
        anchor.recordShipment("", "LOT-004", "DC", 400);
    }

    function test_recordShipment_negative_temperature() public {
        bytes32 root = keccak256("s");
        anchor.anchorLot("LOT-005", "P", "NO", root, _sign("LOT-005", root));
        anchor.recordShipment("SHIP-N", "LOT-005", "Oslo DC", -250);
        assertEq(anchor.getShipment("SHIP-N").temperatureCelsius, -250);
    }

    // -- issueRecall --

    function test_issueRecall_stores_and_emits() public {
        bytes32 root = keccak256("s");
        anchor.anchorLot("LOT-006", "P", "ES", root, _sign("LOT-006", root));
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
        bytes32 root = keccak256("s");
        anchor.anchorLot("LOT-007", "P", "US", root, _sign("LOT-007", root));
        string[] memory ids = new string[](0);
        vm.expectRevert("assessmentHash required");
        anchor.issueRecall("LOT-007", bytes32(0), ids);
    }

    function test_issueRecall_empty_impacted_list() public {
        bytes32 root = keccak256("s");
        anchor.anchorLot("LOT-008", "P", "US", root, _sign("LOT-008", root));
        string[] memory ids = new string[](0);
        anchor.issueRecall("LOT-008", keccak256("h"), ids);
        assertEq(anchor.getRecall("LOT-008").impactedShipmentIds.length, 0);
    }

    // -- getLot unknown --

    function test_getLot_returns_empty_for_unknown() public view {
        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("UNKNOWN");
        assertEq(lot.anchoredAt, 0);
        assertEq(lot.stateRootHash, bytes32(0));
    }
}
