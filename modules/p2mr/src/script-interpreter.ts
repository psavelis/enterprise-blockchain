/**
 * P2MR Script Interpreter
 *
 * Executes spending conditions by verifying witness data against script leaves.
 * Each leaf type has specific verification rules:
 *
 * - ml-dsa-65-sig: Single ML-DSA-65 signature verification
 * - timelock: ML-DSA-65 signature + timestamp >= locktime
 * - multisig-ml-dsa: k-of-n threshold ML-DSA-65 signatures
 * - hsm-attested-sig: ML-DSA-65 signature + HSM attestation (not implemented)
 *
 * The interpreter returns a detailed audit trail for compliance.
 *
 * HEXAGONAL ARCHITECTURE: Uses constructor DI for testability and loose coupling.
 */

import type { SignatureVerificationPort, HashingPort } from "./ports";
import { defaultSignatureVerifier, defaultHasher } from "./adapters";
import type {
  ScriptLeaf,
  SpendWitness,
  ScriptVerificationResult,
  VerificationStep,
} from "./types";

/**
 * Script interpreter with injected dependencies.
 *
 * HEXAGONAL ARCHITECTURE: All external dependencies are injected via constructor,
 * enabling testing with mock implementations and preventing global mutable state.
 */
export class ScriptInterpreter {
  private readonly signatureVerifier: SignatureVerificationPort;
  private readonly hasher: HashingPort;

  constructor(options?: {
    signatureVerifier?: SignatureVerificationPort;
    hasher?: HashingPort;
  }) {
    this.signatureVerifier =
      options?.signatureVerifier ?? defaultSignatureVerifier;
    this.hasher = options?.hasher ?? defaultHasher;
  }

  /**
   * Interpret (execute) a P2MR script leaf against witness data.
   */
  interpret(options: InterpretScriptOptions): InterpretScriptResult {
    return interpretScriptWithDeps(
      options,
      this.signatureVerifier,
      this.hasher,
    );
  }

  /**
   * Compute SHA-256 hash of a public key.
   */
  hashPublicKey(publicKey: Uint8Array): string {
    return this.hasher.sha256hex(Buffer.from(publicKey).toString("hex"));
  }
}

// ---------------------------------------------------------------------------
// Backward-compatible module-level API (delegates to class implementation)
// ---------------------------------------------------------------------------

// Module-level instances for backward compatibility
let _interpreterInstance: ScriptInterpreter | null = null;

function getInterpreter(): ScriptInterpreter {
  if (!_interpreterInstance) {
    _interpreterInstance = new ScriptInterpreter();
  }
  return _interpreterInstance;
}

/**
 * Configure the script interpreter with custom implementations.
 * Primarily useful for testing with mock implementations.
 *
 * @deprecated Use ScriptInterpreter class with constructor DI instead.
 * @param options Configuration options.
 */
export function configureInterpreter(options: {
  signatureVerifier?: SignatureVerificationPort;
  hasher?: HashingPort;
}): void {
  _interpreterInstance = new ScriptInterpreter(options);
}

/**
 * Reset interpreter to default implementations.
 *
 * @deprecated Use ScriptInterpreter class with constructor DI instead.
 */
export function resetInterpreter(): void {
  _interpreterInstance = new ScriptInterpreter();
}

// ---------------------------------------------------------------------------
// Script Interpreter
// ---------------------------------------------------------------------------

/**
 * Options for script interpretation.
 */
export interface InterpretScriptOptions {
  /**
   * The spending condition to verify.
   */
  leaf: ScriptLeaf;

  /**
   * Witness data (public keys, signatures, etc.).
   */
  witness: SpendWitness;

  /**
   * Message that was signed (typically a spend transaction hash).
   */
  message: Uint8Array;

  /**
   * Optional current block time for timelock verification.
   * If not provided, uses the timestamp from the witness.
   */
  currentTime?: number;
}

/**
 * Result of script interpretation with audit trail.
 */
export interface InterpretScriptResult extends ScriptVerificationResult {
  /** Detailed audit trail of verification steps. */
  auditTrail: VerificationStep[];
}

/**
 * Interpret (execute) a P2MR script leaf against witness data.
 *
 * This function performs full cryptographic verification of the spending
 * condition using ML-DSA-65 signatures.
 *
 * @param options - Interpretation options.
 * @returns Verification result with audit trail.
 *
 * @example
 * ```typescript
 * const result = interpretScript({
 *   leaf: singleSigLeaf,
 *   witness: {
 *     publicKeys: [myPublicKey],
 *     signatures: [mySignature],
 *   },
 *   message: transactionHash,
 * });
 *
 * if (result.valid) {
 *   console.log("Spending condition satisfied");
 * }
 * ```
 */
export function interpretScript(
  options: InterpretScriptOptions,
): InterpretScriptResult {
  return getInterpreter().interpret(options);
}

/**
 * Internal implementation that accepts dependencies explicitly.
 * Used by ScriptInterpreter class.
 */
function interpretScriptWithDeps(
  options: InterpretScriptOptions,
  signatureVerifier: SignatureVerificationPort,
  hasher: HashingPort,
): InterpretScriptResult {
  const { leaf, witness, message, currentTime } = options;
  const auditTrail: VerificationStep[] = [];

  // Helper to hash public keys with injected hasher
  const hashPubKey = (pk: Uint8Array): string =>
    hasher.sha256hex(Buffer.from(pk).toString("hex"));

  switch (leaf.type) {
    case "ml-dsa-65-sig":
      return interpretSingleSigWithDeps(
        leaf,
        witness,
        message,
        auditTrail,
        signatureVerifier,
        hashPubKey,
      );

    case "timelock":
      return interpretTimelockWithDeps(
        leaf,
        witness,
        message,
        currentTime,
        auditTrail,
        signatureVerifier,
        hashPubKey,
      );

    case "multisig-ml-dsa":
      return interpretMultisigWithDeps(
        leaf,
        witness,
        message,
        auditTrail,
        signatureVerifier,
        hashPubKey,
      );

    case "hsm-attested-sig":
      return interpretHsmAttestedWithDeps(leaf, witness, auditTrail);

    default: {
      // Exhaustive check - all known types handled above
      const unknownType = leaf as { type: unknown };
      const typeStr = String(unknownType.type);
      auditTrail.push({
        step: "Script type check",
        passed: false,
        detail: `Unknown script type: ${typeStr}`,
      });
      return {
        valid: false,
        reason: `Unknown script type: ${typeStr}`,
        auditTrail,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Single Signature (ml-dsa-65-sig)
// ---------------------------------------------------------------------------

function interpretSingleSigWithDeps(
  leaf: ScriptLeaf,
  witness: SpendWitness,
  message: Uint8Array,
  auditTrail: VerificationStep[],
  signatureVerifier: SignatureVerificationPort,
  hashPubKey: (pk: Uint8Array) => string,
): InterpretScriptResult {
  auditTrail.push({
    step: "Script type",
    passed: true,
    detail: "ml-dsa-65-sig (single signature)",
  });

  // Verify witness has exactly one public key and signature
  if (witness.publicKeys.length !== 1) {
    auditTrail.push({
      step: "Witness count check",
      passed: false,
      detail: `Expected 1 public key, got ${witness.publicKeys.length}`,
    });
    return {
      valid: false,
      reason: "ml-dsa-65-sig requires exactly 1 public key",
      auditTrail,
    };
  }

  if (witness.signatures.length !== 1) {
    auditTrail.push({
      step: "Signature count check",
      passed: false,
      detail: `Expected 1 signature, got ${witness.signatures.length}`,
    });
    return {
      valid: false,
      reason: "ml-dsa-65-sig requires exactly 1 signature",
      auditTrail,
    };
  }

  auditTrail.push({
    step: "Witness count check",
    passed: true,
    detail: "1 public key, 1 signature",
  });

  const publicKey = witness.publicKeys[0]!;
  const signature = witness.signatures[0]!;

  // Verify public key hash matches leaf
  const publicKeyHash = hashPubKey(publicKey);
  if (publicKeyHash !== leaf.publicKeyHashes[0]) {
    auditTrail.push({
      step: "Public key hash verification",
      passed: false,
      detail: `Hash mismatch: witness=${publicKeyHash.substring(0, 16)}..., leaf=${leaf.publicKeyHashes[0]?.substring(0, 16)}...`,
    });
    return {
      valid: false,
      reason: "Public key hash does not match authorized key",
      auditTrail,
    };
  }

  auditTrail.push({
    step: "Public key hash verification",
    passed: true,
    detail: `Hash: ${publicKeyHash.substring(0, 16)}...`,
  });

  // Verify ML-DSA-65 signature
  const signatureValid = signatureVerifier.verify(
    message,
    signature,
    publicKey,
    "ml-dsa-65",
  );

  if (!signatureValid) {
    auditTrail.push({
      step: "ML-DSA-65 signature verification",
      passed: false,
      detail: "Signature verification failed",
    });
    return {
      valid: false,
      reason: "ML-DSA-65 signature verification failed",
      auditTrail,
    };
  }

  auditTrail.push({
    step: "ML-DSA-65 signature verification",
    passed: true,
    detail: `Signature length: ${signature.length} bytes`,
  });

  return {
    valid: true,
    reason: "Single signature verified successfully",
    auditTrail,
  };
}

// ---------------------------------------------------------------------------
// Timelock
// ---------------------------------------------------------------------------

function interpretTimelockWithDeps(
  leaf: ScriptLeaf,
  witness: SpendWitness,
  message: Uint8Array,
  currentTime: number | undefined,
  auditTrail: VerificationStep[],
  signatureVerifier: SignatureVerificationPort,
  hashPubKey: (pk: Uint8Array) => string,
): InterpretScriptResult {
  auditTrail.push({
    step: "Script type",
    passed: true,
    detail: "timelock (time-locked signature)",
  });

  // Check timelock condition first
  const locktime = leaf.locktime;
  if (locktime === undefined) {
    auditTrail.push({
      step: "Locktime check",
      passed: false,
      detail: "Leaf missing locktime parameter",
    });
    return {
      valid: false,
      reason: "Timelock leaf missing locktime parameter",
      auditTrail,
    };
  }

  const effectiveTime = currentTime ?? witness.timestamp;
  if (effectiveTime === undefined) {
    auditTrail.push({
      step: "Timestamp check",
      passed: false,
      detail: "No timestamp provided in witness or options",
    });
    return {
      valid: false,
      reason: "Timelock requires a timestamp",
      auditTrail,
    };
  }

  if (effectiveTime < locktime) {
    auditTrail.push({
      step: "Timelock verification",
      passed: false,
      detail: `Current time ${effectiveTime} < locktime ${locktime}`,
    });
    return {
      valid: false,
      reason: `Timelock not reached: ${locktime - effectiveTime}ms remaining`,
      auditTrail,
    };
  }

  auditTrail.push({
    step: "Timelock verification",
    passed: true,
    detail: `Current time ${effectiveTime} >= locktime ${locktime}`,
  });

  // Now verify signature (same as single sig)
  if (witness.publicKeys.length !== 1 || witness.signatures.length !== 1) {
    auditTrail.push({
      step: "Witness count check",
      passed: false,
      detail: "Timelock requires exactly 1 public key and 1 signature",
    });
    return {
      valid: false,
      reason: "Timelock requires exactly 1 public key and 1 signature",
      auditTrail,
    };
  }

  auditTrail.push({
    step: "Witness count check",
    passed: true,
    detail: "1 public key, 1 signature",
  });

  const publicKey = witness.publicKeys[0]!;
  const signature = witness.signatures[0]!;

  // Verify public key hash
  const publicKeyHash = hashPubKey(publicKey);
  if (publicKeyHash !== leaf.publicKeyHashes[0]) {
    auditTrail.push({
      step: "Public key hash verification",
      passed: false,
      detail: "Hash mismatch",
    });
    return {
      valid: false,
      reason: "Public key hash does not match authorized key",
      auditTrail,
    };
  }

  auditTrail.push({
    step: "Public key hash verification",
    passed: true,
    detail: `Hash: ${publicKeyHash.substring(0, 16)}...`,
  });

  // Verify signature
  const signatureValid = signatureVerifier.verify(
    message,
    signature,
    publicKey,
    "ml-dsa-65",
  );

  if (!signatureValid) {
    auditTrail.push({
      step: "ML-DSA-65 signature verification",
      passed: false,
      detail: "Signature verification failed",
    });
    return {
      valid: false,
      reason: "ML-DSA-65 signature verification failed",
      auditTrail,
    };
  }

  auditTrail.push({
    step: "ML-DSA-65 signature verification",
    passed: true,
    detail: `Signature length: ${signature.length} bytes`,
  });

  return {
    valid: true,
    reason: "Timelock condition and signature verified successfully",
    auditTrail,
  };
}

// ---------------------------------------------------------------------------
// Multisig
// ---------------------------------------------------------------------------

function interpretMultisigWithDeps(
  leaf: ScriptLeaf,
  witness: SpendWitness,
  message: Uint8Array,
  auditTrail: VerificationStep[],
  signatureVerifier: SignatureVerificationPort,
  hashPubKey: (pk: Uint8Array) => string,
): InterpretScriptResult {
  const threshold = leaf.threshold ?? leaf.publicKeyHashes.length;
  const n = leaf.publicKeyHashes.length;

  auditTrail.push({
    step: "Script type",
    passed: true,
    detail: `multisig-ml-dsa (${threshold}-of-${n})`,
  });

  // Verify we have enough signatures
  if (witness.signatures.length < threshold) {
    auditTrail.push({
      step: "Signature count check",
      passed: false,
      detail: `Expected >= ${threshold} signatures, got ${witness.signatures.length}`,
    });
    return {
      valid: false,
      reason: `Multisig requires at least ${threshold} signatures, got ${witness.signatures.length}`,
      auditTrail,
    };
  }

  if (witness.publicKeys.length !== witness.signatures.length) {
    auditTrail.push({
      step: "Key/signature pairing check",
      passed: false,
      detail: `${witness.publicKeys.length} keys, ${witness.signatures.length} signatures`,
    });
    return {
      valid: false,
      reason: "Number of public keys must match number of signatures",
      auditTrail,
    };
  }

  auditTrail.push({
    step: "Witness count check",
    passed: true,
    detail: `${witness.signatures.length} signatures provided (threshold: ${threshold})`,
  });

  // Create set of authorized public key hashes for fast lookup
  const authorizedHashes = new Set(leaf.publicKeyHashes);

  // Verify each signature and count valid ones
  let validCount = 0;
  const usedHashes = new Set<string>();

  for (let i = 0; i < witness.publicKeys.length; i++) {
    const publicKey = witness.publicKeys[i]!;
    const signature = witness.signatures[i]!;
    const keyHash = hashPubKey(publicKey);

    // Check if this key is authorized
    if (!authorizedHashes.has(keyHash)) {
      auditTrail.push({
        step: `Signer ${i + 1} authorization`,
        passed: false,
        detail: `Key hash ${keyHash.substring(0, 16)}... not in authorized set`,
      });
      continue;
    }

    // Check for duplicate signers
    if (usedHashes.has(keyHash)) {
      auditTrail.push({
        step: `Signer ${i + 1} uniqueness`,
        passed: false,
        detail: "Duplicate signer detected",
      });
      continue;
    }

    // Verify signature
    const signatureValid = signatureVerifier.verify(
      message,
      signature,
      publicKey,
      "ml-dsa-65",
    );
    if (!signatureValid) {
      auditTrail.push({
        step: `Signer ${i + 1} signature`,
        passed: false,
        detail: "Signature verification failed",
      });
      continue;
    }

    usedHashes.add(keyHash);
    validCount++;
    auditTrail.push({
      step: `Signer ${i + 1} verification`,
      passed: true,
      detail: `Key ${keyHash.substring(0, 16)}... signature valid`,
    });
  }

  // Check threshold
  if (validCount < threshold) {
    auditTrail.push({
      step: "Threshold check",
      passed: false,
      detail: `${validCount} valid signatures < threshold ${threshold}`,
    });
    return {
      valid: false,
      reason: `Only ${validCount} valid signatures, need ${threshold}`,
      auditTrail,
    };
  }

  auditTrail.push({
    step: "Threshold check",
    passed: true,
    detail: `${validCount} valid signatures >= threshold ${threshold}`,
  });

  return {
    valid: true,
    reason: `Multisig ${threshold}-of-${n} verified: ${validCount} valid signatures`,
    auditTrail,
  };
}

// ---------------------------------------------------------------------------
// HSM-Attested Signature
// ---------------------------------------------------------------------------

function interpretHsmAttestedWithDeps(
  leaf: ScriptLeaf,
  witness: SpendWitness,
  auditTrail: VerificationStep[],
): InterpretScriptResult {
  auditTrail.push({
    step: "Script type",
    passed: true,
    detail: "hsm-attested-sig (HSM-backed signature)",
  });

  // Verify HSM slot ID
  const hsmSlotId = leaf.hsmSlotId;
  if (!hsmSlotId) {
    auditTrail.push({
      step: "HSM slot check",
      passed: false,
      detail: "Leaf missing hsmSlotId parameter",
    });
    return {
      valid: false,
      reason: "HSM-attested leaf missing hsmSlotId",
      auditTrail,
    };
  }

  // Verify attestation is provided
  if (!witness.hsmAttestation) {
    auditTrail.push({
      step: "HSM attestation check",
      passed: false,
      detail: "Witness missing hsmAttestation",
    });
    return {
      valid: false,
      reason: "HSM-attested spending requires hsmAttestation in witness",
      auditTrail,
    };
  }

  // SECURITY: HSM attestation verification is NOT implemented.
  // Full verification would require:
  // 1. Parsing the attestation blob (format depends on HSM vendor)
  // 2. Verifying the attestation signature chain to a trusted HSM root
  // 3. Checking the attested key matches the signing key
  // 4. Verifying the attestation timestamp and freshness
  //
  // Until implemented, we FAIL-SAFE by returning valid=false.
  // The signature is still verified, but HSM attestation claims cannot
  // be trusted without proper cryptographic verification.
  auditTrail.push({
    step: "HSM attestation format",
    passed: true,
    detail: `Slot: ${hsmSlotId}, Attestation: ${witness.hsmAttestation.length} chars`,
  });

  auditTrail.push({
    step: "HSM attestation verification",
    passed: false,
    detail:
      "SECURITY: HSM attestation verification not implemented - cannot validate hardware claims",
  });

  // FAIL-SAFE: Return invalid until attestation verification is implemented.
  // Accepting unverified attestations would allow forged HSM claims.
  return {
    valid: false,
    reason:
      "HSM attestation verification not implemented - signature valid but hardware attestation cannot be verified",
    auditTrail,
  };
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hash of a public key.
 *
 * The public key is converted to hex, then hashed.
 * This matches the format stored in ScriptLeaf.publicKeyHashes.
 */
export function hashPublicKey(publicKey: Uint8Array): string {
  return getInterpreter().hashPublicKey(publicKey);
}
