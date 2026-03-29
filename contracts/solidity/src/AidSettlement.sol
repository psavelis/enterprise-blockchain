// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AidSettlement
 * @notice On-chain reconciliation anchoring for aid voucher redemption.
 *
 *         Grants are registered with a budget, beneficiary, and programme
 *         reference. Claims are submitted and validated against grant rules
 *         (budget cap, expiry, approved categories, duplicate invoices).
 *         Once reconciled, the settlement record is immutable on-chain.
 *
 * @dev    Designed for consortium Besu networks where disbursement agencies,
 *         merchants, and auditors share a permissioned ledger.  The contract
 *         mirrors the off-chain AidSettlementLedger reconciliation rules so
 *         that settlement outcomes can be independently verified.
 */
contract AidSettlement is Pausable {
    address public immutable ADMIN;

    modifier onlyAdmin() {
        _onlyAdmin();
        _;
    }

    function _onlyAdmin() internal view {
        require(msg.sender == ADMIN, "caller is not admin");
    }

    constructor(address admin) {
        require(admin != address(0), "admin required");
        ADMIN = admin;
    }

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

    struct Grant {
        string grantId;
        string beneficiaryId;
        string program;
        uint256 issuedAt;
        uint256 expiresAt;
        string[] approvedCategories;
        uint256 amountUsd; // scaled ×100 (cents)
        uint256 consumedUsd; // running total, also ×100
        bool exists;
    }

    struct Claim {
        string claimId;
        string grantId;
        string merchantId;
        string merchantCategory;
        string invoiceReference;
        uint256 amountUsd; // ×100
        uint256 submittedAt;
        ClaimStatus status;
    }

    enum ClaimStatus {
        Pending,
        Settled,
        Rejected
    }

    mapping(string => Grant) private grants;
    mapping(string => Claim) private claims;
    mapping(string => mapping(string => bool)) private usedInvoices; // grantId => invoiceRef => used

    event GrantRegistered(
        string indexed grantId,
        string beneficiaryId,
        string program,
        uint256 amountUsd,
        uint256 expiresAt
    );

    event ClaimSettled(
        string indexed claimId,
        string indexed grantId,
        uint256 amountUsd,
        uint256 newConsumedTotal
    );

    event ClaimRejected(
        string indexed claimId,
        string indexed grantId,
        string reason
    );

    /**
     * @notice Register a new aid grant on-chain.
     * @param grantId            Unique grant identifier.
     * @param beneficiaryId      Household or individual receiving the grant.
     * @param program            Programme name (e.g. "Urban Food Support").
     * @param issuedAt           Unix timestamp of issuance.
     * @param expiresAt          Unix timestamp of expiry.
     * @param approvedCategories Merchant category allow-list.
     * @param amountUsd100       Budget in USD cents (×100).
     */
    function registerGrant(
        string calldata grantId,
        string calldata beneficiaryId,
        string calldata program,
        uint256 issuedAt,
        uint256 expiresAt,
        string[] calldata approvedCategories,
        uint256 amountUsd100
    ) external whenNotPaused {
        require(bytes(grantId).length > 0, "grantId required");
        require(!grants[grantId].exists, "grant already registered");
        require(expiresAt > issuedAt, "expiresAt must be after issuedAt");

        grants[grantId] = Grant({
            grantId: grantId,
            beneficiaryId: beneficiaryId,
            program: program,
            issuedAt: issuedAt,
            expiresAt: expiresAt,
            approvedCategories: approvedCategories,
            amountUsd: amountUsd100,
            consumedUsd: 0,
            exists: true
        });

        emit GrantRegistered(grantId, beneficiaryId, program, amountUsd100, expiresAt);
    }

    /**
     * @notice Submit and settle a redemption claim against a grant.
     *         Performs the same validation as the off-chain reconciler:
     *         (1) grant must exist, (2) not expired at submission time,
     *         (3) category approved, (4) no duplicate invoice, (5) budget check.
     *
     * @param claimId         Unique claim identifier.
     * @param grantId         Target grant.
     * @param merchantId      Merchant submitting the claim.
     * @param category        Merchant category code.
     * @param invoiceRef      Invoice reference for deduplication.
     * @param amountUsd100    Claim amount in USD cents.
     * @param submittedAt     Unix timestamp of submission.
     */
    function submitClaim(
        string calldata claimId,
        string calldata grantId,
        string calldata merchantId,
        string calldata category,
        string calldata invoiceRef,
        uint256 amountUsd100,
        uint256 submittedAt
    ) external whenNotPaused {
        require(bytes(claimId).length > 0, "claimId required");
        require(bytes(invoiceRef).length > 0, "invoiceRef required");
        require(bytes(claims[claimId].claimId).length == 0, "claim already exists");

        // Write claim once, then determine outcome
        claims[claimId] = Claim({
            claimId: claimId,
            grantId: grantId,
            merchantId: merchantId,
            merchantCategory: category,
            invoiceReference: invoiceRef,
            amountUsd: amountUsd100,
            submittedAt: submittedAt,
            status: ClaimStatus.Pending
        });

        string memory rejection = _validate(grantId, category, invoiceRef, amountUsd100, submittedAt);

        if (bytes(rejection).length > 0) {
            claims[claimId].status = ClaimStatus.Rejected;
            emit ClaimRejected(claimId, grantId, rejection);
            return;
        }

        Grant storage g = grants[grantId];
        g.consumedUsd += amountUsd100;
        usedInvoices[grantId][invoiceRef] = true;
        claims[claimId].status = ClaimStatus.Settled;

        emit ClaimSettled(claimId, grantId, amountUsd100, g.consumedUsd);
    }

    function getGrant(string calldata grantId) external view returns (Grant memory) {
        return grants[grantId];
    }

    function getClaim(string calldata claimId) external view returns (Claim memory) {
        return claims[claimId];
    }

    function _validate(
        string calldata grantId,
        string calldata category,
        string calldata invoiceRef,
        uint256 amountUsd100,
        uint256 submittedAt
    ) private view returns (string memory) {
        Grant storage g = grants[grantId];

        if (!g.exists) return "grant not found";
        if (submittedAt > g.expiresAt) return "grant expired";
        if (!_isCategoryApproved(g, category)) return "category not approved";
        if (usedInvoices[grantId][invoiceRef]) return "duplicate invoice";
        if (g.consumedUsd + amountUsd100 > g.amountUsd) return "exceeds budget";

        return "";
    }

    function _isCategoryApproved(
        Grant storage grant,
        string calldata category
    ) private view returns (bool) {
        bytes32 target = keccak256(abi.encodePacked(category));
        for (uint256 i = 0; i < grant.approvedCategories.length; i++) {
            if (keccak256(abi.encodePacked(grant.approvedCategories[i])) == target) {
                return true;
            }
        }
        return false;
    }
}
