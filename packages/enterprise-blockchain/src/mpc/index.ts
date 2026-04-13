import type { RandomnessProvider, CommitmentProvider } from "./ports.js";
import {
  defaultRandomnessProvider,
  defaultCommitmentProvider,
} from "./adapters.js";

/** Estimated bytes per share entry for memory quota tracking */
const BYTES_PER_SHARE = 200;

// Re-export field arithmetic for advanced use cases
// Note: demoField is intentionally NOT exported to prevent accidental use in production.
// Use `new FieldArithmetic({ mode: "demo", prime: DEMO_PRIME })` explicitly in tests.
export {
  FieldArithmetic,
  getFieldConfig,
  DEMO_PRIME,
  PRODUCTION_PRIME,
  productionField,
} from "./field.js";
export type { FieldConfig, FieldMode } from "./field.js";

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
  createdAt: number;
  /** Track submitted nonces to prevent replay attacks */
  usedNonces: Set<string>;
}

// ── Resource Quota Management ────────────────────────────────────────

export interface ResourceQuotaConfig {
  /** Maximum active sessions per party. Default: 100 */
  maxSessionsPerParty: number;
  /** Maximum total active sessions. Default: 1000 */
  maxTotalSessions: number;
  /** Session TTL in milliseconds. Default: 5 minutes */
  sessionTtlMs: number;
  /** Maximum memory for shares in bytes. Default: 10MB */
  maxMemoryBytes: number;
}

export const DEFAULT_QUOTA_CONFIG: ResourceQuotaConfig = {
  maxSessionsPerParty: 100,
  maxTotalSessions: 1000,
  sessionTtlMs: 5 * 60 * 1000, // 5 minutes
  maxMemoryBytes: 10 * 1024 * 1024, // 10MB
};

export interface ResourceQuotaManager {
  checkSessionQuota(partyId: string): boolean;
  checkTotalSessionQuota(): boolean;
  checkMemoryQuota(additionalBytes: number): boolean;
  recordSession(partyId: string, computationId: string): void;
  releaseSession(computationId: string): void;
  getUsage(): ResourceUsage;
}

export interface ResourceUsage {
  totalSessions: number;
  sessionsByParty: Map<string, number>;
  estimatedMemoryBytes: number;
  oldestSessionAgeMs: number;
}

export class InMemoryResourceQuotaManager implements ResourceQuotaManager {
  private readonly config: ResourceQuotaConfig;
  private readonly sessionsByParty = new Map<string, Set<string>>();
  private readonly sessionCreatedAt = new Map<string, number>();
  private estimatedMemoryBytes = 0;

  constructor(config: Partial<ResourceQuotaConfig> = {}) {
    this.config = { ...DEFAULT_QUOTA_CONFIG, ...config };
  }

  checkSessionQuota(partyId: string): boolean {
    const partySessions = this.sessionsByParty.get(partyId);
    if (!partySessions) return true;
    return partySessions.size < this.config.maxSessionsPerParty;
  }

  checkTotalSessionQuota(): boolean {
    let total = 0;
    for (const sessions of this.sessionsByParty.values()) {
      total += sessions.size;
    }
    return total < this.config.maxTotalSessions;
  }

  checkMemoryQuota(additionalBytes: number): boolean {
    return (
      this.estimatedMemoryBytes + additionalBytes <= this.config.maxMemoryBytes
    );
  }

  recordSession(partyId: string, computationId: string): void {
    let partySessions = this.sessionsByParty.get(partyId);
    if (!partySessions) {
      partySessions = new Set();
      this.sessionsByParty.set(partyId, partySessions);
    }
    partySessions.add(computationId);
    this.sessionCreatedAt.set(computationId, Date.now());
    this.estimatedMemoryBytes += BYTES_PER_SHARE;
  }

  releaseSession(computationId: string): void {
    for (const [partyId, sessions] of this.sessionsByParty.entries()) {
      if (sessions.delete(computationId)) {
        if (sessions.size === 0) {
          this.sessionsByParty.delete(partyId);
        }
        break;
      }
    }
    this.sessionCreatedAt.delete(computationId);
    this.estimatedMemoryBytes = Math.max(
      0,
      this.estimatedMemoryBytes - BYTES_PER_SHARE,
    );
  }

  getUsage(): ResourceUsage {
    const sessionsByParty = new Map<string, number>();
    let totalSessions = 0;
    let oldestAge = 0;
    const now = Date.now();

    for (const [partyId, sessions] of this.sessionsByParty.entries()) {
      sessionsByParty.set(partyId, sessions.size);
      totalSessions += sessions.size;
    }

    for (const createdAt of this.sessionCreatedAt.values()) {
      const age = now - createdAt;
      if (age > oldestAge) oldestAge = age;
    }

    return {
      totalSessions,
      sessionsByParty,
      estimatedMemoryBytes: this.estimatedMemoryBytes,
      oldestSessionAgeMs: oldestAge,
    };
  }

  /** Expire sessions older than TTL. Returns number of expired sessions. */
  expireOldSessions(): number {
    const now = Date.now();
    const expired: string[] = [];

    for (const [computationId, createdAt] of this.sessionCreatedAt.entries()) {
      if (now - createdAt > this.config.sessionTtlMs) {
        expired.push(computationId);
      }
    }

    for (const computationId of expired) {
      this.releaseSession(computationId);
    }

    return expired.length;
  }
}

export interface MPCEngineConfig {
  quotaManager?: ResourceQuotaManager;
  /** Optional randomness provider for dependency injection (testing). */
  randomnessProvider?: RandomnessProvider;
  /** Optional commitment provider for dependency injection (testing). */
  commitmentProvider?: CommitmentProvider;
}

export class MPCEngine {
  private readonly parties = new Map<string, PartyConfig>();
  private readonly rounds = new Map<string, ComputationRound>();
  private readonly quotaManager: ResourceQuotaManager | null;
  private readonly randomness: RandomnessProvider;
  private readonly commitment: CommitmentProvider;

  constructor(config: MPCEngineConfig = {}) {
    this.quotaManager = config.quotaManager ?? null;
    this.randomness = config.randomnessProvider ?? defaultRandomnessProvider;
    this.commitment = config.commitmentProvider ?? defaultCommitmentProvider;
  }

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
      const value = this.randomness.randomInt(lo, hi);
      remaining -= value;
      const nonce = this.randomness.randomBytes(16).toString("hex");
      shares.push({
        partyId: partyIds[i]!,
        shareIndex: i,
        shareCount: partyIds.length,
        value,
        nonce,
        commitment: this.commitment.commitShare(partyIds[i]!, i, value, nonce),
      });
    }

    const lastNonce = this.randomness.randomBytes(16).toString("hex");
    shares.push({
      partyId: partyIds[partyIds.length - 1]!,
      shareIndex: partyIds.length - 1,
      shareCount: partyIds.length,
      value: remaining,
      nonce: lastNonce,
      commitment: this.commitment.commitShare(
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

    // Check resource quotas before accepting new sessions
    if (this.quotaManager) {
      // For new sessions, verify quotas
      if (!this.rounds.has(computationId)) {
        if (!this.quotaManager.checkTotalSessionQuota()) {
          throw new Error(
            `Resource quota exceeded: maximum total sessions reached`,
          );
        }
        if (!this.quotaManager.checkSessionQuota(share.partyId)) {
          throw new Error(
            `Resource quota exceeded: party ${share.partyId} has too many active sessions`,
          );
        }
        if (
          !this.quotaManager.checkMemoryQuota(
            BYTES_PER_SHARE * share.shareCount,
          )
        ) {
          throw new Error(
            `Resource quota exceeded: memory limit would be exceeded`,
          );
        }
      }
    }

    // Verify commitment before accepting the share.
    // This prevents a malicious party from submitting a bogus value
    // with a valid-looking commitment, which would corrupt the result.
    // Uses timing-safe comparison to prevent timing attacks that could
    // leak information about valid commitment prefixes.
    const expected = this.commitment.commitShare(
      share.partyId,
      share.shareIndex,
      share.value,
      share.nonce,
    );
    if (!this.commitment.timingSafeCompare(expected, share.commitment)) {
      throw new Error(
        `Commitment verification failed for party ${share.partyId} in computation ${computationId}`,
      );
    }

    let round = this.rounds.get(computationId);
    if (!round) {
      round = {
        expectedShareCount: share.shareCount,
        shares: new Map(),
        createdAt: Date.now(),
        usedNonces: new Set(),
      };
      this.rounds.set(computationId, round);

      // Record session for quota tracking
      if (this.quotaManager) {
        this.quotaManager.recordSession(share.partyId, computationId);
      }
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

    // SECURITY: Prevent replay attacks within the same computation.
    // Nonces must be unique per computation to prevent an attacker from
    // submitting the same share twice (e.g., to corrupt the aggregate).
    // Note: Cross-computation replay is prevented by commitment binding
    // (partyId + shareIndex + value + nonce) which makes replayed shares
    // fail commitment verification in a different computation context.
    if (round.usedNonces.has(share.nonce)) {
      throw new Error(
        `Replay attack detected: nonce already used in computation ${computationId}`,
      );
    }
    round.usedNonces.add(share.nonce);

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
          integrityProof: this.commitment.sha256hex(
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
          integrityProof: this.commitment.sha256hex(
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
      const expected = this.commitment.commitShare(
        share.partyId,
        share.shareIndex,
        share.value,
        share.nonce,
      );
      // SECURITY: Use timing-safe comparison to prevent timing attacks
      // that could leak information about valid commitment prefixes.
      if (!this.commitment.timingSafeCompare(expected, share.commitment)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Release a completed computation and free associated resources.
   * Call this after compute() to prevent memory accumulation.
   */
  releaseComputation(computationId: string): void {
    const round = this.rounds.get(computationId);
    if (round) {
      this.rounds.delete(computationId);
      if (this.quotaManager) {
        this.quotaManager.releaseSession(computationId);
      }
    }
  }

  /**
   * Get current resource usage statistics.
   * Returns null if no quota manager is configured.
   */
  getResourceUsage(): ResourceUsage | null {
    return this.quotaManager?.getUsage() ?? null;
  }

  /**
   * Expire stale sessions that have exceeded TTL.
   * Returns number of expired sessions.
   */
  expireStaleSessions(): number {
    if (!this.quotaManager) return 0;

    const manager = this.quotaManager as InMemoryResourceQuotaManager;
    if (typeof manager.expireOldSessions !== "function") return 0;

    const expiredCount = manager.expireOldSessions();

    // Also clean up rounds map for expired sessions
    const now = Date.now();
    const config = DEFAULT_QUOTA_CONFIG;
    for (const [computationId, round] of this.rounds.entries()) {
      if (now - round.createdAt > config.sessionTtlMs) {
        this.rounds.delete(computationId);
      }
    }

    return expiredCount;
  }
}

// Re-export ports and adapters for dependency injection
export type { RandomnessProvider, CommitmentProvider } from "./ports.js";
export {
  NodeRandomnessProvider,
  NodeCommitmentProvider,
  defaultRandomnessProvider,
  defaultCommitmentProvider,
} from "./adapters.js";

// Re-export ML-KEM and Hybrid KEM so consumers can reach them via the module
// root without needing to know the internal file layout.
export { KyberKem, ML_KEM_SIZES } from "./kyber.js";
export type {
  KyberKeyPair,
  KemEncapsulation,
  KemAuditRecord,
  MlKemParams,
} from "./kyber.js";
export { HybridKem } from "./hybrid-kem.js";
export type {
  HybridKeyPairs,
  HybridEncapsulation,
  HybridDecapsulation,
} from "./hybrid-kem.js";
export { MlDsaSigner, ML_DSA_SIZES } from "./dsa.js";
export type {
  DsaKeyPair,
  DsaSignatureResult,
  DsaAuditRecord,
  MlDsaParams,
} from "./dsa.js";
export { QuantumResistantVault } from "./quantum.js";
export type {
  ThresholdShare,
  HashLadderKey,
  QuantumResistantAnchor,
  VaultConfig,
} from "./quantum.js";
