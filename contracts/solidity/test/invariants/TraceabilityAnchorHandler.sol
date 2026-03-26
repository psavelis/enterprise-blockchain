// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "../../src/TraceabilityAnchor.sol";

/**
 * @title TraceabilityAnchorHandler
 * @notice Foundry invariant-test handler that fuzzes over TraceabilityAnchor.
 *         Maintains ghost state to enable cross-reference invariants between
 *         anchored lots and recorded shipments.
 */
contract TraceabilityAnchorHandler {
    TraceabilityAnchor public immutable anchor;

    string[] internal _lotIds;
    string[] internal _shipmentIds;
    uint256 internal _lotCounter;
    uint256 internal _shipmentCounter;

    constructor(TraceabilityAnchor _anchor) {
        anchor = _anchor;
    }

    // --------------- fuzzed actions ---------------

    function anchorLot(bytes32 stateRootSeed) external {
        if (stateRootSeed == bytes32(0)) {
            stateRootSeed = keccak256(abi.encodePacked(_lotCounter, block.timestamp));
        }

        string memory lid = string(abi.encodePacked("LOT-", _uint2str(++_lotCounter)));

        anchor.anchorLot(lid, "producer", "origin", stateRootSeed);
        _lotIds.push(lid);
    }

    function recordShipment(uint256 lotSeed, int256 tempSeed) external {
        if (_lotIds.length == 0) return;

        uint256 idx = lotSeed % _lotIds.length;
        string memory lid = _lotIds[idx];
        string memory sid = string(abi.encodePacked("SHIP-", _uint2str(++_shipmentCounter)));

        anchor.recordShipment(sid, lid, "destination", tempSeed);
        _shipmentIds.push(sid);
    }

    function issueRecall(uint256 lotSeed) external {
        if (_lotIds.length == 0) return;

        uint256 idx = lotSeed % _lotIds.length;
        string memory lid = _lotIds[idx];

        // Recall with any shipments from that lot
        string[] memory impacted = new string[](0);
        anchor.issueRecall(lid, keccak256(abi.encodePacked("recall", lid)), impacted);
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
            buffer[digits] = bytes1(uint8(48 + uint256(v % 10)));
            v /= 10;
        }
        return string(buffer);
    }
}
