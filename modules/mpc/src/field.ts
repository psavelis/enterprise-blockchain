/**
 * Finite field arithmetic for Shamir Secret Sharing.
 *
 * Two field sizes are supported:
 * - **Demo mode** (default): 2^31 - 1 (Mersenne prime, fast, fits in JS Number)
 * - **Production mode**: 2^256 - 2^32 - 977 (secp256k1 order, cryptographically secure)
 *
 * WARNING: Demo mode is NOT secure for production use.
 * The small field allows brute-force enumeration in seconds.
 *
 * @see skills/mpc-secret-sharing.md for security guidance
 * @see docs/adr/ADR-0004-field-arithmetic-for-mpc.md for design rationale
 */

import { randomBytes } from "node:crypto";

/**
 * Demo field: Mersenne prime 2^31 - 1.
 * Fast arithmetic, fits in JS safe integer range.
 * NOT SECURE for production - enumerable in ~seconds on modern hardware.
 */
export const DEMO_PRIME = 2_147_483_647n;

/**
 * Production field: secp256k1 curve order.
 * 256-bit prime providing 128+ bits of security against enumeration.
 * Used by Bitcoin, Ethereum, and most production secret sharing implementations.
 */
export const PRODUCTION_PRIME =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

/**
 * Alternative production field: 2^255 - 19 (Curve25519 prime).
 * Slightly faster modular reduction due to special form.
 */
export const CURVE25519_PRIME =
  0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffedn;

export type FieldMode = "demo" | "production";

export interface FieldConfig {
  mode: FieldMode;
  prime: bigint;
}

/**
 * Get field configuration from environment or explicit parameter.
 *
 * Environment variable: MPC_FIELD_MODE ("demo" | "production")
 * Default: "demo" for backward compatibility
 */
export function getFieldConfig(mode?: FieldMode): FieldConfig {
  const envMode = process.env.MPC_FIELD_MODE;
  const rawMode = mode ?? envMode ?? "demo";

  // Validate the mode is one of the allowed values
  if (rawMode !== "demo" && rawMode !== "production") {
    throw new Error(
      `Invalid MPC_FIELD_MODE: "${rawMode}". Use "demo" or "production".`,
    );
  }

  const effectiveMode: FieldMode = rawMode;

  return {
    mode: effectiveMode,
    prime: effectiveMode === "production" ? PRODUCTION_PRIME : DEMO_PRIME,
  };
}

/**
 * Field arithmetic operations for a given prime.
 */
export class FieldArithmetic {
  readonly prime: bigint;
  readonly mode: FieldMode;

  constructor(config: FieldConfig = getFieldConfig()) {
    this.prime = config.prime;
    this.mode = config.mode;
  }

  /**
   * Modular reduction: ensures result is in [0, prime).
   */
  mod(a: bigint): bigint {
    return ((a % this.prime) + this.prime) % this.prime;
  }

  /**
   * Modular addition: (a + b) mod prime.
   */
  add(a: bigint, b: bigint): bigint {
    return this.mod(a + b);
  }

  /**
   * Modular subtraction: (a - b) mod prime.
   */
  sub(a: bigint, b: bigint): bigint {
    return this.mod(a - b);
  }

  /**
   * Modular multiplication: (a * b) mod prime.
   */
  mul(a: bigint, b: bigint): bigint {
    return this.mod(a * b);
  }

  /**
   * Modular exponentiation: base^exp mod prime.
   * Uses square-and-multiply for O(log exp) complexity.
   */
  pow(base: bigint, exp: bigint): bigint {
    let result = 1n;
    base = this.mod(base);

    while (exp > 0n) {
      if (exp & 1n) {
        result = this.mod(result * base);
      }
      exp >>= 1n;
      base = this.mod(base * base);
    }

    return result;
  }

  /**
   * Modular multiplicative inverse: a^(-1) mod prime.
   * Uses Fermat's little theorem: a^(-1) = a^(p-2) mod p.
   */
  inverse(a: bigint): bigint {
    if (this.mod(a) === 0n) {
      throw new Error("Cannot compute inverse of zero");
    }
    return this.pow(a, this.prime - 2n);
  }

  /**
   * Modular division: a / b mod prime = a * b^(-1) mod prime.
   */
  div(a: bigint, b: bigint): bigint {
    return this.mul(a, this.inverse(b));
  }

  /**
   * Generate a random field element in [1, prime).
   * Uses cryptographically secure random bytes.
   */
  random(): bigint {
    // Generate enough bytes to cover the prime
    const byteLength = Math.ceil(this.prime.toString(2).length / 8);
    let value: bigint;

    // Rejection sampling to ensure uniform distribution
    do {
      const bytes = randomBytes(byteLength);
      value = BigInt("0x" + bytes.toString("hex"));
    } while (value >= this.prime || value === 0n);

    return value;
  }

  /**
   * Convert a number to a field element.
   * Throws if the number is outside the valid range.
   */
  fromNumber(n: number): bigint {
    if (!Number.isInteger(n) || n < 0) {
      throw new Error("Field element must be a non-negative integer");
    }

    const value = BigInt(n);
    if (value >= this.prime) {
      throw new Error(`Value ${n} exceeds field prime ${this.prime}`);
    }

    return value;
  }

  /**
   * Convert a field element to a number.
   * Throws if the value exceeds JS safe integer range.
   */
  toNumber(value: bigint): number {
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(
        `Field element ${value} exceeds JS safe integer range. ` +
          `Use bigint operations directly for production field.`,
      );
    }
    return Number(value);
  }

  /**
   * Check if this is a production-grade field.
   */
  isProductionSecure(): boolean {
    return this.mode === "production";
  }

  /**
   * Get the security level in bits.
   * Demo mode: ~31 bits (insecure)
   * Production mode: ~128 bits (secure)
   */
  getSecurityBits(): number {
    return this.mode === "production" ? 128 : 31;
  }
}

/**
 * Singleton instances for common use cases.
 */
export const demoField = new FieldArithmetic({
  mode: "demo",
  prime: DEMO_PRIME,
});
export const productionField = new FieldArithmetic({
  mode: "production",
  prime: PRODUCTION_PRIME,
});
