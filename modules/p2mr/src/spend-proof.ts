/**
 * Spend Proof Construction and Validation
 *
 * Provides functions for building and validating spend proofs.
 * A spend proof demonstrates that:
 * 1. The revealed leaf hashes to the output's Merkle root
 * 2. The witness satisfies the leaf's spending condition
 */

import type {
  P2MROutput,
  ScriptLeaf,
  SpendProof,
  SpendWitness,
  MerkleProofNode,
  SpendVerificationResult,
  VerificationStep,
} from "./types";
import { MerkleTree, hashScriptLeaf } from "./merkle-tree";
import { validateScriptLeaf } from "./script-leaf";

// ---------------------------------------------------------------------------
// Spend Proof Builder
// ---------------------------------------------------------------------------

/**
 * Options for building a spend proof.
 */
export interface BuildSpendProofOptions {
  /**
   * ID of the output being spent.
   */
  outputId: string;

  /**
   * The Merkle tree containing the spending conditions.
   * This must be the same tree used to create the output.
   */
  tree: MerkleTree;

  /**
   * Index of the leaf (spending condition) to use.
   */
  leafIndex: number;

  /**
   * Witness data satisfying the spending condition.
   */
  witness: SpendWitness;
}

/**
 * Build a spend proof for a P2MR output.
 *
 * The proof consists of:
 * 1. The output ID being spent
 * 2. The revealed script leaf (spending condition)
 * 3. A Merkle proof from the leaf to the root
 * 4. Witness data (public keys, signatures, etc.)
 *
 * @param options - Spend proof options.
 * @returns A complete spend proof.
 * @throws Error if leaf index is out of bounds.
 *
 * @example
 * ```typescript
 * const proof = buildSpendProof({
 *   outputId: output.outputId,
 *   tree: merkleTree,
 *   leafIndex: 0,
 *   witness: {
 *     publicKeys: [myPublicKey],
 *     signatures: [mySignature],
 *   },
 * });
 * ```
 */
export function buildSpendProof(options: BuildSpendProofOptions): SpendProof {
  const { outputId, tree, leafIndex, witness } = options;

  const leaves = tree.leaves;
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error(
      `Leaf index ${leafIndex} out of bounds [0, ${leaves.length - 1}]`,
    );
  }

  const revealedLeaf = leaves[leafIndex]!;
  const merkleProof = tree.getProof(leafIndex);

  return {
    outputId,
    revealedLeaf,
    merkleProof,
    witness,
  };
}

// ---------------------------------------------------------------------------
// Spend Proof Validation (Structural)
// ---------------------------------------------------------------------------

/**
 * Validate the structural correctness of a spend proof.
 *
 * This performs preliminary checks that don't require cryptographic
 * signature verification. Full validation requires the script interpreter.
 *
 * Checks:
 * 1. Output ID is present
 * 2. Revealed leaf passes structural validation
 * 3. Merkle proof is structurally valid
 * 4. Witness has required fields for the leaf type
 *
 * @param proof - The spend proof to validate.
 * @returns Validation result with error if invalid.
 */
export function validateSpendProofStructure(
  proof: SpendProof,
): SpendVerificationResult {
  const auditTrail: VerificationStep[] = [];

  // Step 1: Validate output ID
  if (!proof.outputId || proof.outputId.length === 0) {
    auditTrail.push({
      step: "Output ID check",
      passed: false,
      detail: "Output ID is required",
    });
    return {
      valid: false,
      reason: "Missing output ID",
      auditTrail,
    };
  }
  auditTrail.push({
    step: "Output ID check",
    passed: true,
    detail: `Output ID: ${proof.outputId}`,
  });

  // Step 2: Validate revealed leaf structure
  const leafResult = validateScriptLeaf(proof.revealedLeaf);
  if (!leafResult.valid) {
    const errorMsg = leafResult.error ?? "Unknown validation error";
    auditTrail.push({
      step: "Leaf structure check",
      passed: false,
      detail: errorMsg,
    });
    return {
      valid: false,
      reason: `Invalid leaf: ${errorMsg}`,
      auditTrail,
    };
  }
  auditTrail.push({
    step: "Leaf structure check",
    passed: true,
    detail: `Type: ${proof.revealedLeaf.type}`,
  });

  // Step 3: Validate Merkle proof structure
  if (!Array.isArray(proof.merkleProof)) {
    auditTrail.push({
      step: "Merkle proof structure",
      passed: false,
      detail: "Merkle proof must be an array",
    });
    return {
      valid: false,
      reason: "Invalid Merkle proof structure",
      auditTrail,
    };
  }

  for (let i = 0; i < proof.merkleProof.length; i++) {
    const node = proof.merkleProof[i]!;
    if (!isValidMerkleProofNode(node)) {
      auditTrail.push({
        step: `Merkle proof node ${i}`,
        passed: false,
        detail: "Invalid node structure",
      });
      return {
        valid: false,
        reason: `Invalid Merkle proof node at index ${i}`,
        auditTrail,
      };
    }
  }
  auditTrail.push({
    step: "Merkle proof structure",
    passed: true,
    detail: `Proof length: ${proof.merkleProof.length}`,
  });

  // Step 4: Validate witness structure for leaf type
  const witnessResult = validateWitnessStructure(
    proof.revealedLeaf,
    proof.witness,
  );
  if (!witnessResult.valid) {
    auditTrail.push({
      step: "Witness structure check",
      passed: false,
      detail: witnessResult.reason,
    });
    return {
      valid: false,
      reason: witnessResult.reason,
      auditTrail,
    };
  }
  auditTrail.push({
    step: "Witness structure check",
    passed: true,
    detail: `${proof.witness.publicKeys.length} keys, ${proof.witness.signatures.length} signatures`,
  });

  return {
    valid: true,
    reason: "Spend proof structure is valid",
    auditTrail,
  };
}

/**
 * Verify that a spend proof's Merkle path leads to the expected root.
 *
 * @param proof - The spend proof.
 * @param expectedRoot - The Merkle root from the P2MR output.
 * @returns Verification result.
 */
export function verifyMerkleProof(
  proof: SpendProof,
  expectedRoot: string,
): SpendVerificationResult {
  const auditTrail: VerificationStep[] = [];

  // Compute leaf hash
  const leafHash = hashScriptLeaf(proof.revealedLeaf);
  auditTrail.push({
    step: "Compute leaf hash",
    passed: true,
    detail: `Hash: ${leafHash.substring(0, 16)}...`,
  });

  // Verify Merkle path
  const verified = MerkleTree.verify(
    proof.revealedLeaf,
    proof.merkleProof,
    expectedRoot,
  );

  if (!verified) {
    auditTrail.push({
      step: "Merkle path verification",
      passed: false,
      detail: `Expected root: ${expectedRoot.substring(0, 16)}...`,
    });
    return {
      valid: false,
      reason: "Merkle proof does not verify to expected root",
      auditTrail,
    };
  }

  auditTrail.push({
    step: "Merkle path verification",
    passed: true,
    detail: `Root: ${expectedRoot.substring(0, 16)}...`,
  });

  return {
    valid: true,
    reason: "Merkle proof verified successfully",
    auditTrail,
  };
}

/**
 * Perform full structural and Merkle verification of a spend proof.
 *
 * This does NOT verify signatures - that requires the script interpreter
 * which is implemented separately.
 *
 * @param proof - The spend proof.
 * @param output - The P2MR output being spent.
 * @returns Verification result.
 */
export function verifySpendProofStructure(
  proof: SpendProof,
  output: P2MROutput,
): SpendVerificationResult {
  const auditTrail: VerificationStep[] = [];

  // Step 1: Verify output ID matches
  if (proof.outputId !== output.outputId) {
    auditTrail.push({
      step: "Output ID match",
      passed: false,
      detail: `Proof: ${proof.outputId}, Output: ${output.outputId}`,
    });
    return {
      valid: false,
      reason: "Spend proof output ID does not match output",
      auditTrail,
    };
  }
  auditTrail.push({
    step: "Output ID match",
    passed: true,
    detail: output.outputId,
  });

  // Step 2: Validate proof structure
  const structureResult = validateSpendProofStructure(proof);
  auditTrail.push(...(structureResult.auditTrail ?? []));
  if (!structureResult.valid) {
    return {
      valid: false,
      reason: structureResult.reason,
      auditTrail,
    };
  }

  // Step 3: Verify Merkle proof
  const merkleResult = verifyMerkleProof(proof, output.merkleRoot);
  auditTrail.push(...(merkleResult.auditTrail ?? []));
  if (!merkleResult.valid) {
    return {
      valid: false,
      reason: merkleResult.reason,
      auditTrail,
    };
  }

  return {
    valid: true,
    reason: "Spend proof structure and Merkle path verified",
    auditTrail,
  };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Check if a value is a valid MerkleProofNode.
 */
function isValidMerkleProofNode(node: unknown): node is MerkleProofNode {
  if (typeof node !== "object" || node === null) {
    return false;
  }
  const n = node as Record<string, unknown>;
  if (typeof n.hash !== "string" || !/^[a-f0-9]{64}$/i.test(n.hash)) {
    return false;
  }
  if (n.position !== "left" && n.position !== "right") {
    return false;
  }
  return true;
}

/**
 * Validate witness structure for a given leaf type.
 */
function validateWitnessStructure(
  leaf: ScriptLeaf,
  witness: SpendWitness,
): SpendVerificationResult {
  // Check basic witness requirements
  if (!Array.isArray(witness.publicKeys) || witness.publicKeys.length === 0) {
    return {
      valid: false,
      reason: "Witness must include at least one public key",
    };
  }

  if (!Array.isArray(witness.signatures) || witness.signatures.length === 0) {
    return {
      valid: false,
      reason: "Witness must include at least one signature",
    };
  }

  // Type-specific validation
  switch (leaf.type) {
    case "ml-dsa-65-sig":
      if (witness.publicKeys.length !== 1 || witness.signatures.length !== 1) {
        return {
          valid: false,
          reason: "ml-dsa-65-sig requires exactly 1 public key and 1 signature",
        };
      }
      break;

    case "timelock":
      if (witness.publicKeys.length !== 1 || witness.signatures.length !== 1) {
        return {
          valid: false,
          reason: "timelock requires exactly 1 public key and 1 signature",
        };
      }
      if (typeof witness.timestamp !== "number") {
        return {
          valid: false,
          reason: "timelock requires a timestamp in the witness",
        };
      }
      break;

    case "multisig-ml-dsa": {
      const threshold = leaf.threshold ?? leaf.publicKeyHashes.length;
      if (witness.signatures.length < threshold) {
        return {
          valid: false,
          reason: `multisig-ml-dsa requires at least ${threshold} signatures`,
        };
      }
      if (witness.publicKeys.length < threshold) {
        return {
          valid: false,
          reason: `multisig-ml-dsa requires at least ${threshold} public keys`,
        };
      }
      break;
    }

    case "hsm-attested-sig":
      if (witness.publicKeys.length !== 1 || witness.signatures.length !== 1) {
        return {
          valid: false,
          reason:
            "hsm-attested-sig requires exactly 1 public key and 1 signature",
        };
      }
      if (
        typeof witness.hsmAttestation !== "string" ||
        witness.hsmAttestation.length === 0
      ) {
        return {
          valid: false,
          reason: "hsm-attested-sig requires HSM attestation in the witness",
        };
      }
      break;
  }

  return { valid: true, reason: "Witness structure valid" };
}
