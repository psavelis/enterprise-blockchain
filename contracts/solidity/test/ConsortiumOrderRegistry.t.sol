// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ConsortiumOrderRegistry} from "../src/ConsortiumOrderRegistry.sol";

contract ConsortiumOrderRegistryTest is Test {
    ConsortiumOrderRegistry registry;

    function setUp() public {
        registry = new ConsortiumOrderRegistry();
    }

    function test_anchorOrder_stores_and_emits() public {
        vm.expectEmit(true, true, true, true);
        emit ConsortiumOrderRegistry.OrderAnchored(
            "PO-001", "Acme", "Supplier", "proof-abc", block.timestamp
        );

        registry.anchorOrder("PO-001", "Acme", "Supplier", "proof-abc");

        ConsortiumOrderRegistry.CanonicalOrder memory order =
            registry.getCanonicalOrder("PO-001");

        assertEq(order.orderId, "PO-001");
        assertEq(order.buyer, "Acme");
        assertEq(order.supplier, "Supplier");
        assertEq(order.auditProof, "proof-abc");
        assertGt(order.anchoredAt, 0);
    }

    function test_anchorOrder_reverts_on_empty_orderId() public {
        vm.expectRevert("orderId required");
        registry.anchorOrder("", "Acme", "Supplier", "proof");
    }

    function test_anchorOrder_reverts_on_empty_auditProof() public {
        vm.expectRevert("auditProof required");
        registry.anchorOrder("PO-001", "Acme", "Supplier", "");
    }

    function test_publishAudienceView_stores_and_emits() public {
        registry.anchorOrder("PO-002", "Buyer", "Supplier", "proof");

        vm.expectEmit(true, true, true, true);
        emit ConsortiumOrderRegistry.AudienceViewPublished(
            "PO-002", "regulator", "view-proof", block.timestamp
        );

        registry.publishAudienceView("PO-002", "regulator", "{}", "view-proof");

        ConsortiumOrderRegistry.AudienceView memory av =
            registry.getAudienceView("PO-002", "regulator");

        assertEq(av.audience, "regulator");
        assertEq(av.payload, "{}");
        assertEq(av.auditProof, "view-proof");
    }

    function test_publishAudienceView_reverts_for_unanchored_order() public {
        vm.expectRevert("order not anchored");
        registry.publishAudienceView("PO-NONE", "bank", "{}", "proof");
    }

    function test_publishAudienceView_reverts_on_empty_audience() public {
        registry.anchorOrder("PO-003", "B", "S", "p");
        vm.expectRevert("audience required");
        registry.publishAudienceView("PO-003", "", "{}", "proof");
    }

    function test_publishAudienceView_reverts_on_empty_auditProof() public {
        registry.anchorOrder("PO-004", "B", "S", "p");
        vm.expectRevert("auditProof required");
        registry.publishAudienceView("PO-004", "bank", "{}", "");
    }

    function test_multiple_audience_views_per_order() public {
        registry.anchorOrder("PO-005", "B", "S", "p");
        registry.publishAudienceView("PO-005", "bank", "bank-data", "p1");
        registry.publishAudienceView("PO-005", "regulator", "reg-data", "p2");

        assertEq(
            registry.getAudienceView("PO-005", "bank").payload,
            "bank-data"
        );
        assertEq(
            registry.getAudienceView("PO-005", "regulator").payload,
            "reg-data"
        );
    }

    function test_overwrite_audience_view() public {
        registry.anchorOrder("PO-006", "B", "S", "p");
        registry.publishAudienceView("PO-006", "bank", "v1", "p1");
        registry.publishAudienceView("PO-006", "bank", "v2", "p2");

        assertEq(
            registry.getAudienceView("PO-006", "bank").payload,
            "v2"
        );
    }

    function test_getCanonicalOrder_returns_empty_for_unknown() public view {
        ConsortiumOrderRegistry.CanonicalOrder memory order =
            registry.getCanonicalOrder("UNKNOWN");

        assertEq(order.anchoredAt, 0);
        assertEq(bytes(order.orderId).length, 0);
    }
}
