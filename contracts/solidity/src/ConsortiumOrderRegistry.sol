// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract ConsortiumOrderRegistry is Pausable {
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

    event OrderAnchored(
        string indexed orderId,
        string buyer,
        string supplier,
        string auditProof,
        uint256 anchoredAt
    );

    event AudienceViewPublished(
        string indexed orderId,
        string indexed audience,
        string auditProof,
        uint256 publishedAt
    );

    function pause() external onlyAdmin {
        _pause();
    }

    function unpause() external onlyAdmin {
        _unpause();
    }

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

    function getCanonicalOrder(
        string calldata orderId
    ) external view returns (CanonicalOrder memory) {
        return canonicalOrders[orderId];
    }

    function getAudienceView(
        string calldata orderId,
        string calldata audience
    ) external view returns (AudienceView memory) {
        return audienceViews[orderId][audience];
    }
}