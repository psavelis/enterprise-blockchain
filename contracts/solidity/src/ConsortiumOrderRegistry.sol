// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract ConsortiumOrderRegistry is Pausable, AccessControl {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct CanonicalOrder {
        string orderId;
        string buyer;
        string supplier;
        string auditProof;
        uint256 anchoredAt;
    }

    struct AudienceView {
        string audience;
        string payload;
        string auditProof;
        uint256 publishedAt;
    }

    mapping(string => CanonicalOrder) private canonicalOrders;
    mapping(string => mapping(string => AudienceView)) private audienceViews;

    constructor(address admin) {
        require(admin != address(0), "admin is the zero address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    event OrderAnchored(
        string indexed orderId, string buyer, string supplier, string auditProof, uint256 anchoredAt
    );

    event AudienceViewPublished(
        string indexed orderId, string indexed audience, string auditProof, uint256 publishedAt
    );

    function anchorOrder(
        string calldata orderId,
        string calldata buyer,
        string calldata supplier,
        string calldata auditProof
    ) external whenNotPaused {
        require(bytes(orderId).length > 0, "orderId required");
        require(bytes(auditProof).length > 0, "auditProof required");
        require(canonicalOrders[orderId].anchoredAt == 0, "order already anchored");

        canonicalOrders[orderId] = CanonicalOrder({
            orderId: orderId,
            buyer: buyer,
            supplier: supplier,
            auditProof: auditProof,
            anchoredAt: block.timestamp
        });

        emit OrderAnchored(orderId, buyer, supplier, auditProof, block.timestamp);
    }

    function publishAudienceView(
        string calldata orderId,
        string calldata audience,
        string calldata payload,
        string calldata auditProof
    ) external whenNotPaused {
        require(bytes(canonicalOrders[orderId].orderId).length > 0, "order not anchored");
        require(bytes(audience).length > 0, "audience required");
        require(bytes(auditProof).length > 0, "auditProof required");

        audienceViews[orderId][audience] = AudienceView({
            audience: audience,
            payload: payload,
            auditProof: auditProof,
            publishedAt: block.timestamp
        });

        emit AudienceViewPublished(orderId, audience, auditProof, block.timestamp);
    }

    function getCanonicalOrder(string calldata orderId)
        external
        view
        returns (CanonicalOrder memory)
    {
        return canonicalOrders[orderId];
    }

    function getAudienceView(string calldata orderId, string calldata audience)
        external
        view
        returns (AudienceView memory)
    {
        return audienceViews[orderId][audience];
    }
}
