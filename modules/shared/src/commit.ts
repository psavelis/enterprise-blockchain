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
 * IMPORTANT: Both strings must be the same length (e.g., SHA-256 hashes).
 * For strings of different lengths, returns false immediately
 * (length comparison is not constant-time but reveals no secret data).
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return timingSafeEqual(bufA, bufB);
}
