/**
 * P2MR Output Management
 *
 * Provides factory functions and storage patterns for P2MR outputs.
 * Outputs are created by committing to a Merkle root and tracked
 * in an output store for spending.
 */

import { randomUUID } from "node:crypto";
import type { Store } from "../shared/store.js";
import { InMemoryStore } from "../shared/store.js";
import type { P2MROutput, ScriptLeaf } from "./types.js";
import { MerkleTree } from "./merkle-tree.js";

/** Alias for the P2MR output store type (outputId -> P2MROutput). */
type P2MRStore = Store<string, P2MROutput>;

// ---------------------------------------------------------------------------
// P2MR Output Factory
// ---------------------------------------------------------------------------

/**
 * Options for creating a P2MR output.
 */
export interface CreateP2MROutputOptions {
  /**
   * Spending conditions for the output.
   * These are hashed into a Merkle tree; only the root is stored on-chain.
   */
  leaves: ScriptLeaf[];

  /**
   * Value locked in the output.
   */
  value: bigint;

  /**
   * Optional output ID. If not provided, a UUID is generated.
   */
  outputId?: string;

  /**
   * Optional creation timestamp. Defaults to current time.
   */
  createdAt?: number;

  /**
   * Optional metadata hash (SHA-256 of off-chain data).
   */
  metadataHash?: string;
}

/**
 * Result of creating a P2MR output.
 *
 * Returns both the output (for on-chain storage) and the Merkle tree
 * (for generating spend proofs later).
 */
export interface CreateP2MROutputResult {
  /**
   * The P2MR output to store on-chain.
   */
  output: P2MROutput;

  /**
   * The Merkle tree constructed from the spending conditions.
   * Keep this off-chain for generating spend proofs.
   */
  tree: MerkleTree;
}

/**
 * Create a P2MR output from spending conditions.
 *
 * The output stores only the Merkle root; the actual spending conditions
 * (script leaves) are kept off-chain by the creator. This prevents
 * quantum adversaries from harvesting public keys from unspent outputs.
 *
 * @param options - Output creation options.
 * @returns The P2MR output and its Merkle tree.
 * @throws Error if leaves array is empty or value is negative.
 *
 * @example
 * ```typescript
 * import { createP2MROutput, createSingleSigLeaf, createTimelockLeaf } from "@enterprise-blockchain/p2mr";
 *
 * const primaryKey = "a1b2c3..."; // SHA-256 hash of ML-DSA-65 public key
 * const backupKey = "d4e5f6...";
 *
 * const { output, tree } = createP2MROutput({
 *   leaves: [
 *     createSingleSigLeaf(primaryKey),           // Spend path 0: primary key
 *     createTimelockLeaf(backupKey, futureTime), // Spend path 1: backup after 1 year
 *   ],
 *   value: 1_000_000n,
 * });
 *
 * // Store `output` on-chain (only merkleRoot exposed)
 * // Keep `tree` off-chain for generating spend proofs
 * ```
 */
export function createP2MROutput(
  options: CreateP2MROutputOptions,
): CreateP2MROutputResult {
  const { leaves, value, outputId, createdAt, metadataHash } = options;

  if (leaves.length === 0) {
    throw new Error("P2MR output requires at least one spending condition");
  }

  if (value < BigInt(0)) {
    throw new Error("P2MR output value must be non-negative");
  }

  const tree = new MerkleTree(leaves);

  const output: P2MROutput = {
    outputId: outputId ?? randomUUID(),
    merkleRoot: tree.root,
    value,
    createdAt: createdAt ?? Date.now(),
  };

  if (metadataHash) {
    output.metadataHash = metadataHash;
  }

  return { output, tree };
}

// ---------------------------------------------------------------------------
// P2MR Output Store
// ---------------------------------------------------------------------------

/**
 * A store for P2MR outputs indexed by outputId.
 *
 * Provides methods for tracking unspent outputs (UTXOs).
 */
export class P2MROutputStore {
  readonly #store: P2MRStore;
  readonly #spentSet: Set<string>;

  /**
   * Create a new P2MR output store.
   *
   * @param store - Optional backing store. Defaults to in-memory.
   */
  constructor(store?: P2MRStore) {
    this.#store = store ?? new InMemoryStore<string, P2MROutput>();
    this.#spentSet = new Set();
  }

  /**
   * Add an output to the store.
   *
   * @param output - The P2MR output to store.
   * @throws Error if output with same ID already exists.
   */
  add(output: P2MROutput): void {
    const existing = this.#store.get(output.outputId);
    if (existing) {
      throw new Error(`Output ${output.outputId} already exists`);
    }
    this.#store.set(output.outputId, output);
  }

  /**
   * Get an output by ID.
   *
   * @param outputId - The output ID.
   * @returns The output, or undefined if not found.
   */
  get(outputId: string): P2MROutput | undefined {
    return this.#store.get(outputId);
  }

  /**
   * Check if an output is unspent.
   *
   * @param outputId - The output ID.
   * @returns true if the output exists and has not been spent.
   */
  isUnspent(outputId: string): boolean {
    if (this.#spentSet.has(outputId)) {
      return false;
    }
    const output = this.#store.get(outputId);
    return output !== undefined;
  }

  /**
   * Mark an output as spent.
   *
   * @param outputId - The output ID.
   * @throws Error if output does not exist or is already spent.
   */
  markSpent(outputId: string): void {
    const output = this.#store.get(outputId);
    if (!output) {
      throw new Error(`Output ${outputId} does not exist`);
    }
    if (this.#spentSet.has(outputId)) {
      throw new Error(`Output ${outputId} is already spent`);
    }
    this.#spentSet.add(outputId);
  }

  /**
   * Get all unspent outputs.
   *
   * @returns Array of unspent P2MR outputs.
   */
  getUnspent(): P2MROutput[] {
    const all = Array.from(this.#store.values());
    return all.filter((output) => !this.#spentSet.has(output.outputId));
  }

  /**
   * Get total value of all unspent outputs.
   *
   * @returns Sum of all unspent output values.
   */
  getUnspentBalance(): bigint {
    const unspent = this.getUnspent();
    return unspent.reduce((sum, output) => sum + output.value, BigInt(0));
  }
}
