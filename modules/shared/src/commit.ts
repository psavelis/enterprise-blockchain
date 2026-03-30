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
