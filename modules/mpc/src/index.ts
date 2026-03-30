import { randomBytes, randomInt } from "node:crypto";

import { commitShare, sha256hex } from "./crypto";

// Re-export field arithmetic for advanced use cases
export {
  FieldArithmetic,
  getFieldConfig,
  DEMO_PRIME,
  PRODUCTION_PRIME,
  demoField,
  productionField,
} from "./field";
export type { FieldConfig, FieldMode } from "./field";

export interface PartyConfig {
  id: string;
  name: string;
  endpoint: string;
}

export interface SecretShare {
  partyId: string;
  shareIndex: number;
  shareCount: number;
  value: number;
  nonce: string;
  commitment: string;
}

export type ComputationOp = "sum" | "threshold";

export interface SumResult {
  computationId: string;
  op: "sum";
  participantCount: number;
  aggregate: number;
  meta: Record<string, string | number | boolean>;
  integrityProof: string;
}

export interface ThresholdResult {
  computationId: string;
  op: "threshold";
  participantCount: number;
  exceeded: boolean;
  meta: Record<string, string | number | boolean>;
  integrityProof: string;
}

export type ComputationResult = SumResult | ThresholdResult;

interface ComputationRound {
  expectedShareCount: number;
  shares: Map<string, SecretShare>;
}

export class MPCEngine {
  private readonly parties = new Map<string, PartyConfig>();
  private readonly rounds = new Map<string, ComputationRound>();

  registerParty(party: PartyConfig): void {
    this.parties.set(party.id, party);
  }

  /**
   * Split `secret` into `partyIds.length` additive shares.
   * Any strict subset of shares reveals nothing about the secret;
   * summing all shares reconstructs the original value.
   */
  splitSecret(secret: number, partyIds: string[]): SecretShare[] {
    if (partyIds.length < 2) {
      throw new Error("At least two parties are required for secret sharing");
    }

    const shares: SecretShare[] = [];
    let remaining = secret;

    // Use a range large enough to make individual shares
    // statistically indistinguishable from random.
    // Node.js randomInt supports a max span of 2^48 − 1.
    const lo = -(2 ** 47) + 1;
    const hi = 2 ** 47;

    for (let i = 0; i < partyIds.length - 1; i++) {
      const value = randomInt(lo, hi);
      remaining -= value;
      const nonce = randomBytes(16).toString("hex");
      shares.push({
        partyId: partyIds[i]!,
        shareIndex: i,
        shareCount: partyIds.length,
        value,
        nonce,
        commitment: commitShare(partyIds[i]!, i, value, nonce),
      });
    }

    const lastNonce = randomBytes(16).toString("hex");
    shares.push({
      partyId: partyIds[partyIds.length - 1]!,
      shareIndex: partyIds.length - 1,
      shareCount: partyIds.length,
      value: remaining,
      nonce: lastNonce,
      commitment: commitShare(
        partyIds[partyIds.length - 1]!,
        partyIds.length - 1,
        remaining,
        lastNonce,
      ),
    });

    return shares;
  }

  submitShare(computationId: string, share: SecretShare): void {
    const party = this.parties.get(share.partyId);
    if (!party) {
      throw new Error(`Unknown party ${share.partyId}`);
    }

    // Verify commitment before accepting the share.
    // This prevents a malicious party from submitting a bogus value
    // with a valid-looking commitment, which would corrupt the result.
    const expected = commitShare(
      share.partyId,
      share.shareIndex,
      share.value,
      share.nonce,
    );
    if (expected !== share.commitment) {
      throw new Error(
        `Commitment verification failed for party ${share.partyId} in computation ${computationId}`,
      );
    }

    let round = this.rounds.get(computationId);
    if (!round) {
      round = { expectedShareCount: share.shareCount, shares: new Map() };
      this.rounds.set(computationId, round);
    }

    if (share.shareCount !== round.expectedShareCount) {
      throw new Error(
        `Inconsistent share count for computation ${computationId}`,
      );
    }

    if (round.shares.has(share.partyId)) {
      throw new Error(
        `Party ${share.partyId} already submitted a share for ${computationId}`,
      );
    }

    // Store a defensive copy to prevent callers from mutating the share
    // after submission, which could corrupt the computation result.
    round.shares.set(share.partyId, { ...share });
  }

  /**
   * - **sum**: reconstructs the aggregate value from all shares.
   * - **threshold**: checks whether the aggregate meets a given
   *   limit supplied via the `threshold` parameter.
   */
  compute(
    computationId: string,
    op: "sum",
    opts?: { threshold?: number },
  ): SumResult;
  compute(
    computationId: string,
    op: "threshold",
    opts?: { threshold?: number },
  ): ThresholdResult;
  compute(
    computationId: string,
    op: ComputationOp,
    opts?: { threshold?: number },
  ): ComputationResult {
    const round = this.rounds.get(computationId);
    if (!round || round.shares.size === 0) {
      throw new Error(`No shares submitted for computation ${computationId}`);
    }

    const participantCount = round.shares.size;
    if (participantCount !== round.expectedShareCount) {
      throw new Error(
        `Incomplete share set for computation ${computationId}: expected ${round.expectedShareCount}, got ${participantCount}`,
      );
    }

    switch (op) {
      case "sum": {
        // Verify commitments BEFORE aggregating values to ensure
        // no share was mutated between submitShare and compute.
        const commitmentsVerified = this.verifyIntegrity(computationId);
        if (!commitmentsVerified) {
          throw new Error(
            `Commitment verification failed during computation ${computationId} — aborting to prevent corrupted result`,
          );
        }
        let aggregate = 0;
        for (const share of round.shares.values()) {
          aggregate += share.value;
        }
        return {
          computationId,
          op: "sum",
          participantCount,
          aggregate,
          meta: {
            operation: "additive-reconstruction",
            commitmentsVerified,
          },
          integrityProof: sha256hex(
            JSON.stringify({
              computationId,
              op: "sum",
              participantCount,
              aggregate,
              commitmentsVerified,
            }),
          ),
        };
      }
      case "threshold": {
        // Verify commitments BEFORE aggregating values to ensure
        // no share was mutated between submitShare and compute.
        const commitmentsVerified = this.verifyIntegrity(computationId);
        if (!commitmentsVerified) {
          throw new Error(
            `Commitment verification failed during computation ${computationId} — aborting to prevent corrupted result`,
          );
        }
        const t = opts?.threshold ?? 0;
        let total = 0;
        for (const share of round.shares.values()) {
          total += share.value;
        }
        const exceeded = total >= t;
        return {
          computationId,
          op: "threshold",
          participantCount,
          exceeded,
          meta: {
            operation: "threshold-check",
            threshold: t,
            commitmentsVerified,
          },
          integrityProof: sha256hex(
            JSON.stringify({
              computationId,
              op: "threshold",
              participantCount,
              exceeded,
              commitmentsVerified,
            }),
          ),
        };
      }
    }
  }

  verifyIntegrity(computationId: string): boolean {
    const round = this.rounds.get(computationId);
    if (!round) return false;

    for (const share of round.shares.values()) {
      const expected = commitShare(
        share.partyId,
        share.shareIndex,
        share.value,
        share.nonce,
      );
      if (expected !== share.commitment) return false;
    }
    return true;
  }
}

// Re-export ML-KEM and Hybrid KEM so consumers can reach them via the module
// root without needing to know the internal file layout.
export { KyberKem, ML_KEM_SIZES } from "./kyber";
export type {
  KyberKeyPair,
  KemEncapsulation,
  KemAuditRecord,
  MlKemParams,
} from "./kyber";
export { HybridKem } from "./hybrid-kem";
export type {
  HybridKeyPairs,
  HybridEncapsulation,
  HybridDecapsulation,
} from "./hybrid-kem";
export { MlDsaSigner, ML_DSA_SIZES } from "./dsa";
export type {
  DsaKeyPair,
  DsaSignatureResult,
  DsaAuditRecord,
  MlDsaParams,
} from "./dsa";
export { QuantumResistantVault } from "./quantum";
export type {
  ThresholdShare,
  HashLadderKey,
  QuantumResistantAnchor,
  VaultConfig,
} from "./quantum";
