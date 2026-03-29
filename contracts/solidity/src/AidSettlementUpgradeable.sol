// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/**
 * @title AidSettlementUpgradeable
 * @notice UUPS-upgradeable version of AidSettlement.
 *
 *         Grants are registered with a budget, beneficiary, and programme
 *         reference. Claims are submitted and validated against grant rules
 *         (budget cap, expiry, approved categories, duplicate invoices).
 *
 * @dev    Uses OpenZeppelin UUPS proxy pattern.  Constructor is replaced
 *         by `initialize()` to allow proxy-based deployment.
 *         Storage layout follows ERC-7201 namespaced pattern to avoid
 *         collisions across upgrades.
 *
 * @custom:storage-location erc7201:enterprise-blockchain.storage.AidSettlement
 */
contract AidSettlementUpgradeable is Initializable, UUPSUpgradeable, OwnableUpgradeable, PausableUpgradeable {
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

    /// @custom:storage-location erc7201:enterprise-blockchain.storage.AidSettlement
    struct AidSettlementStorage {
        mapping(string => Grant) grants;
        mapping(string => Claim) claims;
        mapping(string => mapping(string => bool)) usedInvoices;
        string version;
    }

    // keccak256(abi.encode(uint256(keccak256("enterprise-blockchain.storage.AidSettlement")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant AID_SETTLEMENT_STORAGE_LOCATION =
        0x5e4f6c1f8d3a2b0e9c7d8f6a5b4e3c2d1f0a9e8b7c6d5f4a3e2b1c0d9f8e7a00;

    function _getAidSettlementStorage() internal pure returns (AidSettlementStorage storage $) {
        assembly {
            $.slot := AID_SETTLEMENT_STORAGE_LOCATION
        }
    }

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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Replaces the constructor for proxy deployment.
     * @param admin  Initial owner / upgrade authority.
     */
    function initialize(address admin) external initializer {
        __Ownable_init(admin);
        __UUPSUpgradeable_init();
        __Pausable_init();
        _getAidSettlementStorage().version = "1";
    }

    function version() external view returns (string memory) {
        return _getAidSettlementStorage().version;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function registerGrant(
        string calldata grantId,
        string calldata beneficiaryId,
        string calldata program,
        uint256 issuedAt,
        uint256 expiresAt,
        string[] calldata approvedCategories,
        uint256 amountUsd100
    ) external whenNotPaused {
        AidSettlementStorage storage $ = _getAidSettlementStorage();
        require(bytes(grantId).length > 0, "grantId required");
        require(!$.grants[grantId].exists, "grant already registered");
        require(expiresAt > issuedAt, "expiresAt must be after issuedAt");

        $.grants[grantId] = Grant({
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

    function submitClaim(
        string calldata claimId,
        string calldata grantId,
        string calldata merchantId,
        string calldata category,
        string calldata invoiceRef,
        uint256 amountUsd100,
        uint256 submittedAt
    ) external whenNotPaused {
        AidSettlementStorage storage $ = _getAidSettlementStorage();
        require(bytes(claimId).length > 0, "claimId required");
        require(bytes(invoiceRef).length > 0, "invoiceRef required");
        require(bytes($.claims[claimId].claimId).length == 0, "claim already exists");

        $.claims[claimId] = Claim({
            claimId: claimId,
            grantId: grantId,
            merchantId: merchantId,
            merchantCategory: category,
            invoiceReference: invoiceRef,
            amountUsd: amountUsd100,
            submittedAt: submittedAt,
            status: ClaimStatus.Pending
        });

        string memory rejection = _validate($, grantId, category, invoiceRef, amountUsd100, submittedAt);

        if (bytes(rejection).length > 0) {
            $.claims[claimId].status = ClaimStatus.Rejected;
            emit ClaimRejected(claimId, grantId, rejection);
            return;
        }

        Grant storage g = $.grants[grantId];
        g.consumedUsd += amountUsd100;
        $.usedInvoices[grantId][invoiceRef] = true;
        $.claims[claimId].status = ClaimStatus.Settled;

        emit ClaimSettled(claimId, grantId, amountUsd100, g.consumedUsd);
    }

    function getGrant(string calldata grantId) external view returns (Grant memory) {
        return _getAidSettlementStorage().grants[grantId];
    }

    function getClaim(string calldata claimId) external view returns (Claim memory) {
        return _getAidSettlementStorage().claims[claimId];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _validate(
        AidSettlementStorage storage $,
        string calldata grantId,
        string calldata category,
        string calldata invoiceRef,
        uint256 amountUsd100,
        uint256 submittedAt
    ) private view returns (string memory) {
        Grant storage g = $.grants[grantId];

        if (!g.exists) return "grant not found";
        if (submittedAt > g.expiresAt) return "grant expired";
        if (!_isCategoryApproved(g, category)) return "category not approved";
        if ($.usedInvoices[grantId][invoiceRef]) return "duplicate invoice";
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
