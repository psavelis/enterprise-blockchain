/**
 * MPC Module Ports (Hexagonal Architecture)
 *
 * These ports define the boundaries between the MPC domain and infrastructure.
 * Domain code MUST only depend on these interfaces, never on concrete implementations.
 *
 * @see docs/adr/ADR-0001-hexagonal-architecture.md
 */

/**
 * Port for cryptographically secure random number generation.
 *
 * The MPC domain requires randomness for:
 * - Generating polynomial coefficients in Shamir sharing
 * - Creating nonces for share commitments
 * - Producing random shares in additive sharing
 *
 * Implementations MUST provide cryptographically secure randomness.
 * Using Math.random() or other weak PRNGs is a CRITICAL security vulnerability.
 */
export interface RandomnessProvider {
  /**
   * Generate random bytes.
   * @param length Number of bytes to generate.
   * @returns Buffer containing cryptographically secure random bytes.
   */
  randomBytes(length: number): Buffer;

  /**
   * Generate a random integer in range [min, max).
   * @param min Minimum value (inclusive).
   * @param max Maximum value (exclusive).
   * @returns Cryptographically secure random integer.
   */
  randomInt(min: number, max: number): number;
}

/**
 * Port for commitment and hashing operations.
 *
 * The MPC domain uses commitments to:
 * - Bind parties to their shares before revealing
 * - Detect tampering during computation
 * - Provide audit trails with integrity proofs
 */
export interface CommitmentProvider {
  /**
   * Create a commitment for a secret share.
   * @param partyId The party identifier.
   * @param shareIndex The share's index in the sharing scheme.
   * @param value The share value.
   * @param nonce Random nonce for binding.
   * @returns Commitment string (typically a hash).
   */
  commitShare(
    partyId: string,
    shareIndex: number,
    value: number | bigint,
    nonce: string,
  ): string;

  /**
   * Compute SHA-256 hash of a string.
   * @param data Input string to hash.
   * @returns Hex-encoded hash.
   */
  sha256hex(data: string): string;

  /**
   * Compare two strings in constant time.
   * @param a First string.
   * @param b Second string.
   * @returns True if equal, false otherwise.
   */
  timingSafeCompare(a: string, b: string): boolean;
}
