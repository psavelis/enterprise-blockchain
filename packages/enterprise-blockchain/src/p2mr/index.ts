/**
 * @psavelis/enterprise-blockchain/p2mr
 *
 * BIP-360-inspired Pay-to-Merkle-Root quantum-safe outputs.
 *
 * P2MR eliminates the "harvest now, decrypt later" quantum threat by:
 * 1. Storing ONLY a Merkle root on-chain (no public keys exposed)
 * 2. Using post-quantum ML-DSA-65 signatures for spending
 * 3. Revealing public keys only at spend time (minimizing exposure window)
 *
 * @example
 * ```typescript
 * import {
 *   createP2MROutput,
 *   createSingleSigLeaf,
 *   createTimelockLeaf,
 *   buildSpendProof,
 *   verifySpendProofStructure,
 * } from "@psavelis/enterprise-blockchain/p2mr";
 *
 * // Create an output with two spending paths
 * const { output, tree } = createP2MROutput({
 *   leaves: [
 *     createSingleSigLeaf(primaryKeyHash),   // Path 0: primary key
 *     createTimelockLeaf(backupKeyHash, locktime), // Path 1: backup after locktime
 *   ],
 *   value: 1_000_000n,
 * });
 *
 * // Store `output` on-chain (only merkleRoot exposed)
 * // Keep `tree` off-chain for generating spend proofs
 *
 * // Later, spend via path 0:
 * const proof = buildSpendProof({
 *   outputId: output.outputId,
 *   tree,
 *   leafIndex: 0,
 *   witness: {
 *     publicKeys: [primaryKey],
 *     signatures: [signature],
 *   },
 * });
 *
 * // Verify proof structure and Merkle path
 * const result = verifySpendProofStructure(proof, output);
 * console.log(result.valid); // true
 * ```
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  ScriptLeafType,
  ScriptLeaf,
  P2MROutput,
  MerkleProofNode,
  SpendWitness,
  SpendProof,
  SpendVerificationResult,
  VerificationStep,
  ScriptVerificationResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Merkle Tree
// ---------------------------------------------------------------------------

export { MerkleTree, canonicalJSON, hashScriptLeaf } from "./merkle-tree.js";

// ---------------------------------------------------------------------------
// Script Leaf
// ---------------------------------------------------------------------------

export type { ValidationResult } from "./script-leaf.js";

export {
  validateScriptLeaf,
  createSingleSigLeaf,
  createTimelockLeaf,
  createMultisigLeaf,
  createHsmAttestedLeaf,
} from "./script-leaf.js";

// ---------------------------------------------------------------------------
// P2MR Output
// ---------------------------------------------------------------------------

export type {
  CreateP2MROutputOptions,
  CreateP2MROutputResult,
} from "./p2mr-output.js";

export { createP2MROutput, P2MROutputStore } from "./p2mr-output.js";

// ---------------------------------------------------------------------------
// Spend Proof
// ---------------------------------------------------------------------------

export type { BuildSpendProofOptions } from "./spend-proof.js";

export {
  buildSpendProof,
  validateSpendProofStructure,
  verifyMerkleProof,
  verifySpendProofStructure,
} from "./spend-proof.js";

// ---------------------------------------------------------------------------
// Script Interpreter
// ---------------------------------------------------------------------------

export type {
  InterpretScriptOptions,
  InterpretScriptResult,
} from "./script-interpreter.js";

export {
  interpretScript,
  hashPublicKey,
  configureInterpreter,
  resetInterpreter,
} from "./script-interpreter.js";

// ---------------------------------------------------------------------------
// Ports and Adapters (Hexagonal Architecture)
// ---------------------------------------------------------------------------

export type {
  SignatureVerificationPort,
  HashingPort,
  SignatureAlgorithm,
} from "./ports.js";

export {
  MlDsaSignatureVerifier,
  Sha256Hasher,
  defaultSignatureVerifier,
  defaultHasher,
} from "./adapters.js";
