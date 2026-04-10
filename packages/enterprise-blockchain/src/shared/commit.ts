import { timingSafeEqual } from "node:crypto";

import { sha256hex } from "./crypto";

/**
 * Create a cryptographic commitment for a secret share.
 * The commitment binds the share value to a specific party and index,
 * preventing substitution attacks.
 *
 * @param partyId - Identifier of the share holder
 * @param index - Share index in the polynomial evaluation
 * @param value - Share value (number for demo mode, bigint for production)
 * @param nonce - Random nonce for hiding the value
 */
export function commitShare(
  partyId: string,
  index: number,
  value: number | bigint,
  nonce: string,
): string {
  // Convert bigint to string for consistent hashing
  const valueStr = typeof value === "bigint" ? value.toString() : String(value);
  return sha256hex(`${nonce}:${partyId}:${index}:${valueStr}`);
}

/**
 * Timing-safe comparison of two hex strings.
 * Prevents timing attacks by ensuring constant-time comparison
 * regardless of where the first difference occurs.
 *
 * The comparison decodes hex to bytes before comparing, ensuring
 * the function behavior matches its documented contract.
 *
 * IMPORTANT: Both strings must be the same length (e.g., SHA-256 hashes).
 * Malformed hex inputs (odd length, non-hex characters) return false.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  // Length check is not constant-time but reveals no secret data
  if (a.length !== b.length) {
    return false;
  }

  // Hex strings must have even length
  if (a.length % 2 !== 0) {
    return false;
  }

  // Validate hex format before decoding
  const hexRegex = /^[0-9a-fA-F]*$/;
  if (!hexRegex.test(a) || !hexRegex.test(b)) {
    return false;
  }

  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");

  // Defensive check (should always be true given the above validation)
  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}
