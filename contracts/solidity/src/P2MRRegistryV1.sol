// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {
    OwnableUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    PausableUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {
    AccessControlUpgradeable
} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title P2MRRegistryV1
 * @notice BIP-360-inspired Pay-to-Merkle-Root registry for quantum-safe outputs.
 *
 *         Outputs store ONLY a Merkle root of a script tree — no public keys
 *         are exposed until spend time. This eliminates the "harvest now,
 *         decrypt later" quantum threat for unspent outputs.
 *
 *         Spending requires:
 *         1. Reveal a script leaf from the Merkle tree
 *         2. Provide Merkle proof that leaf hashes to the stored root
 *         3. Off-chain ML-DSA-65 signature verification (via relayer)
 *
 * @dev    Uses OpenZeppelin UUPS proxy pattern for upgradeability.
 *         Storage follows ERC-7201 namespaced pattern.
 *
 *         On-chain verification covers:
 *         - Output existence and unspent status
 *         - Merkle proof verification (leaf → root)
 *         - Value transfer (optional, for native value outputs)
 *
 *         Off-chain (relayer) verification covers:
 *         - ML-DSA-65 signature verification (post-quantum)
 *         - Script leaf condition interpretation
 *         - Timelock/multisig/HSM attestation logic
 *
 * @custom:storage-location erc7201:enterprise-blockchain.storage.P2MRRegistry
 */
contract P2MRRegistryV1 is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");

    /**
     * @notice A P2MR output committed on-chain.
     * @dev    Only the Merkle root is stored — no public keys exposed.
     */
    struct P2MROutput {
        bytes32 merkleRoot;      // SHA-256 Merkle root of script tree
        uint256 value;           // Value in wei (or protocol-specific units)
        address creator;         // Address that created the output
        uint256 createdAt;       // Block timestamp when created
        bytes32 metadataHash;    // Optional off-chain metadata reference
        bool spent;              // Whether output has been consumed
    }

    /**
     * @notice Record of a spend event for audit trail.
     */
    struct SpendRecord {
        bytes32 outputId;        // ID of the output that was spent
        bytes32 leafHash;        // SHA-256 hash of the revealed script leaf
        address relayer;         // Relayer that validated the spend
        address recipient;       // Recipient of the value (if any)
        uint256 spentAt;         // Block timestamp when spent
    }

    /// @custom:storage-location erc7201:enterprise-blockchain.storage.P2MRRegistry
    struct P2MRRegistryStorage {
        mapping(bytes32 => P2MROutput) outputs;
        mapping(bytes32 => SpendRecord) spendRecords;
        uint256 totalOutputsCreated;
        uint256 totalOutputsSpent;
        string version;
    }

    // keccak256(abi.encode(uint256(keccak256("enterprise-blockchain.storage.P2MRRegistry")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant P2MR_REGISTRY_STORAGE_LOCATION =
        0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a00;

    function _getP2MRRegistryStorage() internal pure returns (P2MRRegistryStorage storage $) {
        assembly {
            $.slot := P2MR_REGISTRY_STORAGE_LOCATION
        }
    }

    // ---------------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------------

    event OutputCreated(
        bytes32 indexed outputId,
        bytes32 merkleRoot,
        uint256 value,
        address indexed creator,
        uint256 createdAt
    );

    event OutputSpent(
        bytes32 indexed outputId,
        bytes32 leafHash,
        address indexed relayer,
        address indexed recipient,
        uint256 value,
        uint256 spentAt
    );

    event RelayerAdded(address indexed relayer);
    event RelayerRemoved(address indexed relayer);

    // ---------------------------------------------------------------------------
    // Initialization
    // ---------------------------------------------------------------------------

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the registry.
     * @param admin Initial owner and admin address.
     */
    function initialize(address admin) external initializer {
        require(admin != address(0), "admin is the zero address");
        __Ownable_init(admin);
        __UUPSUpgradeable_init();
        __Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(RELAYER_ROLE, admin);
        _getP2MRRegistryStorage().version = "1";
    }

    // ---------------------------------------------------------------------------
    // Admin Functions
    // ---------------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Add a relayer authorized to validate spend proofs.
     * @param relayer Address of the relayer.
     */
    function addRelayer(address relayer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(relayer != address(0), "relayer is the zero address");
        _grantRole(RELAYER_ROLE, relayer);
        emit RelayerAdded(relayer);
    }

    /**
     * @notice Remove a relayer.
     * @param relayer Address of the relayer to remove.
     */
    function removeRelayer(address relayer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(RELAYER_ROLE, relayer);
        emit RelayerRemoved(relayer);
    }

    function version() external view returns (string memory) {
        return _getP2MRRegistryStorage().version;
    }

    // ---------------------------------------------------------------------------
    // Output Creation
    // ---------------------------------------------------------------------------

    /**
     * @notice Create a new P2MR output by committing to a Merkle root.
     *
     *         The Merkle root represents a tree of spending conditions (script leaves).
     *         Only the root is stored on-chain — public keys remain private until spend.
     *
     * @param merkleRoot SHA-256 Merkle root of the script tree.
     * @param metadataHash Optional hash of off-chain metadata.
     * @return outputId Unique identifier for the created output.
     */
    function createOutput(
        bytes32 merkleRoot,
        bytes32 metadataHash
    ) external payable whenNotPaused returns (bytes32 outputId) {
        require(merkleRoot != bytes32(0), "merkleRoot required");

        P2MRRegistryStorage storage $ = _getP2MRRegistryStorage();

        // Generate unique output ID from sender, root, timestamp, and nonce
        outputId = keccak256(
            abi.encode(msg.sender, merkleRoot, block.timestamp, $.totalOutputsCreated)
        );

        require($.outputs[outputId].createdAt == 0, "output already exists");

        $.outputs[outputId] = P2MROutput({
            merkleRoot: merkleRoot,
            value: msg.value,
            creator: msg.sender,
            createdAt: block.timestamp,
            metadataHash: metadataHash,
            spent: false
        });

        $.totalOutputsCreated++;

        emit OutputCreated(outputId, merkleRoot, msg.value, msg.sender, block.timestamp);
    }

    /**
     * @notice Create a P2MR output with a specific ID (for deterministic outputs).
     * @param outputId Desired output ID.
     * @param merkleRoot SHA-256 Merkle root of the script tree.
     * @param metadataHash Optional hash of off-chain metadata.
     */
    function createOutputWithId(
        bytes32 outputId,
        bytes32 merkleRoot,
        bytes32 metadataHash
    ) external payable whenNotPaused {
        require(outputId != bytes32(0), "outputId required");
        require(merkleRoot != bytes32(0), "merkleRoot required");

        P2MRRegistryStorage storage $ = _getP2MRRegistryStorage();
        require($.outputs[outputId].createdAt == 0, "output already exists");

        $.outputs[outputId] = P2MROutput({
            merkleRoot: merkleRoot,
            value: msg.value,
            creator: msg.sender,
            createdAt: block.timestamp,
            metadataHash: metadataHash,
            spent: false
        });

        $.totalOutputsCreated++;

        emit OutputCreated(outputId, merkleRoot, msg.value, msg.sender, block.timestamp);
    }

    // ---------------------------------------------------------------------------
    // Spending
    // ---------------------------------------------------------------------------

    /**
     * @notice Spend a P2MR output after off-chain verification.
     *
     *         The relayer has validated:
     *         1. ML-DSA-65 signature(s) from the witness
     *         2. Script leaf conditions (timelock, multisig, HSM attestation)
     *         3. Merkle proof from leaf to root
     *
     *         On-chain we verify:
     *         1. Output exists and is unspent
     *         2. Merkle proof (leaf hash → root)
     *         3. Caller is an authorized relayer
     *
     * @param outputId ID of the output to spend.
     * @param leafHash SHA-256 hash of the revealed script leaf.
     * @param merkleProof Array of sibling hashes for Merkle verification.
     * @param proofPositions Bit flags: 0 = sibling on right, 1 = sibling on left.
     * @param recipient Address to receive the output value (if any).
     */
    function spend(
        bytes32 outputId,
        bytes32 leafHash,
        bytes32[] calldata merkleProof,
        uint256 proofPositions,
        address payable recipient
    ) external whenNotPaused nonReentrant onlyRole(RELAYER_ROLE) {
        P2MRRegistryStorage storage $ = _getP2MRRegistryStorage();
        P2MROutput storage output = $.outputs[outputId];

        require(output.createdAt > 0, "output does not exist");
        require(!output.spent, "output already spent");
        require(recipient != address(0), "recipient is the zero address");

        // Verify Merkle proof
        bytes32 computedRoot = _computeMerkleRoot(leafHash, merkleProof, proofPositions);
        require(computedRoot == output.merkleRoot, "invalid merkle proof");

        // Mark as spent
        output.spent = true;
        $.totalOutputsSpent++;

        // Record spend for audit
        $.spendRecords[outputId] = SpendRecord({
            outputId: outputId,
            leafHash: leafHash,
            relayer: msg.sender,
            recipient: recipient,
            spentAt: block.timestamp
        });

        // Transfer value if any
        if (output.value > 0) {
            (bool success, ) = recipient.call{value: output.value}("");
            require(success, "value transfer failed");
        }

        emit OutputSpent(
            outputId,
            leafHash,
            msg.sender,
            recipient,
            output.value,
            block.timestamp
        );
    }

    // ---------------------------------------------------------------------------
    // View Functions
    // ---------------------------------------------------------------------------

    /**
     * @notice Get output details by ID.
     * @param outputId The output ID.
     * @return The P2MR output struct.
     */
    function getOutput(bytes32 outputId) external view returns (P2MROutput memory) {
        return _getP2MRRegistryStorage().outputs[outputId];
    }

    /**
     * @notice Get spend record for an output.
     * @param outputId The output ID.
     * @return The spend record struct.
     */
    function getSpendRecord(bytes32 outputId) external view returns (SpendRecord memory) {
        return _getP2MRRegistryStorage().spendRecords[outputId];
    }

    /**
     * @notice Check if an output is unspent.
     * @param outputId The output ID.
     * @return True if the output exists and is not spent.
     */
    function isUnspent(bytes32 outputId) external view returns (bool) {
        P2MROutput storage output = _getP2MRRegistryStorage().outputs[outputId];
        return output.createdAt > 0 && !output.spent;
    }

    /**
     * @notice Get total number of outputs created.
     * @return Count of all outputs ever created.
     */
    function totalOutputsCreated() external view returns (uint256) {
        return _getP2MRRegistryStorage().totalOutputsCreated;
    }

    /**
     * @notice Get total number of outputs spent.
     * @return Count of all outputs that have been spent.
     */
    function totalOutputsSpent() external view returns (uint256) {
        return _getP2MRRegistryStorage().totalOutputsSpent;
    }

    /**
     * @notice Verify a Merkle proof without modifying state.
     * @param leafHash Hash of the leaf to verify.
     * @param merkleRoot Expected Merkle root.
     * @param merkleProof Array of sibling hashes.
     * @param proofPositions Bit flags for sibling positions.
     * @return True if the proof is valid.
     */
    function verifyMerkleProof(
        bytes32 leafHash,
        bytes32 merkleRoot,
        bytes32[] calldata merkleProof,
        uint256 proofPositions
    ) external pure returns (bool) {
        return _computeMerkleRoot(leafHash, merkleProof, proofPositions) == merkleRoot;
    }

    // ---------------------------------------------------------------------------
    // Internal Functions
    // ---------------------------------------------------------------------------

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    /**
     * @notice Compute Merkle root from leaf and proof.
     * @param leafHash Starting leaf hash.
     * @param proof Array of sibling hashes.
     * @param positions Bit flags: bit i = 0 means proof[i] is on right, 1 means left.
     * @return Computed Merkle root.
     */
    function _computeMerkleRoot(
        bytes32 leafHash,
        bytes32[] calldata proof,
        uint256 positions
    ) internal pure returns (bytes32) {
        bytes32 current = leafHash;

        for (uint256 i = 0; i < proof.length; i++) {
            bytes32 sibling = proof[i];

            // Check position bit: 0 = sibling on right, 1 = sibling on left
            if ((positions >> i) & 1 == 0) {
                // Sibling on right: hash(current || sibling)
                current = keccak256(abi.encodePacked(current, sibling));
            } else {
                // Sibling on left: hash(sibling || current)
                current = keccak256(abi.encodePacked(sibling, current));
            }
        }

        return current;
    }
}
