/**
 * P2MR Module Ports (Hexagonal Architecture)
 *
 * These ports define the boundaries between the P2MR domain and infrastructure.
 * Domain code MUST only depend on these interfaces, never on concrete implementations.
 *
 * @see docs/adr/ADR-0001-hexagonal-architecture.md
 */

/**
 * Supported post-quantum signature algorithms.
 */
export type SignatureAlgorithm = "ml-dsa-65" | "ml-dsa-44" | "ml-dsa-87";

/**
 * Port for post-quantum signature verification.
 *
 * The P2MR domain requires signature verification for:
 * - Single signature script leaves (ml-dsa-65-sig)
 * - Timelock script leaves (signature + time condition)
 * - Multisig script leaves (k-of-n threshold signatures)
 * - HSM-attested signatures
 *
 * Implementations MUST use NIST-approved post-quantum algorithms.
 */
export interface SignatureVerificationPort {
  /**
   * Verify a post-quantum signature.
   *
   * @param message The message that was signed.
   * @param signature The signature bytes.
   * @param publicKey The signer's public key.
   * @param algorithm The signature algorithm used.
   * @returns True if the signature is valid, false otherwise.
   */
  verify(
    message: Uint8Array,
    signature: Uint8Array,
    publicKey: Uint8Array,
    algorithm: SignatureAlgorithm,
  ): boolean;
}

/**
 * Port for cryptographic hashing operations.
 *
 * The P2MR domain uses hashing for:
 * - Computing public key hashes for script leaves
 * - Building Merkle trees from script leaves
 * - Creating spend transaction digests
 */
export interface HashingPort {
  /**
   * Compute SHA-256 hash of a hex string.
   * @param data Hex-encoded input data.
   * @returns Hex-encoded hash.
   */
  sha256hex(data: string): string;
}
