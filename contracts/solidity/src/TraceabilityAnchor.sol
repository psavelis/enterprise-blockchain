// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title TraceabilityAnchor
 * @notice Anchors product traceability state roots from Hyperledger Fabric to
 *         an EVM-compatible chain (Besu), enabling cross-chain verification
 *         without replicating the full supply chain dataset.
 *
 *         Each lot's provenance can be verified against the anchored hash
 *         by any participant with read access to the Fabric world state.
 *
 *         Oracle attestation: anchorLot requires a valid ECDSA signature from
 *         a registered oracle, ensuring only authorized cross-chain bridges
 *         can anchor state roots.
 *
 * @dev    Designed for consortium Besu networks with permissioned participants.
 */
contract TraceabilityAnchor {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    struct LotAnchor {
        bytes32 stateRootHash;
        string lotId;
        string producer;
        string origin;
        uint256 anchoredAt;
    }

    struct ShipmentRecord {
        string shipmentId;
        string lotId;
        string destination;
        int256 temperatureCelsius; // scaled ×100 for two decimal places
        uint256 recordedAt;
    }

    struct RecallEvent {
        string lotId;
        bytes32 assessmentHash;
        string[] impactedShipmentIds;
        uint256 issuedAt;
    }

    mapping(string => LotAnchor) private lots;
    mapping(string => ShipmentRecord) private shipments;
    mapping(string => RecallEvent) private recalls;

    address public admin;
    mapping(address => bool) public oracleRegistry;

    event OracleRegistered(address indexed oracle);
    event OracleRemoved(address indexed oracle);

    event LotAnchored(
        string indexed lotId,
        bytes32 stateRootHash,
        string producer,
        uint256 anchoredAt
    );

    event ShipmentRecorded(
        string indexed shipmentId,
        string indexed lotId,
        string destination,
        int256 temperatureCelsius,
        uint256 recordedAt
    );

    event RecallIssued(
        string indexed lotId,
        bytes32 assessmentHash,
        uint256 impactedCount,
        uint256 issuedAt
    );

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "caller is not admin");
        _;
    }

    /**
     * @notice Register an oracle address authorized to sign state root attestations.
     * @param oracle  The oracle's signing address.
     */
    function registerOracle(address oracle) external onlyAdmin {
        require(oracle != address(0), "zero address");
        oracleRegistry[oracle] = true;
        emit OracleRegistered(oracle);
    }

    /**
     * @notice Remove an oracle from the authorized set.
     * @param oracle  The oracle address to deauthorize.
     */
    function removeOracle(address oracle) external onlyAdmin {
        oracleRegistry[oracle] = false;
        emit OracleRemoved(oracle);
    }

    /**
     * @notice Anchor a product lot's state root from the Fabric world state.
     *         Requires a valid ECDSA signature from a registered oracle over
     *         `keccak256(abi.encodePacked(lotId, stateRoot))`.
     * @param lotId     Unique lot identifier matching the Fabric chaincode key.
     * @param producer  Name of the producing entity.
     * @param origin    Country or region of origin.
     * @param stateRoot SHA-256 hash of the lot's full state in Fabric.
     * @param signature ECDSA signature from a registered oracle.
     */
    function anchorLot(
        string calldata lotId,
        string calldata producer,
        string calldata origin,
        bytes32 stateRoot,
        bytes calldata signature
    ) external {
        require(bytes(lotId).length > 0, "lotId required");
        require(stateRoot != bytes32(0), "stateRoot required");

        bytes32 digest = keccak256(abi.encodePacked(lotId, stateRoot));
        bytes32 ethSignedHash = digest.toEthSignedMessageHash();
        address signer = ethSignedHash.recover(signature);
        require(oracleRegistry[signer], "signer is not a registered oracle");

        lots[lotId] = LotAnchor({
            stateRootHash: stateRoot,
            lotId: lotId,
            producer: producer,
            origin: origin,
            anchoredAt: block.timestamp
        });

        emit LotAnchored(lotId, stateRoot, producer, block.timestamp);
    }

    /**
     * @notice Record a shipment event (lot movement + telemetry snapshot).
     * @param shipmentId  Unique shipment identifier.
     * @param lotId       Associated lot — must be previously anchored.
     * @param destination Receiving facility or distribution center.
     * @param tempC100    Temperature in Celsius × 100 (e.g. 645 = 6.45 °C).
     */
    function recordShipment(
        string calldata shipmentId,
        string calldata lotId,
        string calldata destination,
        int256 tempC100
    ) external {
        require(lots[lotId].anchoredAt > 0, "lot not anchored");
        require(bytes(shipmentId).length > 0, "shipmentId required");
        require(shipments[shipmentId].recordedAt == 0, "shipment already recorded");

        shipments[shipmentId] = ShipmentRecord({
            shipmentId: shipmentId,
            lotId: lotId,
            destination: destination,
            temperatureCelsius: tempC100,
            recordedAt: block.timestamp
        });

        emit ShipmentRecorded(shipmentId, lotId, destination, tempC100, block.timestamp);
    }

    /**
     * @notice Record a recall event and the set of impacted shipment IDs.
     * @param lotId              The recalled lot.
     * @param assessmentHash     SHA-256 of the full RecallAssessment payload.
     * @param impactedShipmentIds List of affected shipment identifiers.
     */
    function issueRecall(
        string calldata lotId,
        bytes32 assessmentHash,
        string[] calldata impactedShipmentIds
    ) external {
        require(lots[lotId].anchoredAt > 0, "lot not anchored");
        require(assessmentHash != bytes32(0), "assessmentHash required");

        recalls[lotId] = RecallEvent({
            lotId: lotId,
            assessmentHash: assessmentHash,
            impactedShipmentIds: impactedShipmentIds,
            issuedAt: block.timestamp
        });

        emit RecallIssued(lotId, assessmentHash, impactedShipmentIds.length, block.timestamp);
    }

    function getLot(string calldata lotId) external view returns (LotAnchor memory) {
        return lots[lotId];
    }

    function getShipment(string calldata shipmentId) external view returns (ShipmentRecord memory) {
        return shipments[shipmentId];
    }

    function getRecall(string calldata lotId) external view returns (RecallEvent memory) {
        return recalls[lotId];
    }
}
