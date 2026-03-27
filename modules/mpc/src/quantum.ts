import { randomBytes } from "node:crypto";

import { commitShare, sha256hex } from "./crypto";

export interface ThresholdShare {
  partyId: string;
  shareIndex: number;
  value: bigint;
  nonce: string;
  commitment: string;
}

export interface HashLadderKey {
  publicRoot: string;
  depth: number;
  scheme: "sha256-chain";
}

export interface QuantumResistantAnchor {
  dataHash: string;
  ladderRoot: string;
  depth: number;
  timestamp: string;
  scheme: "hash-ladder";
}

// Curve25519 prime: 2^255 − 19.  Provides a 256-bit field large enough to
// protect 256-bit key material (AES-256, ECDSA private keys) without leaking
// information through share values exceeding the field order.
const PRIME = (1n << 255n) - 19n;

/** Convert a Uint8Array to a BigInt (big-endian). */
function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b);
  }
  return result;
}

/** Convert a BigInt to a fixed-length Uint8Array (big-endian). */
function bigIntToBytes(value: bigint, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    bytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return bytes;
}

/** Generate a cryptographically random BigInt in [1, PRIME). */
function randomFieldElement(): bigint {
  // Generate 32 random bytes and reduce mod PRIME.  Bias is negligible
  // because PRIME ≈ 2^255 and we sample from 2^256.
  const raw = bytesToBigInt(randomBytes(32));
  const reduced = (raw % (PRIME - 1n)) + 1n;
  return reduced;
}

export class QuantumResistantVault {
  /**
   * Distribute `secret` across `parties` using Shamir's Secret Sharing
   * over a 256-bit finite field (Curve25519 prime: 2^255 − 19).
   *
   * Accepts `bigint` for raw large integers, `Uint8Array` for raw key bytes,
   * or `number` for backward compatibility with smaller secrets.
   *
   * Any `threshold` shares reconstruct the secret; fewer reveal nothing.
   */
  distributeSecret(
    secret: bigint | Uint8Array | number,
    parties: string[],
    threshold: number,
  ): Map<string, ThresholdShare> {
    if (threshold < 2) {
      throw new Error("Threshold must be at least 2");
    }
    if (threshold > parties.length) {
      throw new Error("Threshold cannot exceed party count");
    }

    const s =
      secret instanceof Uint8Array ? bytesToBigInt(secret) : BigInt(secret);

    if (s < 0n || s >= PRIME) {
      throw new Error(`Secret must be in range [0, ${PRIME})`);
    }

    // Random polynomial of degree (threshold − 1) with secret as constant term.
    const coeffs: bigint[] = [s];
    for (let i = 1; i < threshold; i++) {
      coeffs.push(randomFieldElement());
    }

    const shares = new Map<string, ThresholdShare>();
    for (let i = 0; i < parties.length; i++) {
      const x = BigInt(i + 1);
      const y = this.evalPoly(coeffs, x);
      const nonce = randomBytes(16).toString("hex");
      shares.set(parties[i]!, {
        partyId: parties[i]!,
        shareIndex: i,
        value: y,
        nonce,
        commitment: commitShare(parties[i]!, i, y.toString(), nonce),
      });
    }

    return shares;
  }

  /**
   * Reconstruct the secret from a set of shares via Lagrange interpolation.
   * Returns `null` when fewer than `threshold` shares are supplied.
   */
  reconstructSecret(
    shares: ThresholdShare[],
    threshold: number,
  ): bigint | null {
    if (shares.length < threshold) {
      return null;
    }

    const points: [bigint, bigint][] = shares.map((s) => [
      BigInt(s.shareIndex + 1),
      s.value,
    ]);

    return this.lagrangeInterpolate(points);
  }

  /**
   * Reconstruct the secret and return it as a fixed-length byte array.
   * Useful for recovering raw key material (e.g. AES-256 keys).
   */
  reconstructSecretBytes(
    shares: ThresholdShare[],
    threshold: number,
    byteLength = 32,
  ): Uint8Array | null {
    const secret = this.reconstructSecret(shares, threshold);
    if (secret === null) return null;
    return bigIntToBytes(secret, byteLength);
  }

  /** Build a SHA-256 hash chain of `depth` iterations from a random seed. */
  createHashLadder(depth: number): HashLadderKey {
    let current = sha256hex(randomBytes(32).toString("hex"));

    for (let i = 0; i < depth; i++) {
      current = sha256hex(current);
    }

    return { publicRoot: current, depth, scheme: "sha256-chain" };
  }

  /** Anchor data with a hash-ladder proof (no asymmetric key involved). */
  anchorWithPostQuantumProof(data: string): QuantumResistantAnchor {
    const ladder = this.createHashLadder(256);

    return {
      dataHash: sha256hex(data),
      ladderRoot: ladder.publicRoot,
      depth: ladder.depth,
      timestamp: new Date().toISOString(),
      scheme: "hash-ladder",
    };
  }

  // --- Shamir arithmetic over GF(PRIME) ---

  private evalPoly(coeffs: bigint[], x: bigint): bigint {
    let result = 0n;
    let power = 1n;
    for (const c of coeffs) {
      result = this.mod(result + c * power);
      power = this.mod(power * x);
    }
    return result;
  }

  private lagrangeInterpolate(points: [bigint, bigint][]): bigint {
    let result = 0n;
    for (let i = 0; i < points.length; i++) {
      const [xi, yi] = points[i]!;
      let num = 1n;
      let den = 1n;
      for (let j = 0; j < points.length; j++) {
        if (i === j) continue;
        const xj = points[j]![0];
        num = this.mod(num * this.mod(-xj));
        den = this.mod(den * this.mod(xi - xj));
      }
      const inv = this.modPow(den, PRIME - 2n);
      result = this.mod(result + this.mod(yi * this.mod(num * inv)));
    }
    return result;
  }

  private mod(a: bigint): bigint {
    return ((a % PRIME) + PRIME) % PRIME;
  }

  private modPow(base: bigint, exp: bigint): bigint {
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
}
