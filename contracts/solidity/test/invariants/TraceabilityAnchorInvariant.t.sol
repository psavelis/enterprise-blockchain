// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TraceabilityAnchor} from "../../src/TraceabilityAnchor.sol";
import {TraceabilityAnchorHandler} from "./TraceabilityAnchorHandler.sol";

/**
 * @title TraceabilityAnchorInvariant
 * @notice Foundry invariant test suite for TraceabilityAnchor.
 *
 *         Invariant 1 — Lot linkage: every recorded shipment must reference
 *                       a previously anchored lot (anchoredAt > 0).
 */
contract TraceabilityAnchorInvariant is Test {
    TraceabilityAnchor anchor;
    TraceabilityAnchorHandler handler;

    function setUp() public {
        anchor = new TraceabilityAnchor(address(this));
        handler = new TraceabilityAnchorHandler(anchor);

        targetContract(address(handler));
    }

    /// @notice Every shipment's lotId must reference an anchored lot.
    function invariant_shipmentReferencesAnchoredLot() public view {
        uint256 count = handler.shipmentCount();
        for (uint256 i = 0; i < count; i++) {
            string memory sid = handler.shipmentIdAt(i);
            TraceabilityAnchor.ShipmentRecord memory s = anchor.getShipment(sid);
            TraceabilityAnchor.LotAnchor memory lot = anchor.getLot(s.lotId);
            assertGt(lot.anchoredAt, 0, "shipment references unanchored lot");
        }
    }
}
