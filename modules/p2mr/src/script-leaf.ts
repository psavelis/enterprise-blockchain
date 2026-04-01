/**
 * Script Leaf Creation and Validation
 *
 * Provides factory functions and validation for P2MR script leaves.
 * Each leaf type has specific requirements for its parameters.
 */

import type { ScriptLeaf, ScriptLeafType } from "./types";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a public key hash format.
 *
 * @param hash - Hash to validate.
 * @returns true if the hash is 64 hex characters.
 */
function isValidPublicKeyHash(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}

/**
 * Validation result with optional error message.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a script leaf for correctness.
 *
 * Checks:
 * - Type is a valid ScriptLeafType
 * - publicKeyHashes is non-empty and contains valid hashes
 * - Condition-specific parameters are valid
 *
 * @param leaf - Script leaf to validate.
 * @returns Validation result with error message if invalid.
 */
export function validateScriptLeaf(leaf: ScriptLeaf): ValidationResult {
  // Validate type
  const validTypes: ScriptLeafType[] = [
    "ml-dsa-65-sig",
    "timelock",
    "multisig-ml-dsa",
    "hsm-attested-sig",
  ];
  if (!validTypes.includes(leaf.type)) {
    return { valid: false, error: `Invalid script leaf type: ${leaf.type}` };
  }

  // Validate publicKeyHashes
  if (
    !Array.isArray(leaf.publicKeyHashes) ||
    leaf.publicKeyHashes.length === 0
  ) {
    return { valid: false, error: "publicKeyHashes must be a non-empty array" };
  }

  for (let i = 0; i < leaf.publicKeyHashes.length; i++) {
    if (!isValidPublicKeyHash(leaf.publicKeyHashes[i]!)) {
      return {
        valid: false,
        error: `Invalid public key hash at index ${i}: must be 64 hex characters`,
      };
    }
  }

  // Type-specific validation
  switch (leaf.type) {
    case "ml-dsa-65-sig":
      // Single signature requires exactly one public key hash
      if (leaf.publicKeyHashes.length !== 1) {
        return {
          valid: false,
          error: "ml-dsa-65-sig requires exactly one public key hash",
        };
      }
      break;

    case "timelock":
      // Timelock requires exactly one public key hash and a locktime
      if (leaf.publicKeyHashes.length !== 1) {
        return {
          valid: false,
          error: "timelock requires exactly one public key hash",
        };
      }
      if (typeof leaf.locktime !== "number" || leaf.locktime < 0) {
        return {
          valid: false,
          error: "timelock requires a non-negative locktime",
        };
      }
      break;

    case "multisig-ml-dsa": {
      // Multisig requires at least 2 public key hashes and valid threshold
      if (leaf.publicKeyHashes.length < 2) {
        return {
          valid: false,
          error: "multisig-ml-dsa requires at least 2 public key hashes",
        };
      }
      const threshold = leaf.threshold ?? leaf.publicKeyHashes.length;
      if (threshold < 1 || threshold > leaf.publicKeyHashes.length) {
        return {
          valid: false,
          error: `threshold must be between 1 and ${leaf.publicKeyHashes.length}`,
        };
      }
      break;
    }

    case "hsm-attested-sig":
      // HSM-attested requires exactly one public key hash and an HSM slot ID
      if (leaf.publicKeyHashes.length !== 1) {
        return {
          valid: false,
          error: "hsm-attested-sig requires exactly one public key hash",
        };
      }
      if (typeof leaf.hsmSlotId !== "string" || leaf.hsmSlotId.length === 0) {
        return {
          valid: false,
          error: "hsm-attested-sig requires a non-empty hsmSlotId",
        };
      }
      break;
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Create a simple ML-DSA-65 signature leaf.
 *
 * Requires a single valid signature from the specified public key.
 *
 * @param publicKeyHash - SHA-256 hash of the authorized ML-DSA-65 public key.
 * @returns A validated ScriptLeaf.
 * @throws Error if the hash is invalid.
 */
export function createSingleSigLeaf(publicKeyHash: string): ScriptLeaf {
  const leaf: ScriptLeaf = {
    type: "ml-dsa-65-sig",
    publicKeyHashes: [publicKeyHash],
  };

  const result = validateScriptLeaf(leaf);
  if (!result.valid) {
    throw new Error(result.error);
  }

  return leaf;
}

/**
 * Create a time-locked signature leaf.
 *
 * Requires a valid signature from the specified public key, but only after
 * the locktime has passed.
 *
 * @param publicKeyHash - SHA-256 hash of the authorized ML-DSA-65 public key.
 * @param locktime - Unix timestamp (ms) after which spending is allowed.
 * @returns A validated ScriptLeaf.
 * @throws Error if parameters are invalid.
 */
export function createTimelockLeaf(
  publicKeyHash: string,
  locktime: number,
): ScriptLeaf {
  const leaf: ScriptLeaf = {
    type: "timelock",
    publicKeyHashes: [publicKeyHash],
    locktime,
  };

  const result = validateScriptLeaf(leaf);
  if (!result.valid) {
    throw new Error(result.error);
  }

  return leaf;
}

/**
 * Create a multisig leaf requiring k-of-n signatures.
 *
 * @param publicKeyHashes - SHA-256 hashes of all authorized ML-DSA-65 public keys.
 * @param threshold - Minimum number of valid signatures required.
 * @returns A validated ScriptLeaf.
 * @throws Error if parameters are invalid.
 */
export function createMultisigLeaf(
  publicKeyHashes: string[],
  threshold: number,
): ScriptLeaf {
  const leaf: ScriptLeaf = {
    type: "multisig-ml-dsa",
    publicKeyHashes: [...publicKeyHashes],
    threshold,
  };

  const result = validateScriptLeaf(leaf);
  if (!result.valid) {
    throw new Error(result.error);
  }

  return leaf;
}

/**
 * Create an HSM-attested signature leaf.
 *
 * Requires a valid signature from the specified public key, plus attestation
 * proof that the signature was produced by the specified HSM slot.
 *
 * @param publicKeyHash - SHA-256 hash of the authorized ML-DSA-65 public key.
 * @param hsmSlotId - Identifier of the required HSM slot.
 * @returns A validated ScriptLeaf.
 * @throws Error if parameters are invalid.
 */
export function createHsmAttestedLeaf(
  publicKeyHash: string,
  hsmSlotId: string,
): ScriptLeaf {
  const leaf: ScriptLeaf = {
    type: "hsm-attested-sig",
    publicKeyHashes: [publicKeyHash],
    hsmSlotId,
  };

  const result = validateScriptLeaf(leaf);
  if (!result.valid) {
    throw new Error(result.error);
  }

  return leaf;
}
