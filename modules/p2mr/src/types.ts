/**
 * P2MR (Pay-to-Merkle-Root) Core Types
 *
 * BIP-360-inspired quantum-safe output pattern. The on-chain commitment stores
 * ONLY the Merkle root of a script tree—no public keys exposed until spend time.
 *
 * This eliminates the "harvest now, decrypt later" quantum threat.
 */

// ---------------------------------------------------------------------------
// Script Leaf Types
// ---------------------------------------------------------------------------

/**
 * Supported spending condition types for P2MR outputs.
 *
 * Each type defines what witness data is required and how verification proceeds.
 */
export type ScriptLeafType =
  | "ml-dsa-65-sig" // Single ML-DSA-65 signature (FIPS 204)
  | "timelock" // Time-locked ML-DSA-65 signature
  | "multisig-ml-dsa" // k-of-n ML-DSA-65 threshold
  | "hsm-attested-sig"; // HSM-backed ML-DSA-65 signature

/**
 * A spending condition in the script tree.
 *
 * Each leaf contains:
 * - The type of condition (signature, timelock, multisig, HSM)
 * - SHA-256 hashes of authorized ML-DSA-65 public keys (NOT the keys themselves)
 * - Condition-specific parameters (threshold, locktime, HSM slot)
 *
 * The actual public keys are only revealed at spend time in the witness.
 */
export interface ScriptLeaf {
  /** Spending condition type. */
  type: ScriptLeafType;

  /**
   * SHA-256 hashes of authorized ML-DSA-65 public keys.
   *
   * For single-signature conditions, this array has exactly one element.
   * For multisig conditions, this array has n elements (the full set).
   *
   * Format: 64 hex characters (32 bytes) per hash.
   */
  publicKeyHashes: string[];

  /**
   * For multisig: minimum number of valid signatures required.
   * Defaults to publicKeyHashes.length if not specified (all required).
   */
  threshold?: number;

  /**
   * For timelock: Unix timestamp (milliseconds) after which spending is allowed.
   * The witness must include a timestamp >= this value.
   */
  locktime?: number;

  /**
   * For HSM-attested: identifier of the required HSM slot.
   * The witness must include attestation proof from this specific HSM.
   */
  hsmSlotId?: string;
}

// ---------------------------------------------------------------------------
// P2MR Output
// ---------------------------------------------------------------------------

/**
 * A P2MR output stored on-chain.
 *
 * The critical property: only the Merkle root is stored—no public keys.
 * This means a quantum adversary cannot harvest keys from unspent outputs.
 */
export interface P2MROutput {
  /**
   * Unique identifier for this output.
   * Format: UUID v4 (36 characters including hyphens).
   */
  outputId: string;

  /**
   * Merkle root of the script tree.
   * Format: 64 hex characters (32 bytes SHA-256).
   *
   * This is the ONLY commitment stored on-chain.
   */
  merkleRoot: string;

  /**
   * Value locked in this output.
   * Units depend on the platform (wei for Besu, cents for fiat, etc.).
   */
  value: bigint;

  /**
   * Block timestamp when the output was created.
   * Unix timestamp in milliseconds.
   */
  createdAt: number;

  /**
   * Optional: SHA-256 hash of off-chain metadata.
   * Useful for linking to detailed transaction information stored elsewhere.
   */
  metadataHash?: string;
}

// ---------------------------------------------------------------------------
// Merkle Proof
// ---------------------------------------------------------------------------

/**
 * A single node in a Merkle proof path.
 *
 * To verify, start with the leaf hash and iteratively combine with siblings:
 * - If position is "left", compute SHA-256(sibling || current)
 * - If position is "right", compute SHA-256(current || sibling)
 */
export interface MerkleProofNode {
  /**
   * Hash of the sibling node.
   * Format: 64 hex characters (32 bytes SHA-256).
   */
  hash: string;

  /**
   * Position of the sibling relative to the current node.
   * "left" means sibling is on the left (comes first in concatenation).
   * "right" means sibling is on the right (comes second).
   */
  position: "left" | "right";
}

// ---------------------------------------------------------------------------
// Spend Witness
// ---------------------------------------------------------------------------

/**
 * Witness data revealed at spend time.
 *
 * This is the ONLY place where actual public keys appear—at the moment of spending.
 * By this point, the output is being consumed, so quantum exposure is minimized.
 */
export interface SpendWitness {
  /**
   * Revealed ML-DSA-65 public keys.
   * Each key is 1952 bytes (per FIPS 204 ML-DSA-65 spec).
   *
   * The SHA-256 hash of each key must match an entry in the script leaf's
   * publicKeyHashes array.
   */
  publicKeys: Uint8Array[];

  /**
   * ML-DSA-65 signatures over the spend message.
   * Each signature is 3309 bytes (per FIPS 204 ML-DSA-65 spec).
   *
   * The number of signatures must satisfy the leaf's condition:
   * - ml-dsa-65-sig: exactly 1
   * - timelock: exactly 1
   * - multisig-ml-dsa: >= threshold
   * - hsm-attested-sig: exactly 1
   */
  signatures: Uint8Array[];

  /**
   * Current timestamp for timelock verification.
   * Required when spending via a "timelock" leaf.
   * Must be >= leaf.locktime for the spend to be valid.
   */
  timestamp?: number;

  /**
   * HSM attestation proof for HSM-attested spending.
   * Required when spending via an "hsm-attested-sig" leaf.
   * Format depends on the HSM (typically a signed attestation blob).
   */
  hsmAttestation?: string;
}

// ---------------------------------------------------------------------------
// Spend Proof
// ---------------------------------------------------------------------------

/**
 * Complete proof required to spend a P2MR output.
 *
 * Contains:
 * 1. Which output to spend
 * 2. Which spending condition (leaf) is being satisfied
 * 3. Merkle proof from leaf to root
 * 4. Witness data (keys, signatures, condition-specific data)
 */
export interface SpendProof {
  /**
   * ID of the output being spent.
   * Must match an existing unspent P2MR output.
   */
  outputId: string;

  /**
   * The script leaf being satisfied.
   * Its hash must be verifiable via the Merkle proof to the output's root.
   */
  revealedLeaf: ScriptLeaf;

  /**
   * Merkle proof from the leaf to the root.
   * Array of sibling hashes with position indicators.
   * Length is O(log n) where n is the number of leaves.
   */
  merkleProof: MerkleProofNode[];

  /**
   * Witness data satisfying the leaf's spending condition.
   */
  witness: SpendWitness;
}

// ---------------------------------------------------------------------------
// Verification Results
// ---------------------------------------------------------------------------

/**
 * Result of verifying a spend proof.
 */
export interface SpendVerificationResult {
  /** Whether the spend proof is valid. */
  valid: boolean;

  /** Human-readable reason for the result. */
  reason: string;

  /** Detailed audit trail of verification steps. */
  auditTrail?: VerificationStep[];
}

/**
 * A single step in the verification audit trail.
 */
export interface VerificationStep {
  /** Name of the verification step. */
  step: string;

  /** Whether this step passed. */
  passed: boolean;

  /** Additional details about this step. */
  detail?: string;
}

/**
 * Result of script interpretation (condition-specific verification).
 */
export interface ScriptVerificationResult {
  /** Whether the script condition was satisfied. */
  valid: boolean;

  /** Human-readable reason for the result. */
  reason: string;
}
