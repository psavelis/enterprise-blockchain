import { createHash, randomBytes, randomInt } from "node:crypto";

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

export interface ComputationResult {
  computationId: string;
  op: ComputationOp;
  participantCount: number;
  result: number;
  meta: Record<string, string | number | boolean>;
  integrityProof: string;
}

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
        commitment: this.commit(partyIds[i]!, i, value, nonce),
      });
    }

    const lastNonce = randomBytes(16).toString("hex");
    shares.push({
      partyId: partyIds[partyIds.length - 1]!,
      shareIndex: partyIds.length - 1,
      shareCount: partyIds.length,
      value: remaining,
      nonce: lastNonce,
      commitment: this.commit(
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

    round.shares.set(share.partyId, share);
  }

  /**
   * - **sum**: reconstructs the aggregate value from all shares.
   * - **threshold**: checks whether the aggregate meets a given
   *   limit supplied via the `threshold` parameter.
   */
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

    let result: number;
    const meta: Record<string, string | number | boolean> = {};

    switch (op) {
      case "sum": {
        result = 0;
        for (const share of round.shares.values()) {
          result += share.value;
        }
        meta.operation = "additive-reconstruction";
        break;
      }
      case "threshold": {
        const t = opts?.threshold ?? 0;
        result = 0;
        for (const share of round.shares.values()) {
          result += share.value;
        }
        meta.operation = "threshold-check";
        meta.threshold = t;
        meta.exceeded = result >= t;
        // Do not expose the raw aggregate — only the boolean matters.
        result = result >= t ? 1 : 0;
        break;
      }
    }

    return {
      computationId,
      op,
      participantCount,
      result,
      meta,
      integrityProof: this.hash(
        JSON.stringify({ computationId, op, participantCount, result }),
      ),
    };
  }

  verifyIntegrity(computationId: string): boolean {
    const round = this.rounds.get(computationId);
    if (!round) return false;

    for (const share of round.shares.values()) {
      const expected = this.commit(
        share.partyId,
        share.shareIndex,
        share.value,
        share.nonce,
      );
      if (expected !== share.commitment) return false;
    }
    return true;
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
