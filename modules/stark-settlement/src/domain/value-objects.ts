/**
 * Value Objects for Aggregated STARK Settlement Layer
 *
 * Immutable, self-validating value types that encapsulate domain concepts:
 * - FieldElement: Arithmetic in the STARK prime field
 * - IdempotencyKey: Collision-resistant exactly-once keys
 * - ProofCommitment: Succinct commitment to a STARK proof
 * - StateRoot: Merkle root of ledger state
 *
 * Value objects are equal if their values are equal (no identity).
 * All validation happens at construction time.
 *
 * @see modules/mpc/src/field.ts for field arithmetic patterns
 */

import { createHash, randomBytes } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// STARK Field Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * STARK prime field: 2^251 + 17 * 2^192 + 1
 * This is the prime used by StarkNet/Cairo for field operations.
 */
export const STARK_PRIME =
  0x800000000000011000000000000000000000000000000000000000000000001n;

/**
 * Generator of the multiplicative group of the STARK field.
 */
export const STARK_GENERATOR = 3n;

// ─────────────────────────────────────────────────────────────────────────────
// FieldElement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * An element in the STARK prime field.
 *
 * Supports modular arithmetic operations and serialization.
 * Immutable - all operations return new instances.
 */
export class FieldElement {
  private constructor(
    readonly value: bigint,
    readonly prime: bigint = STARK_PRIME,
  ) {}

  /**
   * Create a field element from a bigint.
   * Value is automatically reduced modulo prime.
   */
  static fromBigInt(value: bigint, prime: bigint = STARK_PRIME): FieldElement {
    const reduced = ((value % prime) + prime) % prime;
    return new FieldElement(reduced, prime);
  }

  /**
   * Create a field element from a hex string.
   */
  static fromHex(hex: string, prime: bigint = STARK_PRIME): FieldElement {
    const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
    return FieldElement.fromBigInt(BigInt("0x" + cleanHex), prime);
  }

  /**
   * Create a field element from a byte array (big-endian).
   */
  static fromBytes(
    bytes: Uint8Array,
    prime: bigint = STARK_PRIME,
  ): FieldElement {
    let value = 0n;
    for (const byte of bytes) {
      value = (value << 8n) | BigInt(byte);
    }
    return FieldElement.fromBigInt(value, prime);
  }

  /**
   * Generate a random field element.
   */
  static random(prime: bigint = STARK_PRIME): FieldElement {
    const byteLength = Math.ceil(prime.toString(2).length / 8);
    let value: bigint;
    do {
      const bytes = randomBytes(byteLength);
      value = BigInt("0x" + bytes.toString("hex"));
    } while (value >= prime);
    return new FieldElement(value, prime);
  }

  /**
   * Zero element in the field.
   */
  static zero(prime: bigint = STARK_PRIME): FieldElement {
    return new FieldElement(0n, prime);
  }

  /**
   * One (multiplicative identity) in the field.
   */
  static one(prime: bigint = STARK_PRIME): FieldElement {
    return new FieldElement(1n, prime);
  }

  /**
   * Modular addition: (this + other) mod prime
   */
  add(other: FieldElement): FieldElement {
    this.#assertSamePrime(other);
    return FieldElement.fromBigInt(this.value + other.value, this.prime);
  }

  /**
   * Modular subtraction: (this - other) mod prime
   */
  sub(other: FieldElement): FieldElement {
    this.#assertSamePrime(other);
    return FieldElement.fromBigInt(this.value - other.value, this.prime);
  }

  /**
   * Modular multiplication: (this * other) mod prime
   */
  mul(other: FieldElement): FieldElement {
    this.#assertSamePrime(other);
    return FieldElement.fromBigInt(this.value * other.value, this.prime);
  }

  /**
   * Modular exponentiation: this^exp mod prime
   * Uses square-and-multiply for O(log exp) complexity.
   */
  pow(exp: bigint): FieldElement {
    let result = FieldElement.one(this.prime);
    let base = FieldElement.fromBigInt(this.value, this.prime);

    let e = exp;
    while (e > 0n) {
      if (e & 1n) {
        result = result.mul(base);
      }
      e >>= 1n;
      base = base.mul(base);
    }

    return result;
  }

  /**
   * Modular multiplicative inverse: this^(-1) mod prime
   * Uses Fermat's little theorem: a^(-1) = a^(p-2) mod p
   */
  inverse(): FieldElement {
    if (this.value === 0n) {
      throw new Error("Cannot compute inverse of zero");
    }
    return this.pow(this.prime - 2n);
  }

  /**
   * Modular division: this / other mod prime
   */
  div(other: FieldElement): FieldElement {
    return this.mul(other.inverse());
  }

  /**
   * Negation: -this mod prime
   */
  neg(): FieldElement {
    return FieldElement.fromBigInt(-this.value, this.prime);
  }

  /**
   * Check if this is zero.
   */
  isZero(): boolean {
    return this.value === 0n;
  }

  /**
   * Check equality with another field element.
   */
  equals(other: FieldElement): boolean {
    return this.value === other.value && this.prime === other.prime;
  }

  /**
   * Convert to hex string (64 characters, zero-padded).
   */
  toHex(): string {
    return this.value.toString(16).padStart(64, "0");
  }

  /**
   * Convert to byte array (big-endian, 32 bytes).
   */
  toBytes(): Uint8Array {
    const hex = this.toHex();
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  /**
   * String representation for debugging.
   */
  toString(): string {
    return `FieldElement(0x${this.toHex()})`;
  }

  #assertSamePrime(other: FieldElement): void {
    if (this.prime !== other.prime) {
      throw new Error("Cannot operate on field elements with different primes");
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IdempotencyKey
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A collision-resistant idempotency key for exactly-once processing.
 *
 * Generated from a combination of source, transaction ID, and timestamp.
 * SHA-256 hash ensures collision resistance.
 */
export class IdempotencyKey {
  private constructor(readonly value: string) {}

  /**
   * Create an idempotency key from source components.
   */
  static create(
    source: string,
    txId: string,
    timestamp: number,
  ): IdempotencyKey {
    const input = `${source}:${txId}:${timestamp}`;
    const hash = createHash("sha256").update(input).digest("hex");
    return new IdempotencyKey(hash);
  }

  /**
   * Create from an existing key string (must be 64 hex chars).
   */
  static fromString(value: string): IdempotencyKey {
    if (!/^[a-f0-9]{64}$/i.test(value)) {
      throw new Error("IdempotencyKey must be 64 hex characters");
    }
    return new IdempotencyKey(value.toLowerCase());
  }

  /**
   * Generate a random idempotency key.
   */
  static random(): IdempotencyKey {
    const bytes = randomBytes(32);
    return new IdempotencyKey(bytes.toString("hex"));
  }

  /**
   * Check equality with another key.
   */
  equals(other: IdempotencyKey): boolean {
    return this.value === other.value;
  }

  /**
   * String representation.
   */
  toString(): string {
    return this.value;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ProofCommitment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A succinct commitment to a STARK proof.
 *
 * Used for on-chain anchoring without storing the full proof.
 * Computed as SHA-256(proofId || starkProof || publicInputs).
 */
export class ProofCommitment {
  private constructor(readonly value: string) {}

  /**
   * Create a commitment from proof components.
   */
  static create(
    proofId: string,
    starkProof: Uint8Array,
    publicInputs: readonly string[],
  ): ProofCommitment {
    const hash = createHash("sha256");
    hash.update(proofId);
    hash.update(starkProof);
    hash.update(publicInputs.join(":"));
    return new ProofCommitment(hash.digest("hex"));
  }

  /**
   * Create from an existing commitment string (must be 64 hex chars).
   */
  static fromString(value: string): ProofCommitment {
    if (!/^[a-f0-9]{64}$/i.test(value)) {
      throw new Error("ProofCommitment must be 64 hex characters");
    }
    return new ProofCommitment(value.toLowerCase());
  }

  /**
   * Check equality with another commitment.
   */
  equals(other: ProofCommitment): boolean {
    return this.value === other.value;
  }

  /**
   * String representation.
   */
  toString(): string {
    return this.value;
  }

  /**
   * Convert to bytes for on-chain storage.
   */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(this.value.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// StateRoot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Merkle root representing the state of the ledger.
 *
 * Computed as the root of a Merkle tree over all account states.
 * Used to prove state transitions in STARK proofs.
 */
export class StateRoot {
  private constructor(readonly value: string) {}

  /**
   * Create a state root from a hex string.
   */
  static fromHex(hex: string): StateRoot {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (!/^[a-f0-9]{64}$/i.test(clean)) {
      throw new Error("StateRoot must be 64 hex characters");
    }
    return new StateRoot(clean.toLowerCase());
  }

  /**
   * Create the genesis (empty) state root.
   */
  static genesis(): StateRoot {
    // SHA-256 of empty string, represents empty state
    const hash = createHash("sha256").update("").digest("hex");
    return new StateRoot(hash);
  }

  /**
   * Compute a new state root by hashing with another value.
   * Used for incremental state updates.
   */
  hash(data: Uint8Array): StateRoot {
    const hash = createHash("sha256");
    hash.update(Buffer.from(this.value, "hex"));
    hash.update(data);
    return new StateRoot(hash.digest("hex"));
  }

  /**
   * Check equality with another state root.
   */
  equals(other: StateRoot): boolean {
    return this.value === other.value;
  }

  /**
   * String representation.
   */
  toString(): string {
    return `0x${this.value}`;
  }

  /**
   * Convert to bytes.
   */
  toBytes(): Uint8Array {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(this.value.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  /**
   * Convert to field element for STARK circuits.
   */
  toFieldElement(): FieldElement {
    return FieldElement.fromHex(this.value);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Amount
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A validated amount with decimal conversion utilities.
 *
 * Stores value in atomic units (lamports, satoshis, cents).
 * Provides conversion to/from human-readable format.
 */
export class Amount {
  private constructor(
    readonly atomicValue: bigint,
    readonly decimals: number,
  ) {}

  /**
   * Create from atomic units (e.g., lamports, satoshis, cents).
   */
  static fromAtomic(value: bigint, decimals: number): Amount {
    if (value < 0n) {
      throw new Error("Amount cannot be negative");
    }
    return new Amount(value, decimals);
  }

  /**
   * Create from a decimal string (e.g., "1.5" SOL = 1500000000 lamports).
   */
  static fromDecimal(value: string, decimals: number): Amount {
    // Reject negative values
    if (value.startsWith("-")) {
      throw new Error("Amount cannot be negative");
    }

    const parts = value.split(".");
    const wholePart = BigInt(parts[0] || "0");
    const fracPart = parts[1] || "";

    // Pad or truncate fractional part to match decimals
    const paddedFrac = fracPart.padEnd(decimals, "0").slice(0, decimals);
    const fracValue = BigInt(paddedFrac || "0");

    const multiplier = 10n ** BigInt(decimals);
    const atomicValue = wholePart * multiplier + fracValue;

    return new Amount(atomicValue, decimals);
  }

  /**
   * Add two amounts.
   */
  add(other: Amount): Amount {
    this.#assertSameDecimals(other);
    return new Amount(this.atomicValue + other.atomicValue, this.decimals);
  }

  /**
   * Subtract another amount.
   */
  sub(other: Amount): Amount {
    this.#assertSameDecimals(other);
    const result = this.atomicValue - other.atomicValue;
    if (result < 0n) {
      throw new Error("Amount subtraction would result in negative value");
    }
    return new Amount(result, this.decimals);
  }

  /**
   * Check if this amount is zero.
   */
  isZero(): boolean {
    return this.atomicValue === 0n;
  }

  /**
   * Compare with another amount.
   * Returns -1 if this < other, 0 if equal, 1 if this > other.
   */
  compare(other: Amount): -1 | 0 | 1 {
    this.#assertSameDecimals(other);
    if (this.atomicValue < other.atomicValue) return -1;
    if (this.atomicValue > other.atomicValue) return 1;
    return 0;
  }

  /**
   * Convert to decimal string (e.g., "1.500000000" for 1.5 SOL).
   */
  toDecimal(): string {
    const multiplier = 10n ** BigInt(this.decimals);
    const wholePart = this.atomicValue / multiplier;
    const fracPart = this.atomicValue % multiplier;
    const fracStr = fracPart.toString().padStart(this.decimals, "0");
    return `${wholePart}.${fracStr}`;
  }

  /**
   * String representation.
   */
  toString(): string {
    return this.toDecimal();
  }

  #assertSameDecimals(other: Amount): void {
    if (this.decimals !== other.decimals) {
      throw new Error(
        "Cannot operate on amounts with different decimal places",
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hash Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a string.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Compute SHA-256 hash of bytes.
 */
export function sha256Bytes(input: Uint8Array): Uint8Array {
  const hash = createHash("sha256").update(input).digest();
  return new Uint8Array(hash);
}

/**
 * Compute Pedersen hash (placeholder - actual implementation would use Cairo's Pedersen).
 * For now, uses SHA-256 as a stand-in.
 */
export function pedersenHash(a: FieldElement, b: FieldElement): FieldElement {
  const hash = createHash("sha256");
  hash.update(a.toBytes());
  hash.update(b.toBytes());
  const result = hash.digest();
  // Reduce to field element
  return FieldElement.fromBytes(result);
}
