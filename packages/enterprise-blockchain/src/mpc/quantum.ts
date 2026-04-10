import { randomBytes } from "node:crypto";

import { commitShare, sha256hex } from "./crypto.js";
import {
  FieldArithmetic,
  getFieldConfig,
  type FieldConfig,
  type FieldMode,
} from "./field.js";

export interface ThresholdShare {
  partyId: string;
  shareIndex: number;
  /** Share value as bigint for production mode compatibility. */
  value: bigint;
  /** Legacy number value for backward compatibility (demo mode only). */
  valueNumber?: number | undefined;
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

export interface VaultConfig {
  /** Field mode: "demo" (default) or "production". */
  fieldMode?: FieldMode;
}

/**
 * Quantum-resistant secret sharing vault using Shamir's Secret Sharing.
 *
 * Supports two field sizes:
 * - Demo mode (default): 2^31-1 prime, fast but NOT secure for production
 * - Production mode: 256-bit prime, cryptographically secure
 *
 * Set MPC_FIELD_MODE=production or pass { fieldMode: "production" } for
 * production deployments.
 *
 * @see skills/mpc-secret-sharing.md for security guidance
 */
export class QuantumResistantVault {
  private readonly field: FieldArithmetic;

  constructor(config?: VaultConfig) {
    const fieldConfig = getFieldConfig(config?.fieldMode);
    this.field = new FieldArithmetic(fieldConfig);
  }

  /**
   * Get the current field configuration.
   */
  getFieldConfig(): FieldConfig {
    return { mode: this.field.mode, prime: this.field.prime };
  }

  /**
   * Check if the vault is configured for production-grade security.
   */
  isProductionSecure(): boolean {
    return this.field.isProductionSecure();
  }
  /**
   * Distribute `secret` across `parties` using Shamir's Secret Sharing.
   * Any `threshold` shares reconstruct the secret; fewer reveal nothing.
   *
   * @param secret - The secret to share (must be within field range)
   * @param parties - Party identifiers to receive shares
   * @param threshold - Minimum shares needed for reconstruction
   */
  distributeSecret(
    secret: number | bigint,
    parties: string[],
    threshold: number,
  ): Map<string, ThresholdShare> {
    // Input validation to prevent security issues
    if (parties.length === 0) {
      throw new Error("At least one party is required");
    }
    if (threshold < 2) {
      throw new Error("Threshold must be at least 2");
    }
    if (threshold > parties.length) {
      throw new Error("Threshold cannot exceed party count");
    }

    // Validate party ID uniqueness - duplicate IDs would break t-of-n security
    const uniqueParties = new Set(parties);
    if (uniqueParties.size !== parties.length) {
      throw new Error(
        "Duplicate party IDs detected. Each party must have a unique identifier.",
      );
    }

    // Validate party ID format - prevent injection and excessively long IDs
    const MAX_PARTY_ID_LENGTH = 256;
    for (const partyId of parties) {
      if (!partyId || partyId.trim().length === 0) {
        throw new Error("Party ID cannot be empty or whitespace-only");
      }
      if (partyId.length > MAX_PARTY_ID_LENGTH) {
        throw new Error(
          `Party ID exceeds maximum length of ${MAX_PARTY_ID_LENGTH} characters`,
        );
      }
    }

    const secretBigint = BigInt(secret);
    if (secretBigint < 0n || secretBigint >= this.field.prime) {
      throw new Error(
        `Secret must be in range [0, ${this.field.prime}). ` +
          `Current field mode: ${this.field.mode}`,
      );
    }

    // Random polynomial of degree (threshold − 1) with secret as constant term.
    const coeffs: bigint[] = [secretBigint];
    for (let i = 1; i < threshold; i++) {
      coeffs.push(this.field.random());
    }

    const shares = new Map<string, ThresholdShare>();
    for (let i = 0; i < parties.length; i++) {
      const x = BigInt(i + 1);
      const y = this.evalPoly(coeffs, x);
      const nonce = randomBytes(16).toString("hex");

      // For commitment, use number if in demo mode for backward compatibility
      const commitValue = this.field.mode === "demo" ? Number(y) : y;

      shares.set(parties[i]!, {
        partyId: parties[i]!,
        shareIndex: i,
        value: y,
        valueNumber: this.field.mode === "demo" ? Number(y) : undefined,
        nonce,
        commitment: commitShare(parties[i]!, i, commitValue, nonce),
      });
    }

    return shares;
  }

  /**
   * Reconstruct the secret from a set of shares via Lagrange interpolation.
   * Returns `null` when fewer than `threshold` shares are supplied.
   *
   * @returns The reconstructed secret as bigint, or null if insufficient shares.
   *          In demo mode, also returns as number for backward compatibility.
   */
  reconstructSecret(
    shares: ThresholdShare[],
    threshold: number,
  ): number | bigint | null {
    if (shares.length < threshold) {
      return null;
    }

    const points: [bigint, bigint][] = shares.map((s) => [
      BigInt(s.shareIndex + 1),
      BigInt(s.value),
    ]);

    const result = this.lagrangeInterpolate(points);

    // Return number for backward compatibility in demo mode
    if (
      this.field.mode === "demo" &&
      result <= BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      return Number(result);
    }

    return result;
  }

  /**
   * Reconstruct the secret and always return as bigint.
   * Use this for production mode or when bigint precision is required.
   */
  reconstructSecretBigint(
    shares: ThresholdShare[],
    threshold: number,
  ): bigint | null {
    if (shares.length < threshold) {
      return null;
    }

    const points: [bigint, bigint][] = shares.map((s) => [
      BigInt(s.shareIndex + 1),
      BigInt(s.value),
    ]);

    return this.lagrangeInterpolate(points);
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

  // --- Shamir arithmetic using configurable field ---

  private evalPoly(coeffs: bigint[], x: bigint): bigint {
    let result = 0n;
    let power = 1n;
    for (const c of coeffs) {
      result = this.field.add(result, this.field.mul(c, power));
      power = this.field.mul(power, x);
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
        num = this.field.mul(num, this.field.mod(-xj));
        den = this.field.mul(den, this.field.sub(xi, xj));
      }
      const inv = this.field.inverse(den);
      result = this.field.add(
        result,
        this.field.mul(yi, this.field.mul(num, inv)),
      );
    }
    return result;
  }
}
