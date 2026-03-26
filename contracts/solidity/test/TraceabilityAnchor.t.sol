// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/TraceabilityAnchor.sol";

contract TraceabilityAnchorTest is Test {
    TraceabilityAnchor anchor;

    uint256 internal oracleKey = 0xA11CE;
    address internal oracleAddr;

    function setUp() public {
        anchor = new TraceabilityAnchor(address(this));
        oracleAddr = vm.addr(oracleKey);
        anchor.registerOracle(oracleAddr);
    }

    function _sign(string memory lotId, bytes32 stateRoot) internal view returns (bytes memory) {
        bytes32 msgHash = keccak256(abi.encodePacked(lotId, stateRoot));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oracleKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _anchorLot(string memory lotId, string memory producer, string memory origin, bytes32 stateRoot) internal {
        anchor.anchorLot(lotId, producer, origin, stateRoot, _sign(lotId, stateRoot));
    }

    // ---------------------------------------------------------------
    // anchorLot
    // ---------------------------------------------------------------

    function test_anchorLot_stores_and_emits() public {
        bytes32 root = keccak256("lot-state");

        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.LotAnchored(
            "LOT-001", root, "Green Valley Farms", block.timestamp
        );

        _anchorLot("LOT-001", "Green Valley Farms", "ES", root);

        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("LOT-001");
        assertEq(lot.lotId, "LOT-001");
        assertEq(lot.producer, "Green Valley Farms");
        assertEq(lot.origin, "ES");
        assertEq(lot.stateRootHash, root);
        assertGt(lot.anchoredAt, 0);
    }

    function test_anchorLot_reverts_on_empty_lotId() public {
        vm.expectRevert("lotId required");
        anchor.anchorLot("", "Producer", "US", bytes32(uint256(1)), _sign("", bytes32(uint256(1))));
    }

    function test_anchorLot_reverts_on_zero_stateRoot() public {
        vm.expectRevert("stateRoot required");
        anchor.anchorLot("LOT-X", "Producer", "US", bytes32(0), _sign("LOT-X", bytes32(0)));
    }

    function test_anchorLot_overwrites_on_reanchor() public {
        bytes32 root1 = keccak256("v1");
        bytes32 root2 = keccak256("v2");

        _anchorLot("LOT-002", "P1", "US", root1);
        _anchorLot("LOT-002", "P1", "US", root2);

        assertEq(anchor.getLot("LOT-002").stateRootHash, root2);
    }


    // ---------------------------------------------------------------
    // oracle attestation
    // ---------------------------------------------------------------

    function test_anchorLot_reverts_for_unregistered_oracle_signer() public {
        uint256 rogueKey = 0xBAD;
        bytes32 root = keccak256("state");
        bytes32 msgHash = keccak256(abi.encodePacked("LOT-ROGUE", root));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", msgHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(rogueKey, ethHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.expectRevert("signer not registered oracle");
        anchor.anchorLot("LOT-ROGUE", "P", "US", root, badSig);
    }

    function test_anchorLot_reverts_for_tampered_payload() public {
        bytes32 root = keccak256("state");
        bytes memory wrongSig = _sign("LOT-DIFFERENT", root);

        vm.expectRevert("signer not registered oracle");
        anchor.anchorLot("LOT-TAMPERED", "P", "US", root, wrongSig);
    }

    function test_registerOracle_and_removeOracle() public {
        address newOracle = address(0x1234);
        anchor.registerOracle(newOracle);
        assertTrue(anchor.oracleRegistry(newOracle));

        anchor.removeOracle(newOracle);
        assertFalse(anchor.oracleRegistry(newOracle));
    }

    function test_registerOracle_reverts_on_zero_address() public {
        vm.expectRevert("zero address");
        anchor.registerOracle(address(0));
    }

    function test_registerOracle_reverts_for_non_admin() public {
        address outsider = address(0xBEEF);
        vm.prank(outsider);
        vm.expectRevert();
        anchor.registerOracle(address(0x9999));
    }

    function test_removeOracle_reverts_for_non_admin() public {
        address outsider = address(0xBEEF);
        vm.prank(outsider);
        vm.expectRevert();
        anchor.removeOracle(oracleAddr);
    }

    function test_anchorLot_fails_after_oracle_removed() public {
        anchor.removeOracle(oracleAddr);
        bytes32 root = keccak256("state");
        vm.expectRevert("signer not registered oracle");
        anchor.anchorLot("LOT-REMOVED", "P", "US", root, _sign("LOT-REMOVED", root));
    }

    // ---------------------------------------------------------------
    // recordShipment
    // ---------------------------------------------------------------

    function test_recordShipment_stores_and_emits() public {
        _anchorLot("LOT-003", "P", "MX", keccak256("s"));

        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.ShipmentRecorded(
            "SHIP-001", "LOT-003", "Houston DC", 590, block.timestamp
        );

        anchor.recordShipment("SHIP-001", "LOT-003", "Houston DC", 590);

        TraceabilityAnchor.ShipmentRecord memory rec =
            anchor.getShipment("SHIP-001");

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
        _anchorLot("LOT-004", "P", "US", keccak256("s"));
        vm.expectRevert("shipmentId required");
        anchor.recordShipment("", "LOT-004", "DC", 400);
    }

    function test_recordShipment_negative_temperature() public {
        _anchorLot("LOT-005", "P", "NO", keccak256("s"));
        anchor.recordShipment("SHIP-N", "LOT-005", "Oslo DC", -250);

        assertEq(anchor.getShipment("SHIP-N").temperatureCelsius, -250);
    }

    // ---------------------------------------------------------------
    // issueRecall
    // ---------------------------------------------------------------

    function test_issueRecall_stores_and_emits() public {
        _anchorLot("LOT-006", "P", "ES", keccak256("s"));
        anchor.recordShipment("SHIP-A", "LOT-006", "Rotterdam", 400);
        anchor.recordShipment("SHIP-B", "LOT-006", "Hamburg", 500);

        bytes32 assessHash = keccak256("recall-assessment");
        string[] memory impacted = new string[](2);
        impacted[0] = "SHIP-A";
        impacted[1] = "SHIP-B";

        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.RecallIssued(
            "LOT-006", assessHash, 2, block.timestamp
        );

        anchor.issueRecall("LOT-006", assessHash, impacted);

        TraceabilityAnchor.RecallEvent memory recall =
            anchor.getRecall("LOT-006");

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
        _anchorLot("LOT-007", "P", "US", keccak256("s"));
        string[] memory ids = new string[](0);
        vm.expectRevert("assessmentHash required");
        anchor.issueRecall("LOT-007", bytes32(0), ids);
    }

    function test_issueRecall_empty_impacted_list() public {
        _anchorLot("LOT-008", "P", "US", keccak256("s"));
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
    // access control
    // ---------------------------------------------------------------

    function test_anchorLot_reverts_for_unauthorized_caller() public {
        address outsider = address(0xBEEF);
        vm.prank(outsider);
        vm.expectRevert();
        anchor.anchorLot("LOT-UNAUTH", "P", "US", keccak256("s"), _sign("LOT-UNAUTH", keccak256("s")));
    }

    function test_recordShipment_reverts_for_unauthorized_caller() public {
        _anchorLot("LOT-SHIP-AUTH", "P", "US", keccak256("s"));

        address outsider = address(0xBEEF);
        vm.prank(outsider);
        vm.expectRevert();
        anchor.recordShipment("SHIP-UNAUTH", "LOT-SHIP-AUTH", "DC", 400);
    }

    function test_issueRecall_reverts_for_unauthorized_caller() public {
        _anchorLot("LOT-RECALL-AUTH", "P", "US", keccak256("s"));

        address outsider = address(0xBEEF);
        string[] memory ids = new string[](0);
        vm.prank(outsider);
        vm.expectRevert();
        anchor.issueRecall("LOT-RECALL-AUTH", keccak256("h"), ids);
    }

    function test_granted_roles_can_operate() public {
        address oracle = address(0xAA);
        address carrier = address(0xBB);
        address authority = address(0xCC);

        anchor.grantRole(anchor.ANCHOR_ORACLE(), oracle);
        anchor.grantRole(anchor.SHIPMENT_RECORDER(), carrier);
        anchor.grantRole(anchor.RECALL_AUTHORITY(), authority);

        vm.prank(oracle);
        anchor.anchorLot("LOT-ROLE", "P", "US", keccak256("s"), _sign("LOT-ROLE", keccak256("s")));

        vm.prank(carrier);
        anchor.recordShipment("SHIP-ROLE", "LOT-ROLE", "DC", 400);

        string[] memory ids = new string[](1);
        ids[0] = "SHIP-ROLE";
        vm.prank(authority);
        anchor.issueRecall("LOT-ROLE", keccak256("h"), ids);

        assertEq(anchor.getRecall("LOT-ROLE").impactedShipmentIds.length, 1);
    }

    // ---------------------------------------------------------------
    // pausable
    // ---------------------------------------------------------------

    function test_pause_blocks_anchorLot() public {
        anchor.pause();
        vm.expectRevert();
        anchor.anchorLot("LOT-P", "P", "US", keccak256("state"), _sign("LOT-P", keccak256("state")));
    }

    function test_pause_blocks_recordShipment() public {
        _anchorLot("LOT-PS", "P", "US", keccak256("state"));
        anchor.pause();
        vm.expectRevert();
        anchor.recordShipment("SHIP-P", "LOT-PS", "DC", 400);
    }

    function test_pause_blocks_issueRecall() public {
        _anchorLot("LOT-PR", "P", "US", keccak256("state"));
        anchor.pause();
        string[] memory ids = new string[](0);
        vm.expectRevert();
        anchor.issueRecall("LOT-PR", keccak256("h"), ids);
    }

    function test_unpause_restores_operations() public {
        anchor.pause();
        anchor.unpause();
        _anchorLot("LOT-UNPAUSE", "P", "US", keccak256("state"));
        assertGt(anchor.getLot("LOT-UNPAUSE").anchoredAt, 0);
    }

    function test_view_functions_work_when_paused() public {
        _anchorLot("LOT-VIEW", "P", "US", keccak256("state"));
        anchor.pause();
        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("LOT-VIEW");
        assertGt(lot.anchoredAt, 0);
    }

    function test_pause_reverts_for_unauthorized_caller() public {
        address outsider = address(0xDEAD);
        vm.prank(outsider);
        vm.expectRevert();
        anchor.pause();
    }
}
