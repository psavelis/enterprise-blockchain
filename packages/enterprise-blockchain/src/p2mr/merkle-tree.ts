/**
 * Merkle Tree for P2MR Script Trees
 *
 * Constructs a binary Merkle tree from an array of ScriptLeaf nodes.
 * Provides proof generation and verification for spending P2MR outputs.
 *
 * Construction algorithm:
 * 1. Each leaf = SHA-256(canonicalJSON(ScriptLeaf)) → 64-char hex string
 * 2. Internal nodes = SHA-256(leftHex + rightHex) where + is string concatenation
 *    (i.e., hashing the 128-char hex string, not raw 64 bytes)
 * 3. Odd leaf count: duplicate last leaf for balanced tree
 * 4. Root = final 32-byte hash (64 hex chars)
 *
 * NOTE: This implementation hashes hex-encoded strings, not raw bytes.
 * For example, sha256hex("abc...def" + "012...345") hashes the 128-character
 * hex string, producing deterministic results portable across platforms.
 */

import { sha256hex } from "../shared/crypto.js";
import type { ScriptLeaf, MerkleProofNode } from "./types.js";

// ---------------------------------------------------------------------------
// Canonical JSON Serialization
// ---------------------------------------------------------------------------

/**
 * Serialize an object to canonical JSON (sorted keys).
 *
 * This ensures deterministic hashing regardless of object property order.
 * Required for Merkle tree construction to be reproducible.
 */
export function canonicalJSON(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalJSON(item)).join(",") + "]";
  }

  if (typeof obj === "object") {
    const sorted = Object.keys(obj as Record<string, unknown>)
      .sort()
      .map((key) => {
        const value = (obj as Record<string, unknown>)[key];
        // Skip undefined values
        if (value === undefined) {
          return null;
        }
        return `${JSON.stringify(key)}:${canonicalJSON(value)}`;
      })
      .filter((item) => item !== null);
    return "{" + sorted.join(",") + "}";
  }

  return JSON.stringify(obj);
}

/**
 * Compute SHA-256 hash of a ScriptLeaf using canonical JSON.
 */
export function hashScriptLeaf(leaf: ScriptLeaf): string {
  return sha256hex(canonicalJSON(leaf));
}

// ---------------------------------------------------------------------------
// MerkleTree Class
// ---------------------------------------------------------------------------

/**
 * A Merkle tree constructed from an array of ScriptLeaf spending conditions.
 *
 * Usage:
 * ```typescript
 * const tree = new MerkleTree([
 *   { type: "ml-dsa-65-sig", publicKeyHashes: [hash1] },
 *   { type: "multisig-ml-dsa", publicKeyHashes: [hash2, hash3], threshold: 2 },
 *   { type: "timelock", publicKeyHashes: [hash4], locktime: futureTime },
 * ]);
 *
 * const output: P2MROutput = {
 *   outputId: randomUUID(),
 *   merkleRoot: tree.root,
 *   value: 1000000n,
 *   createdAt: Date.now(),
 * };
 *
 * // Later, to spend via leaf 0:
 * const proof = tree.getProof(0);
 * ```
 */
export class MerkleTree {
  /**
   * The original leaves (script conditions).
   */
  readonly #leaves: ScriptLeaf[];

  /**
   * Leaf hashes (SHA-256 of canonical JSON).
   */
  readonly #leafHashes: string[];

  /**
   * All levels of the tree, from leaves (level 0) to root (last level).
   * Each level is an array of hashes.
   */
  readonly #levels: string[][];

  /**
   * Construct a Merkle tree from an array of script leaves.
   *
   * @param leaves - Array of spending conditions. Must have at least 1 element.
   * @throws Error if leaves array is empty.
   */
  constructor(leaves: ScriptLeaf[]) {
    if (leaves.length === 0) {
      throw new Error("MerkleTree requires at least one leaf");
    }

    this.#leaves = [...leaves];
    this.#leafHashes = leaves.map(hashScriptLeaf);
    this.#levels = this.#buildTree();
  }

  /**
   * The Merkle root hash.
   * Format: 64 hex characters (32 bytes SHA-256).
   */
  get root(): string {
    return this.#levels[this.#levels.length - 1]![0]!;
  }

  /**
   * The original script leaves.
   */
  get leaves(): readonly ScriptLeaf[] {
    return this.#leaves;
  }

  /**
   * The leaf hashes (SHA-256 of canonical JSON).
   */
  get leafHashes(): readonly string[] {
    return this.#leafHashes;
  }

  /**
   * Number of leaves in the tree.
   */
  get leafCount(): number {
    return this.#leaves.length;
  }

  /**
   * Generate a Merkle proof for a specific leaf.
   *
   * @param leafIndex - Zero-based index of the leaf.
   * @returns Array of MerkleProofNode from leaf to root.
   * @throws Error if leafIndex is out of bounds.
   */
  getProof(leafIndex: number): MerkleProofNode[] {
    if (leafIndex < 0 || leafIndex >= this.#leaves.length) {
      throw new Error(
        `Leaf index ${leafIndex} out of bounds [0, ${this.#leaves.length - 1}]`,
      );
    }

    const proof: MerkleProofNode[] = [];
    let idx = leafIndex;

    // Traverse from leaves up to (but not including) the root
    for (let level = 0; level < this.#levels.length - 1; level++) {
      const currentLevel = this.#levels[level]!;
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;

      // Handle case where sibling doesn't exist (odd number of nodes)
      if (siblingIdx < currentLevel.length) {
        proof.push({
          hash: currentLevel[siblingIdx]!,
          position: idx % 2 === 0 ? "right" : "left",
        });
      }

      // Move to parent index
      idx = Math.floor(idx / 2);
    }

    return proof;
  }

  /**
   * Verify that a leaf hashes to the expected root via a proof.
   *
   * This is a static method so it can be used without the full tree.
   *
   * @param leaf - The script leaf to verify.
   * @param proof - Merkle proof path.
   * @param expectedRoot - Expected Merkle root.
   * @returns true if the proof is valid.
   */
  static verify(
    leaf: ScriptLeaf,
    proof: MerkleProofNode[],
    expectedRoot: string,
  ): boolean {
    let hash = hashScriptLeaf(leaf);

    for (const node of proof) {
      const combined =
        node.position === "left" ? node.hash + hash : hash + node.hash;
      hash = sha256hex(combined);
    }

    return hash === expectedRoot;
  }

  /**
   * Verify a leaf hash (already computed) against a proof.
   *
   * Useful when you have the hash but not the original leaf data.
   *
   * @param leafHash - SHA-256 hash of the leaf.
   * @param proof - Merkle proof path.
   * @param expectedRoot - Expected Merkle root.
   * @returns true if the proof is valid.
   */
  static verifyHash(
    leafHash: string,
    proof: MerkleProofNode[],
    expectedRoot: string,
  ): boolean {
    let hash = leafHash;

    for (const node of proof) {
      const combined =
        node.position === "left" ? node.hash + hash : hash + node.hash;
      hash = sha256hex(combined);
    }

    return hash === expectedRoot;
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  /**
   * Build the tree from leaf hashes up to the root.
   */
  #buildTree(): string[][] {
    const levels: string[][] = [];

    // Level 0: leaf hashes (possibly padded to even count)
    let currentLevel = [...this.#leafHashes];
    if (currentLevel.length % 2 === 1 && currentLevel.length > 1) {
      // Duplicate last leaf for odd count
      currentLevel.push(currentLevel[currentLevel.length - 1]!);
    }
    levels.push(currentLevel);

    // Build parent levels until we reach the root
    while (currentLevel.length > 1) {
      const parentLevel: string[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i]!;
        const right = currentLevel[i + 1] ?? left; // Handle odd case
        parentLevel.push(sha256hex(left + right));
      }

      levels.push(parentLevel);
      currentLevel = parentLevel;
    }

    return levels;
  }
}
