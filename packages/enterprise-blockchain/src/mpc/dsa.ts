/**
 * ML-DSA (Dilithium) — Digital Signature Algorithm
 *
 * Classical signature schemes (ECDSA, RSA) rely on the hardness of the
 * discrete logarithm and integer factorisation problems.  Shor's algorithm,
 * running on a sufficiently large cryptographically-relevant quantum computer
 * (CRQC), solves both in polynomial time — meaning historical signatures could
 * be forged retroactively ("harvest-now, forge-later" threat to long-lived
 * documents and trade rails).
 *
 * ML-DSA is the NIST-standardised Digital Signature Algorithm designed to
 * replace ECDSA.  It is based on the Module-Lattice problem (MLWE / MSIS),
 * which has no known quantum speedup beyond Grover's algorithm.
 *
 * Standard: NIST FIPS 204 (finalised August 2024)
 * Reference: https://csrc.nist.gov/pubs/fips/204/final
 *
 * Noble API note (differs from ML-KEM):
 *   sign(message, secretKey)       — message is the FIRST argument
 *   verify(signature, message, publicKey)
 *
 * This module wraps @noble/post-quantum, a pure-TypeScript implementation with
 * zero native-code dependencies, which makes it platform-portable and easy to
 * audit.
 */

import { ml_dsa44, ml_dsa65, ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";

import { sha256hex } from "./crypto.js";

// ---------------------------------------------------------------------------
// Parameter sets
// ---------------------------------------------------------------------------

/**
 * ML-DSA parameter sets standardised in FIPS 204.
 *
 * The number (44 / 65 / 87) refers to the module dimension:
 * - 44 → NIST Level 2 (~AES-128, comparable to P-256/ES256)
 * - 65 → NIST Level 3 (~AES-192, comparable to P-384/ES384)
 * - 87 → NIST Level 5 (~AES-256, comparable to P-521/ES512)
 *
 * NIST recommends ML-DSA-65 as the general-purpose choice for new systems.
 * ML-DSA-87 is appropriate for root CAs and long-lived documents (30+ years).
 */
export type MlDsaParams = "ml-dsa-44" | "ml-dsa-65" | "ml-dsa-87";

// ---------------------------------------------------------------------------
// Wire-format byte lengths (empirically verified against @noble/post-quantum)
// ---------------------------------------------------------------------------

/**
 * Public key, secret key, and signature lengths (in bytes) for each
 * parameter set.  Useful for validation and test assertions.
 *
 * Note: Noble's secretKey representation includes expanded key material;
 * hence sk lengths are larger than the FIPS 204 §7 algebraic key sizes.
 */
export const ML_DSA_SIZES: Record<
  MlDsaParams,
  { publicKey: number; secretKey: number; signature: number }
> = {
  "ml-dsa-44": { publicKey: 1312, secretKey: 2560, signature: 2420 },
  "ml-dsa-65": { publicKey: 1952, secretKey: 4032, signature: 3309 },
  "ml-dsa-87": { publicKey: 2592, secretKey: 4896, signature: 4627 },
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface DsaKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  /** Which ML-DSA parameter set this keypair belongs to. */
  params: MlDsaParams;
}

export interface DsaSignatureResult {
  /** The raw ML-DSA signature bytes to send alongside the message. */
  signature: Uint8Array;
  /**
   * SHA-256 hex digest of the signature's hex encoding.
   *
   * Computed as: sha256hex(Buffer.from(signature).toString("hex"))
   *
   * This means the hash is over the hex-encoded string representation of the
   * signature bytes, not the raw bytes directly. Suitable for on-chain
   * commitments or audit logs.
   */
  auditCommitment: string;
}

export interface DsaAuditRecord {
  params: MlDsaParams;
  /**
   * SHA-256 of the public key's hex encoding — stable identifier for the signer's keypair.
   * Computed as: sha256hex(Buffer.from(publicKey).toString("hex"))
   */
  publicKeyHash: string;
  /**
   * SHA-256 of the signature's hex encoding — unique per signing event.
   * Same as auditCommitment from DsaSignatureResult.
   */
  signatureHash: string;
  /**
   * SHA-256 of the message's hex encoding — proves which message was signed.
   * Computed as: sha256hex(Buffer.from(message).toString("hex"))
   */
  messageHash: string;
  /** ISO-8601 timestamp of the signing event. */
  timestamp: string;
  /** Byte length of the signature. */
  signatureLength: number;
  /** Whether the signature verified correctly at audit time. */
  verifiedAtAudit: boolean;
}

// ---------------------------------------------------------------------------
// MlDsaSigner class
// ---------------------------------------------------------------------------

export class MlDsaSigner {
  /**
   * Generate a new ML-DSA keypair.
   *
   * The public key is shared with anyone who needs to verify your signatures.
   * The secret key must be stored securely — ideally in an HSM or
   * hardware-backed key store.
   */
  generateKeyPair(params: MlDsaParams): DsaKeyPair {
    const dsa = this.#suite(params);
    const { publicKey, secretKey } = dsa.keygen();
    return { publicKey, secretKey, params };
  }

  /**
   * Sign a message.
   *
   * @param message   - Raw bytes of the message to sign.
   * @param secretKey - The signer's ML-DSA secret key.
   * @param params    - Parameter set that was used to generate the keypair.
   * @returns Signature bytes and an audit commitment hash.
   */
  sign(
    message: Uint8Array,
    secretKey: Uint8Array,
    params: MlDsaParams,
  ): DsaSignatureResult {
    const dsa = this.#suite(params);
    // Noble ML-DSA API: sign(message, secretKey)
    const signature = dsa.sign(message, secretKey);
    const auditCommitment = sha256hex(Buffer.from(signature).toString("hex"));
    return { signature, auditCommitment };
  }

  /**
   * Verify a signature.
   *
   * @param message   - The original message bytes.
   * @param signature - The signature to verify.
   * @param publicKey - The signer's ML-DSA public key.
   * @param params    - Parameter set used to generate the keypair.
   * @returns `true` if the signature is valid, `false` otherwise.
   *
   * This method never throws on invalid signature bytes — it returns `false`.
   * This ensures it cannot be used as an oracle for timing attacks.
   */
  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    params: MlDsaParams,
  ): boolean {
    try {
      const dsa = this.#suite(params);
      // Noble ML-DSA API: verify(signature, message, publicKey)
      return dsa.verify(signature, message, publicKey);
    } catch {
      return false;
    }
  }

  /**
   * Produce an on-chain-ready audit record for a signing event.
   *
   * The returned object contains only hashes — no secret material — and is
   * safe to store in a ledger or audit log.
   */
  auditRecord(
    message: Uint8Array,
    result: DsaSignatureResult,
    publicKey: Uint8Array,
    params: MlDsaParams,
  ): DsaAuditRecord {
    const verified = this.verify(message, result.signature, publicKey, params);
    return {
      params,
      publicKeyHash: sha256hex(Buffer.from(publicKey).toString("hex")),
      signatureHash: result.auditCommitment,
      messageHash: sha256hex(Buffer.from(message).toString("hex")),
      timestamp: new Date().toISOString(),
      signatureLength: result.signature.length,
      verifiedAtAudit: verified,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  #suite(params: MlDsaParams) {
    switch (params) {
      case "ml-dsa-44":
        return ml_dsa44;
      case "ml-dsa-65":
        return ml_dsa65;
      case "ml-dsa-87":
        return ml_dsa87;
    }
  }
}
