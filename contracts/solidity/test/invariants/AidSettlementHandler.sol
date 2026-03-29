// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {AidSettlement} from "../../src/AidSettlement.sol";

/**
 * @title AidSettlementHandler
 * @notice Foundry invariant-test handler that fuzzes over AidSettlement
 *         with bounded inputs.  Tracks ghost variables so the invariant
 *         suite can assert accounting properties without re-reading
 *         on-chain state for every claim.
 */
contract AidSettlementHandler {
    AidSettlement public immutable SETTLEMENT;

    // Ghost counters — keep an external tally of submitted / settled / rejected
    uint256 public totalSubmitted;
    uint256 public totalSettled;
    uint256 public totalRejected;

    // Track which grantIds exist so we can target claims at valid grants.
    string[] internal _grantIds;
    uint256 internal _grantCounter;
    uint256 internal _claimCounter;

    string[] private _categories;

    constructor(AidSettlement _settlement) {
        SETTLEMENT = _settlement;
        _categories = new string[](2);
        _categories[0] = "groceries";
        _categories[1] = "pharmacy";
    }

    // --------------- fuzzed actions ---------------

    function registerGrant(uint256 amountSeed, uint256 durationSeed) external {
        uint256 amount = bound(amountSeed, 100, 1_000_000);
        uint256 duration = bound(durationSeed, 1, 365 days);

        string memory gid = string(abi.encodePacked("G-", _uint2str(++_grantCounter)));

        SETTLEMENT.registerGrant(
            gid,
            "beneficiary",
            "program",
            block.timestamp,
            block.timestamp + duration,
            _categories,
            amount
        );

        _grantIds.push(gid);
    }

    function submitValidClaim(uint256 grantSeed, uint256 amountSeed) external {
        if (_grantIds.length == 0) return;

        uint256 idx = bound(grantSeed, 0, _grantIds.length - 1);
        string memory gid = _grantIds[idx];

        AidSettlement.Grant memory g = SETTLEMENT.getGrant(gid);
        if (!g.exists) return;

        uint256 remaining = g.amountUsd > g.consumedUsd ? g.amountUsd - g.consumedUsd : 0;
        if (remaining == 0) return;

        uint256 amount = bound(amountSeed, 1, remaining);
        string memory cid = string(abi.encodePacked("C-", _uint2str(++_claimCounter)));
        string memory inv = string(abi.encodePacked("INV-", _uint2str(_claimCounter)));

        SETTLEMENT.submitClaim(cid, gid, "merchant", "groceries", inv, amount, block.timestamp);

        totalSubmitted++;

        AidSettlement.Claim memory c = SETTLEMENT.getClaim(cid);
        if (c.status == AidSettlement.ClaimStatus.Settled) {
            totalSettled++;
        } else if (c.status == AidSettlement.ClaimStatus.Rejected) {
            totalRejected++;
        }
    }

    function submitOverBudgetClaim(uint256 grantSeed) external {
        if (_grantIds.length == 0) return;

        uint256 idx = bound(grantSeed, 0, _grantIds.length - 1);
        string memory gid = _grantIds[idx];

        AidSettlement.Grant memory g = SETTLEMENT.getGrant(gid);
        if (!g.exists) return;

        // Intentionally exceed remaining budget
        uint256 overAmount = g.amountUsd + 1;
        string memory cid = string(abi.encodePacked("C-", _uint2str(++_claimCounter)));
        string memory inv = string(abi.encodePacked("INV-", _uint2str(_claimCounter)));

        SETTLEMENT.submitClaim(cid, gid, "merchant", "groceries", inv, overAmount, block.timestamp);

        totalSubmitted++;

        AidSettlement.Claim memory c = SETTLEMENT.getClaim(cid);
        if (c.status == AidSettlement.ClaimStatus.Settled) {
            totalSettled++;
        } else if (c.status == AidSettlement.ClaimStatus.Rejected) {
            totalRejected++;
        }
    }

    /// @notice Submit a claim with a duplicate invoice — should be rejected.
    function submitDuplicateInvoiceClaim(uint256 grantSeed) external {
        if (_grantIds.length == 0) return;

        uint256 idx = bound(grantSeed, 0, _grantIds.length - 1);
        string memory gid = _grantIds[idx];

        AidSettlement.Grant memory g = SETTLEMENT.getGrant(gid);
        if (!g.exists) return;

        // Re-use a known invoice ref to trigger "duplicate invoice" rejection
        string memory cid = string(abi.encodePacked("C-", _uint2str(++_claimCounter)));
        string memory inv = "INV-1"; // deterministic duplicate

        SETTLEMENT.submitClaim(cid, gid, "merchant", "groceries", inv, 1, block.timestamp);

        totalSubmitted++;

        AidSettlement.Claim memory c = SETTLEMENT.getClaim(cid);
        if (c.status == AidSettlement.ClaimStatus.Settled) {
            totalSettled++;
        } else if (c.status == AidSettlement.ClaimStatus.Rejected) {
            totalRejected++;
        }
    }

    /// @notice Submit a claim with an unapproved category — should be rejected.
    function submitUnapprovedCategoryClaim(uint256 grantSeed, uint256 amountSeed) external {
        if (_grantIds.length == 0) return;

        uint256 idx = bound(grantSeed, 0, _grantIds.length - 1);
        string memory gid = _grantIds[idx];

        AidSettlement.Grant memory g = SETTLEMENT.getGrant(gid);
        if (!g.exists) return;

        uint256 amount = bound(amountSeed, 1, 100);
        string memory cid = string(abi.encodePacked("C-", _uint2str(++_claimCounter)));
        string memory inv = string(abi.encodePacked("INV-", _uint2str(_claimCounter)));

        // "electronics" is not in the approved categories list
        SETTLEMENT.submitClaim(cid, gid, "merchant", "electronics", inv, amount, block.timestamp);

        totalSubmitted++;

        AidSettlement.Claim memory c = SETTLEMENT.getClaim(cid);
        if (c.status == AidSettlement.ClaimStatus.Settled) {
            totalSettled++;
        } else if (c.status == AidSettlement.ClaimStatus.Rejected) {
            totalRejected++;
        }
    }

    /// @notice Submit a claim after grant expiry — should be rejected.
    function submitExpiredClaim(uint256 grantSeed, uint256 amountSeed) external {
        if (_grantIds.length == 0) return;

        uint256 idx = bound(grantSeed, 0, _grantIds.length - 1);
        string memory gid = _grantIds[idx];

        AidSettlement.Grant memory g = SETTLEMENT.getGrant(gid);
        if (!g.exists) return;

        uint256 amount = bound(amountSeed, 1, 100);
        string memory cid = string(abi.encodePacked("C-", _uint2str(++_claimCounter)));
        string memory inv = string(abi.encodePacked("INV-", _uint2str(_claimCounter)));

        // Submit with a timestamp after grant expiry
        SETTLEMENT.submitClaim(cid, gid, "merchant", "groceries", inv, amount, g.expiresAt + 1);

        totalSubmitted++;

        AidSettlement.Claim memory c = SETTLEMENT.getClaim(cid);
        if (c.status == AidSettlement.ClaimStatus.Settled) {
            totalSettled++;
        } else if (c.status == AidSettlement.ClaimStatus.Rejected) {
            totalRejected++;
        }
    }

    // --------------- helpers ---------------

    function grantCount() external view returns (uint256) {
        return _grantIds.length;
    }

    function grantIdAt(uint256 idx) external view returns (string memory) {
        return _grantIds[idx];
    }

    function bound(uint256 x, uint256 lo, uint256 hi) internal pure returns (uint256) {
        if (hi <= lo) return lo;
        return lo + (x % (hi - lo + 1));
    }

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
