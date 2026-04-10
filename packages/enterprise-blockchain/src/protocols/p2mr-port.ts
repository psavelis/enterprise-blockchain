/**
 * P2MR (Pay-to-Merkle-Root) Protocol Port
 *
 * Defines the interface for P2MR operations across different blockchain protocols.
 * Implementations provide protocol-specific handling while the domain layer
 * remains protocol-agnostic.
 *
 * P2MR is BIP-360-inspired: outputs store only a Merkle root of spending conditions,
 * keeping public keys private until spend time. This eliminates the quantum
 * "harvest now, decrypt later" threat.
 */

import type { P2MROutput, SpendProof } from "../p2mr/types.js";

// ---------------------------------------------------------------------------
// Result Types
// ---------------------------------------------------------------------------

/**
 * Result of creating a P2MR output on-chain.
 */
export interface P2MRCreateResult {
  /** Output ID assigned by the protocol. */
  outputId: string;

  /** Transaction/block identifier. */
  txRef: string;

  /** Block number or ledger height. */
  blockHeight: number;

  /** Protocol-specific metadata. */
  metadata?: Record<string, unknown>;
}

/**
 * Result of spending a P2MR output.
 */
export interface P2MRSpendResult {
  /** Output ID that was spent. */
  outputId: string;

  /** Transaction/block identifier. */
  txRef: string;

  /** Block number or ledger height. */
  blockHeight: number;

  /** Recipient address/identity. */
  recipient: string;

  /** Value transferred. */
  value: bigint;
}

/**
 * Query result for an output.
 */
export interface P2MROutputStatus {
  /** Whether the output exists. */
  exists: boolean;

  /** Whether the output is unspent. */
  unspent: boolean;

  /** The output data (if exists). */
  output?: P2MROutput;

  /** Block height when created. */
  createdAtBlock?: number;

  /** Block height when spent (if spent). */
  spentAtBlock?: number;
}

// ---------------------------------------------------------------------------
// Port Interfaces
// ---------------------------------------------------------------------------

/**
 * Port for creating P2MR outputs.
 *
 * Implementations handle protocol-specific transaction submission and
 * output registration.
 */
export interface IP2MRCreatePort {
  /**
   * Create a new P2MR output by committing to a Merkle root.
   *
   * @param merkleRoot - SHA-256 Merkle root of the script tree.
   * @param value - Value to lock in the output.
   * @param metadataHash - Optional hash of off-chain metadata.
   * @returns Creation result with output ID and transaction reference.
   */
  createOutput(
    merkleRoot: string,
    value: bigint,
    metadataHash?: string,
  ): Promise<P2MRCreateResult>;

  /**
   * Create an output with a specific ID (for deterministic outputs).
   *
   * @param outputId - Desired output ID.
   * @param merkleRoot - SHA-256 Merkle root of the script tree.
   * @param value - Value to lock in the output.
   * @param metadataHash - Optional hash of off-chain metadata.
   */
  createOutputWithId(
    outputId: string,
    merkleRoot: string,
    value: bigint,
    metadataHash?: string,
  ): Promise<P2MRCreateResult>;
}

/**
 * Port for spending P2MR outputs.
 *
 * Implementations handle spend proof validation and value transfer.
 */
export interface IP2MRSpendPort {
  /**
   * Spend a P2MR output using a spend proof.
   *
   * The proof includes:
   * - The revealed script leaf (spending condition)
   * - Merkle proof from leaf to root
   * - Witness data (public keys, signatures)
   *
   * Off-chain: ML-DSA-65 signature verification
   * On-chain: Merkle proof verification, value transfer
   *
   * @param proof - Complete spend proof.
   * @param recipient - Recipient address/identity.
   * @returns Spend result with transaction reference.
   */
  spend(proof: SpendProof, recipient: string): Promise<P2MRSpendResult>;
}

/**
 * Port for querying P2MR outputs.
 */
export interface IP2MRQueryPort {
  /**
   * Get the status of an output.
   *
   * @param outputId - Output ID to query.
   * @returns Output status including spent/unspent.
   */
  getOutputStatus(outputId: string): Promise<P2MROutputStatus>;

  /**
   * Verify a Merkle proof off-chain (without submitting transaction).
   *
   * @param leafHash - SHA-256 hash of the script leaf.
   * @param merkleRoot - Expected Merkle root.
   * @param proof - Array of sibling hashes with positions.
   * @returns True if the proof is valid.
   */
  verifyMerkleProof(
    leafHash: string,
    merkleRoot: string,
    proof: Array<{ hash: string; position: "left" | "right" }>,
  ): Promise<boolean>;
}

/**
 * Combined port for full P2MR operations.
 */
export interface IP2MRProtocolAdapter
  extends IP2MRCreatePort, IP2MRSpendPort, IP2MRQueryPort {
  /**
   * Protocol identifier.
   */
  readonly protocol: "besu" | "fabric" | "corda";

  /**
   * Protocol-specific configuration.
   */
  readonly config: P2MRProtocolConfig;
}

/**
 * Configuration for P2MR protocol adapter.
 */
export interface P2MRProtocolConfig {
  /** Contract address (Besu) or chaincode name (Fabric). */
  contractAddress?: string;
  chaincodeName?: string;

  /** Channel name (Fabric). */
  channelName?: string;

  /** Network/chain ID (Besu). */
  chainId?: number;

  /** Relayer configuration (for ML-DSA verification). */
  relayer?: {
    endpoint: string;
    publicKey?: string;
  };
}
