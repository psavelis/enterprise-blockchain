import { createHash, randomBytes, randomInt } from "node:crypto";

export interface ThresholdShare {
  partyId: string;
  shareIndex: number;
  value: number;
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

// Mersenne prime 2^31 − 1.  Large enough for the demo secrets used in
// examples while keeping share values within safe-integer range.
const PRIME = 2_147_483_647n;

export class QuantumResistantVault {
  /**
   * Distribute `secret` across `parties` using Shamir's Secret Sharing.
   * Any `threshold` shares reconstruct the secret; fewer reveal nothing.
   */
  distributeSecret(
    secret: number,
    parties: string[],
    threshold: number,
  ): Map<string, ThresholdShare> {
    if (threshold < 2) {
      throw new Error("Threshold must be at least 2");
    }
    if (threshold > parties.length) {
      throw new Error("Threshold cannot exceed party count");
    }
    if (secret < 0 || secret >= Number(PRIME)) {
      throw new Error(`Secret must be in range [0, ${PRIME})`);
    }

    // Random polynomial of degree (threshold − 1) with secret as constant term.
    const coeffs: bigint[] = [BigInt(secret)];
    for (let i = 1; i < threshold; i++) {
      coeffs.push(BigInt(randomInt(1, Number(PRIME))));
    }

    const shares = new Map<string, ThresholdShare>();
    for (let i = 0; i < parties.length; i++) {
      const x = BigInt(i + 1);
      const y = Number(this.evalPoly(coeffs, x));
      const nonce = randomBytes(16).toString("hex");
      shares.set(parties[i]!, {
        partyId: parties[i]!,
        shareIndex: i,
        value: y,
        nonce,
        commitment: this.commit(parties[i]!, i, y, nonce),
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
  ): number | null {
    if (shares.length < threshold) {
      return null;
    }

    const points: [bigint, bigint][] = shares.map((s) => [
      BigInt(s.shareIndex + 1),
      BigInt(s.value),
    ]);

    return Number(this.lagrangeInterpolate(points));
  }

  /** Build a SHA-256 hash chain of `depth` iterations from a random seed. */
  createHashLadder(depth: number): HashLadderKey {
    let current = this.hash(String(randomInt(0, 2 ** 48 - 1)));

    for (let i = 0; i < depth; i++) {
      current = this.hash(current);
    }

    return { publicRoot: current, depth, scheme: "sha256-chain" };
  }

  /** Anchor data with a hash-ladder proof (no asymmetric key involved). */
  anchorWithPostQuantumProof(data: string): QuantumResistantAnchor {
    const ladder = this.createHashLadder(256);

    return {
      dataHash: this.hash(data),
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

  private commit(
    partyId: string,
    index: number,
    value: number,
    nonce: string,
  ): string {
    return this.hash(`${nonce}:${partyId}:${index}:${value}`);
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}
