/**
 * ML-KEM (Kyber) — Key Encapsulation Mechanism
 *
 * Classical key exchange (ECDH, RSA) relies on the hardness of the discrete
 * logarithm and integer factorisation problems.  Shor's algorithm, running on
 * a sufficiently large cryptographically-relevant quantum computer (CRQC),
 * solves both in polynomial time — meaning today's encrypted traffic could be
 * recorded now and decrypted later once CRQCs mature ("harvest-now,
 * decrypt-later" attacks).
 *
 * ML-KEM is the NIST-standardised Key Encapsulation Mechanism designed to
 * replace ECDH in key exchange.  It is based on the Module-Lattice problem
 * (MLWE), which has no known quantum speedup beyond Grover's algorithm
 * (affecting only symmetric-key security, and only by halving the bit level).
 *
 * Standard: NIST FIPS 203 (finalised August 2024)
 * Reference: https://csrc.nist.gov/pubs/fips/203/final
 *
 * This module wraps @noble/post-quantum, a pure-TypeScript implementation with
 * zero native-code dependencies, which makes it platform-portable and easy to
 * audit.
 */

import { hkdfSync } from "node:crypto";

import {
  ml_kem1024,
  ml_kem512,
  ml_kem768,
} from "@noble/post-quantum/ml-kem.js";

import { sha256hex } from "./crypto.js";

// ---------------------------------------------------------------------------
// Parameter sets
// ---------------------------------------------------------------------------

/**
 * ML-KEM parameter sets standardised in FIPS 203.
 *
 * The number (512 / 768 / 1024) corresponds to the module dimension k:
 * - 512  → k=2, ~128-bit post-quantum security (comparable to AES-128)
 * - 768  → k=3, ~192-bit post-quantum security (comparable to AES-192)
 * - 1024 → k=4, ~256-bit post-quantum security (comparable to AES-256)
 *
 * NIST recommends ML-KEM-768 as the general-purpose choice for new systems.
 * ML-KEM-1024 is appropriate when the highest assurance level is required
 * (e.g., protecting data that must stay secret for 30+ years).
 */
export type MlKemParams = "ml-kem-512" | "ml-kem-768" | "ml-kem-1024";

// ---------------------------------------------------------------------------
// Wire-format byte lengths (from FIPS 203, §7)
// ---------------------------------------------------------------------------

/**
 * Public key, secret key, and ciphertext lengths (in bytes) for each
 * parameter set.  Useful for validation and test assertions.
 */
export const ML_KEM_SIZES: Record<
  MlKemParams,
  {
    publicKey: number;
    secretKey: number;
    ciphertext: number;
    sharedSecret: number;
  }
> = {
  "ml-kem-512": {
    publicKey: 800,
    secretKey: 1632,
    ciphertext: 768,
    sharedSecret: 32,
  },
  "ml-kem-768": {
    publicKey: 1184,
    secretKey: 2400,
    ciphertext: 1088,
    sharedSecret: 32,
  },
  "ml-kem-1024": {
    publicKey: 1568,
    secretKey: 3168,
    ciphertext: 1568,
    sharedSecret: 32,
  },
};

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface KyberKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  /** Which ML-KEM parameter set this keypair belongs to. */
  params: MlKemParams;
}

export interface KemEncapsulation {
  /**
   * The ciphertext to send to the recipient.  It contains everything needed
   * to recover the sharedSecret with the matching secretKey.
   */
  ciphertext: Uint8Array;
  /**
   * The shared secret — 32 bytes of uniform randomness.  The sender uses this
   * to derive a symmetric key (e.g., AES-256) via HKDF.  Never transmit this
   * value; only transmit `ciphertext`.
   */
  sharedSecret: Uint8Array;
  /**
   * SHA-256 hex digest of the ciphertext's hex encoding.
   *
   * Computed as: sha256hex(Buffer.from(ciphertext).toString("hex"))
   *
   * This means the hash is over the hex-encoded string representation of the
   * ciphertext bytes, not the raw bytes directly. Suitable for on-chain
   * commitments or audit logs — proves a specific ciphertext was used without
   * revealing the shared secret.
   */
  auditCommitment: string;
}

export interface KemAuditRecord {
  params: MlKemParams;
  /** SHA-256 of the public key — stable identifier for the recipient's keypair. */
  publicKeyHash: string;
  /** SHA-256 of the ciphertext — unique per session. */
  ciphertextHash: string;
  /** ISO-8601 timestamp of the encapsulation event. */
  timestamp: string;
  /** Byte length of the AES key derived from the shared secret via HKDF. */
  derivedKeyLength: number;
}

// ---------------------------------------------------------------------------
// KyberKem class
// ---------------------------------------------------------------------------

export class KyberKem {
  /**
   * Generate a new ML-KEM keypair.
   *
   * The public key is shared with anyone who needs to send you an encrypted
   * session key.  The secret key must be stored securely — ideally in an HSM
   * or hardware-backed key store.
   */
  generateKeyPair(params: MlKemParams): KyberKeyPair {
    const kem = this.#suite(params);
    const { publicKey, secretKey } = kem.keygen();
    return { publicKey, secretKey, params };
  }

  /**
   * Sender-side operation: encapsulate a fresh random shared secret using
   * the recipient's public key.
   *
   * Returns the ciphertext (to send) and the sharedSecret (to use locally for
   * key derivation).  The sharedSecret is never transmitted.
   */
  encapsulate(publicKey: Uint8Array, params: MlKemParams): KemEncapsulation {
    const kem = this.#suite(params);
    const { cipherText: ciphertext, sharedSecret } = kem.encapsulate(publicKey);
    return {
      ciphertext,
      sharedSecret,
      auditCommitment: sha256hex(Buffer.from(ciphertext).toString("hex")),
    };
  }

  /**
   * Receiver-side operation: recover the sharedSecret from a ciphertext using
   * the secret key.
   *
   * If the ciphertext was produced with a different public key, ML-KEM
   * returns a pseudorandom value instead of the real shared secret — this is
   * the implicit rejection property that prevents chosen-ciphertext attacks.
   */
  decapsulate(
    ciphertext: Uint8Array,
    secretKey: Uint8Array,
    params: MlKemParams,
  ): Uint8Array {
    const kem = this.#suite(params);
    return kem.decapsulate(ciphertext, secretKey);
  }

  /**
   * Derive a symmetric key from an ML-KEM shared secret using HKDF-SHA256.
   *
   * The shared secret from ML-KEM is already 32 bytes of uniform randomness,
   * but running it through HKDF lets you bind context (e.g., session IDs,
   * party identifiers) into the derived key — useful for domain separation.
   *
   * @param sharedSecret - Raw 32-byte output from encapsulate/decapsulate
   * @param info - Optional context string bound into the derived key
   * @param salt - Optional random salt (defaults to 32 zero bytes if omitted)
   */
  deriveAesKey(
    sharedSecret: Uint8Array,
    info = "ml-kem-aes-key-v1",
    salt?: Buffer,
  ): Buffer {
    const saltBytes = salt ?? Buffer.alloc(32, 0);
    // HKDF-SHA256 producing 32 bytes → suitable for AES-256-GCM.
    // RFC 5869 (HKDF): https://datatracker.ietf.org/doc/html/rfc5869
    // NIST SP 800-38D (GCM): https://csrc.nist.gov/pubs/sp/800/38/d/final
    return Buffer.from(
      hkdfSync(
        "sha256",
        sharedSecret,
        saltBytes,
        Buffer.from(info, "utf8"),
        32,
      ),
    );
  }

  /**
   * Build an audit record for a completed encapsulation round.
   * Suitable for writing to an immutable ledger (Fabric, Besu, Corda) as
   * proof that a particular key exchange occurred without revealing the
   * shared secret.
   */
  auditRecord(
    encap: KemEncapsulation,
    publicKey: Uint8Array,
    params: MlKemParams,
  ): KemAuditRecord {
    return {
      params,
      publicKeyHash: sha256hex(Buffer.from(publicKey).toString("hex")),
      ciphertextHash: encap.auditCommitment,
      timestamp: new Date().toISOString(),
      derivedKeyLength: 32,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  #suite(params: MlKemParams) {
    switch (params) {
      case "ml-kem-512":
        return ml_kem512;
      case "ml-kem-768":
        return ml_kem768;
      case "ml-kem-1024":
        return ml_kem1024;
    }
  }
}
