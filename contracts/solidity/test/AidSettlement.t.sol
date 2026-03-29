// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AidSettlement} from "../src/AidSettlement.sol";

contract AidSettlementTest is Test {
    AidSettlement settlement;

    string[] twoCategories;

    function setUp() public {
        settlement = new AidSettlement();
        twoCategories = new string[](2);
        twoCategories[0] = "groceries";
        twoCategories[1] = "pharmacy";
    }

    // ---------------------------------------------------------------
    // registerGrant
    // ---------------------------------------------------------------

    function test_registerGrant_stores_and_emits() public {
        vm.expectEmit(true, true, true, true);
        emit AidSettlement.GrantRegistered(
            "G-001", "HH-001", "Urban Food Support", 18000, 2000
        );

        settlement.registerGrant(
            "G-001", "HH-001", "Urban Food Support",
            1000, 2000, twoCategories, 18000
        );

        AidSettlement.Grant memory g = settlement.getGrant("G-001");
        assertEq(g.grantId, "G-001");
        assertEq(g.beneficiaryId, "HH-001");
        assertEq(g.amountUsd, 18000);
        assertEq(g.consumedUsd, 0);
        assertTrue(g.exists);
    }

    function test_registerGrant_reverts_on_empty_id() public {
        vm.expectRevert("grantId required");
        settlement.registerGrant(
            "", "HH-001", "Prog", 1000, 2000, twoCategories, 100
        );
    }

    function test_registerGrant_reverts_on_duplicate() public {
        settlement.registerGrant(
            "G-DUP", "HH", "P", 1000, 2000, twoCategories, 100
        );

        vm.expectRevert("grant already registered");
        settlement.registerGrant(
            "G-DUP", "HH", "P", 1000, 2000, twoCategories, 100
        );
    }

    function test_registerGrant_reverts_if_expiresAt_not_after_issuedAt() public {
        vm.expectRevert("expiresAt must be after issuedAt");
        settlement.registerGrant(
            "G-BAD", "HH", "P", 2000, 1000, twoCategories, 100
        );
    }

    // ---------------------------------------------------------------
    // submitClaim — settled
    // ---------------------------------------------------------------

    function test_submitClaim_settles_valid_claim() public {
        settlement.registerGrant(
            "G-002", "HH", "P", 1000, 2000, twoCategories, 18000
        );

        vm.expectEmit(true, true, true, true);
        emit AidSettlement.ClaimSettled("C-001", "G-002", 6500, 6500);

        settlement.submitClaim(
            "C-001", "G-002", "M-44", "groceries", "INV-001", 6500, 1500
        );

        AidSettlement.Claim memory c = settlement.getClaim("C-001");
        assertEq(c.claimId, "C-001");
        assertEq(uint8(c.status), uint8(AidSettlement.ClaimStatus.Settled));

        AidSettlement.Grant memory g = settlement.getGrant("G-002");
        assertEq(g.consumedUsd, 6500);
    }

    function test_submitClaim_accumulates_budget() public {
        settlement.registerGrant(
            "G-003", "HH", "P", 1000, 2000, twoCategories, 10000
        );

        settlement.submitClaim(
            "C-A", "G-003", "M", "groceries", "I-A", 4000, 1500
        );
        settlement.submitClaim(
            "C-B", "G-003", "M", "pharmacy", "I-B", 3000, 1500
        );

        AidSettlement.Grant memory g = settlement.getGrant("G-003");
        assertEq(g.consumedUsd, 7000);
    }

    // ---------------------------------------------------------------
    // submitClaim — rejected
    // ---------------------------------------------------------------

    function test_submitClaim_rejects_for_unknown_grant() public {
        vm.expectEmit(true, true, true, true);
        emit AidSettlement.ClaimRejected("C-X", "G-NONE", "grant not found");

        settlement.submitClaim(
            "C-X", "G-NONE", "M", "groceries", "I", 100, 1500
        );

        assertEq(
            uint8(settlement.getClaim("C-X").status),
            uint8(AidSettlement.ClaimStatus.Rejected)
        );
    }

    function test_submitClaim_rejects_expired() public {
        settlement.registerGrant(
            "G-004", "HH", "P", 1000, 2000, twoCategories, 10000
        );

        settlement.submitClaim(
            "C-EXP", "G-004", "M", "groceries", "I", 100, 3000
        );

        assertEq(
            uint8(settlement.getClaim("C-EXP").status),
            uint8(AidSettlement.ClaimStatus.Rejected)
        );
    }

    function test_submitClaim_rejects_unapproved_category() public {
        settlement.registerGrant(
            "G-005", "HH", "P", 1000, 2000, twoCategories, 10000
        );

        settlement.submitClaim(
            "C-CAT", "G-005", "M", "electronics", "I", 100, 1500
        );

        assertEq(
            uint8(settlement.getClaim("C-CAT").status),
            uint8(AidSettlement.ClaimStatus.Rejected)
        );
    }

    function test_submitClaim_rejects_duplicate_invoice() public {
        settlement.registerGrant(
            "G-006", "HH", "P", 1000, 2000, twoCategories, 10000
        );

        settlement.submitClaim(
            "C-D1", "G-006", "M", "groceries", "INV-SAME", 100, 1500
        );
        settlement.submitClaim(
            "C-D2", "G-006", "M", "groceries", "INV-SAME", 100, 1500
        );

        assertEq(
            uint8(settlement.getClaim("C-D1").status),
            uint8(AidSettlement.ClaimStatus.Settled)
        );
        assertEq(
            uint8(settlement.getClaim("C-D2").status),
            uint8(AidSettlement.ClaimStatus.Rejected)
        );
    }

    function test_submitClaim_rejects_budget_exceeded() public {
        settlement.registerGrant(
            "G-007", "HH", "P", 1000, 2000, twoCategories, 5000
        );

        settlement.submitClaim(
            "C-OK", "G-007", "M", "groceries", "I-1", 4000, 1500
        );
        settlement.submitClaim(
            "C-OVER", "G-007", "M", "groceries", "I-2", 2000, 1500
        );

        assertEq(
            uint8(settlement.getClaim("C-OK").status),
            uint8(AidSettlement.ClaimStatus.Settled)
        );
        assertEq(
            uint8(settlement.getClaim("C-OVER").status),
            uint8(AidSettlement.ClaimStatus.Rejected)
        );
    }

    function test_submitClaim_reverts_on_empty_claimId() public {
        vm.expectRevert("claimId required");
        settlement.submitClaim(
            "", "G-001", "M", "groceries", "I", 100, 1500
        );
    }

    // ---------------------------------------------------------------
    // getClaim — unknown
    // ---------------------------------------------------------------

    function test_getClaim_returns_empty_for_unknown() public view {
        AidSettlement.Claim memory c = settlement.getClaim("UNKNOWN");
        assertEq(bytes(c.claimId).length, 0);
        assertEq(uint8(c.status), uint8(AidSettlement.ClaimStatus.Pending));
    }
}
