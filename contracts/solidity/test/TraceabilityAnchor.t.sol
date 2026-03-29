// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TraceabilityAnchor} from "../src/TraceabilityAnchor.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract TraceabilityAnchorTest is Test {
    using MessageHashUtils for bytes32;

    TraceabilityAnchor anchor;
    address admin = address(this);
    address nonPauser = address(0x2);

    uint256 oraclePrivateKey = 0xA11CE;
    address oracle;

    function setUp() public {
        anchor = new TraceabilityAnchor(admin);
        oracle = vm.addr(oraclePrivateKey);
        anchor.registerOracle(oracle);
    }

    function _signAnchor(string memory lotId, bytes32 stateRoot)
        internal
        view
        returns (bytes memory)
    {
        bytes32 messageHash =
            keccak256(abi.encode(address(anchor), block.chainid, lotId, stateRoot));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(oraclePrivateKey, ethSignedHash);
        return abi.encodePacked(r, s, v);
    }

    // ---------------------------------------------------------------
    // Oracle Registry
    // ---------------------------------------------------------------

    function test_registerOracle_stores_and_emits() public {
        address newOracle = address(0x123);

        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.OracleRegistered(newOracle);

        anchor.registerOracle(newOracle);
        assertTrue(anchor.isOracle(newOracle));
    }

    function test_registerOracle_reverts_for_zero_address() public {
        vm.expectRevert("oracle is the zero address");
        anchor.registerOracle(address(0));
    }

    function test_registerOracle_reverts_for_duplicate() public {
        vm.expectRevert("oracle already registered");
        anchor.registerOracle(oracle);
    }

    function test_registerOracle_reverts_for_non_admin() public {
        address nonAdmin = address(0x456);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                nonAdmin,
                anchor.ORACLE_ADMIN_ROLE()
            )
        );
        vm.prank(nonAdmin);
        anchor.registerOracle(address(0x789));
    }

    function test_removeOracle_removes_and_emits() public {
        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.OracleRemoved(oracle);

        anchor.removeOracle(oracle);
        assertFalse(anchor.isOracle(oracle));
    }

    function test_removeOracle_reverts_for_unregistered() public {
        vm.expectRevert("oracle not registered");
        anchor.removeOracle(address(0x999));
    }

    // ---------------------------------------------------------------
    // anchorLot
    // ---------------------------------------------------------------

    function test_anchorLot_stores_and_emits() public {
        bytes32 root = keccak256("lot-state");
        bytes memory sig = _signAnchor("LOT-001", root);

        vm.expectEmit(true, true, true, true);
        emit TraceabilityAnchor.LotAnchored("LOT-001", root, "Green Valley Farms", block.timestamp);

        vm.prank(oracle);
        anchor.anchorLot("LOT-001", "Green Valley Farms", "ES", root, sig);

        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("LOT-001");
        assertEq(lot.lotId, "LOT-001");
        assertEq(lot.producer, "Green Valley Farms");
        assertEq(lot.origin, "ES");
        assertEq(lot.stateRootHash, root);
        assertGt(lot.anchoredAt, 0);
    }

    function test_anchorLot_reverts_on_empty_lotId() public {
        bytes32 root = bytes32(uint256(1));
        bytes memory sig = _signAnchor("", root);
        vm.expectRevert("lotId required");
        vm.prank(oracle);
        anchor.anchorLot("", "Producer", "US", root, sig);
    }

    function test_anchorLot_reverts_on_zero_stateRoot() public {
        bytes memory sig = _signAnchor("LOT-X", bytes32(0));
        vm.expectRevert("stateRoot required");
        vm.prank(oracle);
        anchor.anchorLot("LOT-X", "Producer", "US", bytes32(0), sig);
    }

    function test_anchorLot_reverts_for_unregistered_oracle() public {
        uint256 fakeOracleKey = 0xBAD;
        address fakeOracle = vm.addr(fakeOracleKey);
        bytes32 root = keccak256("lot-state");
        bytes32 messageHash =
            keccak256(abi.encode(address(anchor), block.chainid, "LOT-FAKE", root));
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(fakeOracleKey, ethSignedHash);
        bytes memory fakeSig = abi.encodePacked(r, s, v);

        vm.expectRevert("signer is not a registered oracle");
        vm.prank(fakeOracle);
        anchor.anchorLot("LOT-FAKE", "Producer", "US", root, fakeSig);
    }

    function test_anchorLot_reverts_for_invalid_signature() public {
        bytes32 root = keccak256("lot-state");
        bytes memory wrongSig = _signAnchor("WRONG-LOT", root);

        // Invalid signature recovers to wrong address, so fails oracle registry check
        vm.expectRevert("signer is not a registered oracle");
        vm.prank(oracle);
        anchor.anchorLot("LOT-INVALID", "Producer", "US", root, wrongSig);
    }

    function test_anchorLot_reverts_for_non_oracle_caller() public {
        bytes32 root = keccak256("lot-state");
        bytes memory sig = _signAnchor("LOT-X", root);

        vm.expectRevert("caller must be oracle signer");
        anchor.anchorLot("LOT-X", "Producer", "US", root, sig);
    }

    function test_anchorLot_overwrites_on_reanchor() public {
        bytes32 root1 = keccak256("v1");
        bytes32 root2 = keccak256("v2");
        bytes memory sig1 = _signAnchor("LOT-002", root1);
        bytes memory sig2 = _signAnchor("LOT-002", root2);

        vm.prank(oracle);
        anchor.anchorLot("LOT-002", "P1", "US", root1, sig1);
        vm.prank(oracle);
        anchor.anchorLot("LOT-002", "P1", "US", root2, sig2);

        assertEq(anchor.getLot("LOT-002").stateRootHash, root2);
    }

    // ---------------------------------------------------------------
    // recordShipment
    // ---------------------------------------------------------------

    function test_recordShipment_stores_and_emits() public {
        bytes32 root = keccak256("s");
        bytes memory sig = _signAnchor("LOT-003", root);
        vm.prank(oracle);
        anchor.anchorLot("LOT-003", "P", "MX", root, sig);

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
        bytes memory sig = _signAnchor("LOT-004", root);
        vm.prank(oracle);
        anchor.anchorLot("LOT-004", "P", "US", root, sig);
        vm.expectRevert("shipmentId required");
        anchor.recordShipment("", "LOT-004", "DC", 400);
    }

    function test_recordShipment_negative_temperature() public {
        bytes32 root = keccak256("s");
        bytes memory sig = _signAnchor("LOT-005", root);
        vm.prank(oracle);
        anchor.anchorLot("LOT-005", "P", "NO", root, sig);
        anchor.recordShipment("SHIP-N", "LOT-005", "Oslo DC", -250);

        assertEq(anchor.getShipment("SHIP-N").temperatureCelsius, -250);
    }

    // ---------------------------------------------------------------
    // issueRecall
    // ---------------------------------------------------------------

    function test_issueRecall_stores_and_emits() public {
        bytes32 root = keccak256("s");
        bytes memory sig = _signAnchor("LOT-006", root);
        vm.prank(oracle);
        anchor.anchorLot("LOT-006", "P", "ES", root, sig);
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
        bytes memory sig = _signAnchor("LOT-007", root);
        vm.prank(oracle);
        anchor.anchorLot("LOT-007", "P", "US", root, sig);
        string[] memory ids = new string[](0);
        vm.expectRevert("assessmentHash required");
        anchor.issueRecall("LOT-007", bytes32(0), ids);
    }

    function test_issueRecall_empty_impacted_list() public {
        bytes32 root = keccak256("s");
        bytes memory sig = _signAnchor("LOT-008", root);
        vm.prank(oracle);
        anchor.anchorLot("LOT-008", "P", "US", root, sig);
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

        bytes32 root = keccak256("state");
        bytes memory sig = _signAnchor("LOT-PAUSE", root);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        vm.prank(oracle);
        anchor.anchorLot("LOT-PAUSE", "Producer", "US", root, sig);
    }

    function test_recordShipment_reverts_when_paused() public {
        bytes32 root = keccak256("s");
        bytes memory sig = _signAnchor("LOT-009", root);
        vm.prank(oracle);
        anchor.anchorLot("LOT-009", "P", "US", root, sig);
        anchor.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        anchor.recordShipment("SHIP-PAUSE", "LOT-009", "DC", 400);
    }

    function test_issueRecall_reverts_when_paused() public {
        bytes32 root = keccak256("s");
        bytes memory sig = _signAnchor("LOT-010", root);
        vm.prank(oracle);
        anchor.anchorLot("LOT-010", "P", "US", root, sig);
        anchor.pause();

        string[] memory ids = new string[](0);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        anchor.issueRecall("LOT-010", keccak256("h"), ids);
    }

    function test_view_functions_work_when_paused() public {
        bytes32 root = keccak256("s");
        bytes memory sig = _signAnchor("LOT-011", root);
        vm.prank(oracle);
        anchor.anchorLot("LOT-011", "P", "US", root, sig);
        anchor.pause();

        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("LOT-011");
        assertEq(lot.lotId, "LOT-011");
    }

    function test_operations_resume_after_unpause() public {
        anchor.pause();
        anchor.unpause();

        bytes32 root = keccak256("s");
        bytes memory sig = _signAnchor("LOT-012", root);
        vm.prank(oracle);
        anchor.anchorLot("LOT-012", "P", "US", root, sig);

        TraceabilityAnchor.LotAnchor memory lot = anchor.getLot("LOT-012");
        assertEq(lot.lotId, "LOT-012");
    }
}
