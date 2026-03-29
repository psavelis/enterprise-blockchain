// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {TraceabilityAnchor} from "../../src/TraceabilityAnchor.sol";
import {Vm} from "forge-std/Vm.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title TraceabilityAnchorHandler
 * @notice Foundry invariant-test handler that fuzzes over TraceabilityAnchor.
 *         Maintains ghost state to enable cross-reference invariants between
 *         anchored lots and recorded shipments.
 */
contract TraceabilityAnchorHandler {
    using MessageHashUtils for bytes32;

    Vm private constant VM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    TraceabilityAnchor public immutable ANCHOR;
    uint256 internal immutable ORACLE_KEY;

    string[] internal _lotIds;
    string[] internal _shipmentIds;
    uint256[] internal _shipmentLotIndex;
    uint256 internal _lotCounter;
    uint256 internal _shipmentCounter;

    constructor(TraceabilityAnchor _anchor, uint256 oracleKey) {
        ANCHOR = _anchor;
        ORACLE_KEY = oracleKey;
    }

    function _signLot(string memory lotId, bytes32 stateRoot) internal view returns (bytes memory) {
        bytes32 digest = keccak256(abi.encodePacked(lotId, stateRoot));
        bytes32 ethHash = digest.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = VM.sign(ORACLE_KEY, ethHash);
        return abi.encodePacked(r, s, v);
    }

    // --------------- fuzzed actions ---------------

    function anchorLot(bytes32 stateRootSeed) external {
        if (stateRootSeed == bytes32(0)) {
            stateRootSeed = keccak256(abi.encodePacked(_lotCounter, block.timestamp));
        }

        string memory lid = string(abi.encodePacked("LOT-", _uint2str(++_lotCounter)));
        bytes memory sig = _signLot(lid, stateRootSeed);

        ANCHOR.anchorLot(lid, "producer", "origin", stateRootSeed, sig);
        _lotIds.push(lid);
    }

    function recordShipment(uint256 lotSeed, int256 tempSeed) external {
        if (_lotIds.length == 0) return;

        uint256 idx = lotSeed % _lotIds.length;
        string memory lid = _lotIds[idx];
        string memory sid = string(abi.encodePacked("SHIP-", _uint2str(++_shipmentCounter)));

        ANCHOR.recordShipment(sid, lid, "destination", tempSeed);
        _shipmentIds.push(sid);
        _shipmentLotIndex.push(idx);
    }

    /// @notice Attempt to record a shipment for a non-anchored lot.
    ///         Should always revert — exercises the linkage check so
    ///         the invariant is not vacuous.
    function recordShipmentForNonAnchoredLot(int256 tempSeed) external {
        string memory fakeLot = string(abi.encodePacked("FAKE-LOT-", _uint2str(_lotCounter + 999)));
        string memory sid = string(abi.encodePacked("SHIP-", _uint2str(++_shipmentCounter)));
        try ANCHOR.recordShipment(sid, fakeLot, "destination", tempSeed) {
            // If this succeeds, the contract has a bug — the invariant suite
            // will detect the unlinked shipment.
            _shipmentIds.push(sid);
            _shipmentLotIndex.push(type(uint256).max);
        } catch {
            // Expected revert — lot not anchored.
            _shipmentCounter--;
        }
    }

    function issueRecall(uint256 lotSeed) external {
        if (_lotIds.length == 0) return;

        uint256 idx = lotSeed % _lotIds.length;
        string memory lid = _lotIds[idx];

        // Collect shipments that reference this lot
        uint256 count;
        for (uint256 i; i < _shipmentLotIndex.length; i++) {
            if (_shipmentLotIndex[i] == idx) count++;
        }
        string[] memory impacted = new string[](count);
        uint256 j;
        for (uint256 i; i < _shipmentLotIndex.length; i++) {
            if (_shipmentLotIndex[i] == idx) {
                impacted[j++] = _shipmentIds[i];
            }
        }

        ANCHOR.issueRecall(lid, keccak256(abi.encodePacked("recall", lid)), impacted);
    }

    // --------------- views for invariants ---------------

    function lotCount() external view returns (uint256) {
        return _lotIds.length;
    }

    function shipmentCount() external view returns (uint256) {
        return _shipmentIds.length;
    }

    function shipmentIdAt(uint256 idx) external view returns (string memory) {
        return _shipmentIds[idx];
    }

    function lotIdAt(uint256 idx) external view returns (string memory) {
        return _lotIds[idx];
    }

    // --------------- helpers ---------------

    function _uint2str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 temp = v;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (v != 0) {
            digits -= 1;
            // forge-lint: disable-next-line(unsafe-typecast)
            buffer[digits] = bytes1(uint8(48 + uint256(v % 10)));
            v /= 10;
        }
        return string(buffer);
    }
}
