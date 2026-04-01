/**
 * Besu P2MR Protocol Adapter
 *
 * Full implementation of P2MR (Pay-to-Merkle-Root) for Hyperledger Besu.
 * Interacts with the P2MRRegistryV1 Solidity contract via ethers.js.
 *
 * Architecture:
 * - On-chain: P2MRRegistryV1 contract handles output storage and Merkle verification
 * - Off-chain: This adapter handles ML-DSA-65 signature verification via relayer
 *
 * @see contracts/solidity/src/P2MRRegistryV1.sol
 * @see skills/p2mr-quantum-safe.md
 */

import {
  Contract,
  type ContractRunner,
  type TransactionResponse,
} from "ethers";
import type {
  IP2MRProtocolAdapter,
  P2MRProtocolConfig,
  P2MRCreateResult,
  P2MRSpendResult,
  P2MROutputStatus,
} from "../../src/p2mr-port";
import type { SpendProof, MerkleProofNode } from "../../../p2mr/src/types";
import { interpretScript, hashScriptLeaf } from "../../../p2mr/src/index";

// ---------------------------------------------------------------------------
// Contract Result Types (ethers.js returns dynamic types)
// ---------------------------------------------------------------------------

/**
 * Output struct returned by getOutput() contract call.
 */
interface ContractOutputResult {
  merkleRoot: string;
  value: bigint;
  creator: string;
  createdAt: bigint;
  metadataHash: string;
  spent: boolean;
}

// ---------------------------------------------------------------------------
// Contract ABI (minimal for P2MR operations)
// ---------------------------------------------------------------------------

const P2MR_REGISTRY_ABI = [
  // Events
  "event OutputCreated(bytes32 indexed outputId, bytes32 merkleRoot, uint256 value, address indexed creator, uint256 createdAt)",
  "event OutputSpent(bytes32 indexed outputId, bytes32 leafHash, address indexed relayer, address indexed recipient, uint256 value, uint256 spentAt)",

  // Write functions
  "function createOutput(bytes32 merkleRoot, bytes32 metadataHash) external payable returns (bytes32 outputId)",
  "function createOutputWithId(bytes32 outputId, bytes32 merkleRoot, bytes32 metadataHash) external payable",
  "function spend(bytes32 outputId, bytes32 leafHash, bytes32[] calldata merkleProof, uint256 proofPositions, address payable recipient) external",

  // Read functions
  "function getOutput(bytes32 outputId) external view returns (tuple(bytes32 merkleRoot, uint256 value, address creator, uint256 createdAt, bytes32 metadataHash, bool spent))",
  "function isUnspent(bytes32 outputId) external view returns (bool)",
  "function verifyMerkleProof(bytes32 leafHash, bytes32 merkleRoot, bytes32[] calldata merkleProof, uint256 proofPositions) external pure returns (bool)",
  "function totalOutputsCreated() external view returns (uint256)",
  "function totalOutputsSpent() external view returns (uint256)",
];

// ---------------------------------------------------------------------------
// Besu P2MR Adapter
// ---------------------------------------------------------------------------

/**
 * Besu implementation of P2MR protocol adapter.
 *
 * Provides full P2MR functionality on Hyperledger Besu via the
 * P2MRRegistryV1 smart contract.
 */
export class BesuP2MRAdapter implements IP2MRProtocolAdapter {
  readonly protocol = "besu" as const;
  readonly config: P2MRProtocolConfig;

  readonly #contract: Contract;

  /**
   * Create a Besu P2MR adapter.
   *
   * @param signer - Ethers signer for transaction submission.
   * @param config - Adapter configuration including contract address.
   */
  constructor(signer: ContractRunner, config: P2MRProtocolConfig) {
    if (!config.contractAddress) {
      throw new Error("P2MR contract address required for Besu adapter");
    }

    this.config = config;
    this.#contract = new Contract(
      config.contractAddress,
      P2MR_REGISTRY_ABI,
      signer,
    );
  }

  // ---------------------------------------------------------------------------
  // IP2MRCreatePort
  // ---------------------------------------------------------------------------

  /**
   * Create a new P2MR output on Besu.
   */
  async createOutput(
    merkleRoot: string,
    value: bigint,
    metadataHash?: string,
  ): Promise<P2MRCreateResult> {
    const merkleRootBytes = this.#toBytes32(merkleRoot);
    const metadataBytes = metadataHash
      ? this.#toBytes32(metadataHash)
      : "0x0000000000000000000000000000000000000000000000000000000000000000";

    const tx = (await this.#contract.getFunction("createOutput")(
      merkleRootBytes,
      metadataBytes,
      { value },
    )) as TransactionResponse;

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction receipt not available");
    }

    // Parse OutputCreated event to get outputId
    const event = receipt.logs.find((log) => {
      try {
        const parsed = this.#contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        return parsed?.name === "OutputCreated";
      } catch {
        return false;
      }
    });

    if (!event) {
      throw new Error("OutputCreated event not found in transaction logs");
    }

    const parsed = this.#contract.interface.parseLog({
      topics: event.topics as string[],
      data: event.data,
    });

    const outputId = String(parsed?.args[0]);
    const creator = String(parsed?.args[3]);

    return {
      outputId,
      txRef: tx.hash,
      blockHeight: receipt.blockNumber,
      metadata: {
        gasUsed: receipt.gasUsed.toString(),
        creator,
      },
    };
  }

  /**
   * Create a P2MR output with a specific ID.
   */
  async createOutputWithId(
    outputId: string,
    merkleRoot: string,
    value: bigint,
    metadataHash?: string,
  ): Promise<P2MRCreateResult> {
    const outputIdBytes = this.#toBytes32(outputId);
    const merkleRootBytes = this.#toBytes32(merkleRoot);
    const metadataBytes = metadataHash
      ? this.#toBytes32(metadataHash)
      : "0x0000000000000000000000000000000000000000000000000000000000000000";

    const tx = (await this.#contract.getFunction("createOutputWithId")(
      outputIdBytes,
      merkleRootBytes,
      metadataBytes,
      { value },
    )) as TransactionResponse;

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction receipt not available");
    }

    return {
      outputId,
      txRef: tx.hash,
      blockHeight: receipt.blockNumber,
      metadata: {
        gasUsed: receipt.gasUsed.toString(),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // IP2MRSpendPort
  // ---------------------------------------------------------------------------

  /**
   * Spend a P2MR output.
   *
   * This method:
   * 1. Verifies ML-DSA-65 signatures off-chain (via script interpreter)
   * 2. Submits Merkle proof on-chain for verification
   * 3. Transfers value to recipient
   */
  async spend(proof: SpendProof, recipient: string): Promise<P2MRSpendResult> {
    // Step 1: Off-chain ML-DSA-65 verification
    // Build message hash (would be transaction hash in real implementation)
    const messageHash = this.#buildSpendMessage(proof.outputId, recipient);

    const scriptResult = interpretScript({
      leaf: proof.revealedLeaf,
      witness: proof.witness,
      message: messageHash,
      currentTime: Date.now(),
    });

    if (!scriptResult.valid) {
      throw new Error(`Script verification failed: ${scriptResult.reason}`);
    }

    // Step 2: Prepare Merkle proof for on-chain verification
    const leafHash = hashScriptLeaf(proof.revealedLeaf);
    const { proofHashes, proofPositions } = this.#encodeMerkleProof(
      proof.merkleProof,
    );

    // Step 3: Submit spend transaction
    const tx = (await this.#contract.getFunction("spend")(
      this.#toBytes32(proof.outputId),
      this.#toBytes32(leafHash),
      proofHashes,
      proofPositions,
      recipient,
    )) as TransactionResponse;

    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction receipt not available");
    }

    // Parse OutputSpent event to get value
    const event = receipt.logs.find((log) => {
      try {
        const parsed = this.#contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        return parsed?.name === "OutputSpent";
      } catch {
        return false;
      }
    });

    let value = BigInt(0);
    if (event) {
      const parsed = this.#contract.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });
      value = BigInt(String(parsed?.args[4]));
    }

    return {
      outputId: proof.outputId,
      txRef: tx.hash,
      blockHeight: receipt.blockNumber,
      recipient,
      value,
    };
  }

  // ---------------------------------------------------------------------------
  // IP2MRQueryPort
  // ---------------------------------------------------------------------------

  /**
   * Get the status of a P2MR output.
   */
  async getOutputStatus(outputId: string): Promise<P2MROutputStatus> {
    const outputIdBytes = this.#toBytes32(outputId);

    try {
      const output = (await this.#contract.getFunction("getOutput")(
        outputIdBytes,
      )) as ContractOutputResult;

      // Check if output exists (createdAt > 0)
      if (output.createdAt === 0n) {
        return {
          exists: false,
          unspent: false,
        };
      }

      const merkleRoot: string = output.merkleRoot;
      const value: bigint = output.value;
      const createdAt = Number(output.createdAt) * 1000; // Convert to ms
      const hasMetadata =
        output.metadataHash !==
        "0x0000000000000000000000000000000000000000000000000000000000000000";

      const p2mrOutput: P2MROutputStatus["output"] = {
        outputId,
        merkleRoot,
        value,
        createdAt,
      };

      if (hasMetadata) {
        p2mrOutput.metadataHash = output.metadataHash;
      }

      return {
        exists: true,
        unspent: !output.spent,
        output: p2mrOutput,
      };
    } catch {
      return {
        exists: false,
        unspent: false,
      };
    }
  }

  /**
   * Verify a Merkle proof off-chain.
   */
  async verifyMerkleProof(
    leafHash: string,
    merkleRoot: string,
    proof: Array<{ hash: string; position: "left" | "right" }>,
  ): Promise<boolean> {
    const { proofHashes, proofPositions } = this.#encodeMerkleProof(
      proof as MerkleProofNode[],
    );

    const result = (await this.#contract.getFunction("verifyMerkleProof")(
      this.#toBytes32(leafHash),
      this.#toBytes32(merkleRoot),
      proofHashes,
      proofPositions,
    )) as boolean;

    return result;
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Convert a hex string to bytes32 format.
   */
  #toBytes32(hex: string): string {
    // Remove 0x prefix if present
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;

    // Pad to 64 characters (32 bytes)
    const padded = clean.padStart(64, "0");

    return `0x${padded}`;
  }

  /**
   * Encode Merkle proof for on-chain verification.
   */
  #encodeMerkleProof(proof: MerkleProofNode[]): {
    proofHashes: string[];
    proofPositions: bigint;
  } {
    const proofHashes = proof.map((node) => this.#toBytes32(node.hash));

    // Encode positions as bit flags: 0 = sibling on right, 1 = sibling on left
    let proofPositions = BigInt(0);
    for (let i = 0; i < proof.length; i++) {
      if (proof[i]!.position === "left") {
        proofPositions |= BigInt(1) << BigInt(i);
      }
    }

    return { proofHashes, proofPositions };
  }

  /**
   * Build the message to sign for spending.
   */
  #buildSpendMessage(outputId: string, recipient: string): Uint8Array {
    // In production, this would be a properly structured transaction hash
    const message = `P2MR_SPEND:${outputId}:${recipient}:${Date.now()}`;
    return new TextEncoder().encode(message);
  }
}
