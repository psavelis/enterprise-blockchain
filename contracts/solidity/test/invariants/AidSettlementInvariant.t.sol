// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AidSettlement} from "../../src/AidSettlement.sol";
import {AidSettlementHandler} from "./AidSettlementHandler.sol";

/**
 * @title AidSettlementInvariant
 * @notice Foundry invariant test suite for AidSettlement.
 *
 *         Invariant 1 — Budget cap: for every grant, consumedUsd ≤ amountUsd.
 *         Invariant 2 — Accounting: settled + rejected == total submitted.
 */
contract AidSettlementInvariant is Test {
    AidSettlement settlement;
    AidSettlementHandler handler;

    function setUp() public {
        settlement = new AidSettlement();
        handler = new AidSettlementHandler(settlement);

        // Only fuzz through the handler — never call the settlement directly
        targetContract(address(handler));
    }

    /// @notice consumedUsd must never exceed amountUsd for any grant.
    function invariant_budgetCap() public view {
        uint256 count = handler.grantCount();
        for (uint256 i = 0; i < count; i++) {
            string memory gid = handler.grantIdAt(i);
            AidSettlement.Grant memory g = settlement.getGrant(gid);
            assertLe(g.consumedUsd, g.amountUsd, "consumed exceeded budget");
        }
    }

    /// @notice settled + rejected must always equal total submitted claims.
    function invariant_claimAccounting() public view {
        assertEq(
            handler.totalSettled() + handler.totalRejected(),
            handler.totalSubmitted(),
            "claim accounting mismatch"
        );
    }
}
