/**
 * Mock STARK Proof Adapter
 *
 * Simulated STARK proof generation for testing and demos.
 * Generates deterministic proofs based on input data without actual cryptography.
 *
 * For production, use StarknetProofAdapter with real starknet.js.
 *
 * @see domain/ports.ts for StarkProofGeneratorPort interface
 */

/* eslint-disable @typescript-eslint/require-await */

import { createHash } from "node:crypto";

import type {
  LedgerTransaction,
  BaseProof,
  Tier1Proof,
  Tier2BlockProof,
} from "../../domain/entities.js";
import type { StarkProofGeneratorPort, ClockPort } from "../../domain/ports.js";

/**
 * Configuration for the mock STARK adapter.
 */
export interface MockStarkAdapterConfig {
  /** Simulated proof generation delay in ms (default: 10) */
  simulatedDelayMs?: number;
  /** Simulated proof size in bytes (default: 1024) */
  proofSizeBytes?: number;
  /** Whether to simulate random failures (default: false) */
  simulateFailures?: boolean;
  /** Failure probability when simulateFailures is true (default: 0.01) */
  failureProbability?: number;
}

/**
 * Mock implementation of StarkProofGeneratorPort for testing.
 */
export class MockStarkAdapter implements StarkProofGeneratorPort {
  private readonly config: Required<MockStarkAdapterConfig>;
  private readonly verificationKeyHash: string;
  private proofCounter = 0n;

  constructor(
    private readonly clock: ClockPort,
    config: MockStarkAdapterConfig = {},
  ) {
    this.config = {
      simulatedDelayMs: config.simulatedDelayMs ?? 10,
      proofSizeBytes: config.proofSizeBytes ?? 1024,
      simulateFailures: config.simulateFailures ?? false,
      failureProbability: config.failureProbability ?? 0.01,
    };

    // Generate a deterministic verification key hash
    this.verificationKeyHash = createHash("sha256")
      .update("mock-stark-verification-key-v1")
      .digest("hex");
  }

  async generateBaseProof(
    tx: LedgerTransaction,
    preStateRoot: string,
    postStateRoot: string,
  ): Promise<BaseProof> {
    await this.simulateDelay();
    this.maybeSimulateFailure("generateBaseProof");

    const proofId = this.clock.uuid();
    const starkProof = this.generateMockProof([
      tx.txId,
      tx.type,
      tx.fromAccountId ?? "",
      tx.toAccountId ?? "",
      tx.amount.toString(),
      preStateRoot,
      postStateRoot,
    ]);

    const publicInputs = [
      preStateRoot,
      postStateRoot,
      tx.txId,
      tx.amount.toString(16).padStart(64, "0"),
    ];

    return {
      proofId,
      txId: tx.txId,
      starkProof,
      publicInputs,
      verificationKeyHash: this.verificationKeyHash,
      preStateRoot,
      postStateRoot,
      createdAt: this.clock.now(),
    };
  }

  async aggregateTier1(baseProofs: readonly BaseProof[]): Promise<Tier1Proof> {
    if (baseProofs.length !== 128) {
      throw new Error(
        `Tier-1 aggregation requires exactly 128 base proofs, got ${baseProofs.length}`,
      );
    }

    await this.simulateDelay();
    this.maybeSimulateFailure("aggregateTier1");

    const proofId = this.clock.uuid();
    const baseProofIds = baseProofs.map((p) => p.proofId);

    // Aggregate all proofs into a single hash
    const proofHashes = baseProofs.map((p) =>
      createHash("sha256").update(p.starkProof).digest("hex"),
    );

    const aggregatedProof = this.generateMockProof([
      "tier1-aggregation",
      ...proofHashes,
    ]);

    // Collect idempotency keys (would come from the original transactions)
    const idempotencyKeys = baseProofs.map((p) =>
      createHash("sha256").update(p.txId).digest("hex"),
    );

    // First proof's pre-state, last proof's post-state
    const firstProof = baseProofs[0]!;
    const lastProof = baseProofs[baseProofs.length - 1]!;
    const preStateRoot = firstProof.preStateRoot;
    const postStateRoot = lastProof.postStateRoot;

    const publicInputs = [
      preStateRoot,
      postStateRoot,
      baseProofs.length.toString(),
      createHash("sha256").update(proofHashes.join("")).digest("hex"),
    ];

    return {
      proofId,
      baseProofIds,
      aggregatedProof,
      publicInputs,
      idempotencyKeys,
      preStateRoot,
      postStateRoot,
      txCount: 128,
      createdAt: this.clock.now(),
    };
  }

  async aggregateTier2(
    tier1Proofs: readonly Tier1Proof[],
  ): Promise<Tier2BlockProof> {
    if (tier1Proofs.length !== 64) {
      throw new Error(
        `Tier-2 aggregation requires exactly 64 Tier-1 proofs, got ${tier1Proofs.length}`,
      );
    }

    await this.simulateDelay();
    this.maybeSimulateFailure("aggregateTier2");

    const blockProofId = this.clock.uuid();
    const tier1ProofIds = tier1Proofs.map((p) => p.proofId);

    // Aggregate all Tier-1 proofs into a single hash
    const proofHashes = tier1Proofs.map((p) =>
      createHash("sha256").update(p.aggregatedProof).digest("hex"),
    );

    const finalProof = this.generateMockProof([
      "tier2-block-proof",
      ...proofHashes,
    ]);

    // Collect all idempotency keys from all Tier-1 proofs
    const idempotencyKeys = tier1Proofs.flatMap((p) => p.idempotencyKeys);

    // Final state root (last Tier-1's post-state)
    const lastTier1Proof = tier1Proofs[tier1Proofs.length - 1]!;
    const stateRoot = lastTier1Proof.postStateRoot;

    // Total transaction count
    const txCount = tier1Proofs.reduce((sum, p) => sum + p.txCount, 0);

    const publicInputs = [
      stateRoot,
      txCount.toString(),
      createHash("sha256").update(proofHashes.join("")).digest("hex"),
    ];

    // Increment block number
    const blockNumber = this.proofCounter++;

    return {
      blockProofId,
      tier1ProofIds,
      finalProof,
      publicInputs,
      stateRoot,
      idempotencyKeys,
      txCount,
      blockNumber,
      createdAt: this.clock.now(),
    };
  }

  async verifyBlockProof(blockProof: Tier2BlockProof): Promise<boolean> {
    await this.simulateDelay();
    this.maybeSimulateFailure("verifyBlockProof");

    // Mock verification: check that the proof is non-empty and has valid structure
    return (
      blockProof.finalProof.length > 0 &&
      blockProof.tier1ProofIds.length === 64 &&
      blockProof.txCount === 128 * 64 &&
      blockProof.stateRoot.length === 64
    );
  }

  async getVerificationKeyHash(): Promise<string> {
    return this.verificationKeyHash;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private generateMockProof(inputs: string[]): Uint8Array {
    // Generate a deterministic mock proof based on inputs
    const hash = createHash("sha256");
    hash.update("mock-stark-proof-v1");
    for (const input of inputs) {
      hash.update(input);
    }

    // Create a proof of the configured size
    const proofSeed = hash.digest();
    const proof = new Uint8Array(this.config.proofSizeBytes);

    // Fill with deterministic pseudo-random data based on seed
    for (let i = 0; i < proof.length; i++) {
      proof[i] = proofSeed[i % proofSeed.length]! ^ (i & 0xff);
    }

    return proof;
  }

  private async simulateDelay(): Promise<void> {
    if (this.config.simulatedDelayMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.simulatedDelayMs),
      );
    }
  }

  private maybeSimulateFailure(operation: string): void {
    if (
      this.config.simulateFailures &&
      Math.random() < this.config.failureProbability
    ) {
      throw new Error(`Simulated failure in ${operation}`);
    }
  }
}

/**
 * Mock STARK adapter that allows smaller batch sizes for testing.
 *
 * Use this for demos where generating 8192 transactions is impractical.
 */
export class FlexibleMockStarkAdapter implements StarkProofGeneratorPort {
  private readonly baseAdapter: MockStarkAdapter;
  private readonly tier1BatchSize: number;
  private readonly tier2BatchSize: number;
  private proofCounter = 0n;

  constructor(
    private readonly clock: ClockPort,
    config: MockStarkAdapterConfig & {
      tier1BatchSize?: number;
      tier2BatchSize?: number;
    } = {},
  ) {
    this.baseAdapter = new MockStarkAdapter(clock, config);
    this.tier1BatchSize = config.tier1BatchSize ?? 128;
    this.tier2BatchSize = config.tier2BatchSize ?? 64;
  }

  async generateBaseProof(
    tx: LedgerTransaction,
    preStateRoot: string,
    postStateRoot: string,
  ): Promise<BaseProof> {
    return this.baseAdapter.generateBaseProof(tx, preStateRoot, postStateRoot);
  }

  async aggregateTier1(baseProofs: readonly BaseProof[]): Promise<Tier1Proof> {
    if (baseProofs.length !== this.tier1BatchSize) {
      throw new Error(
        `Tier-1 aggregation requires exactly ${this.tier1BatchSize} base proofs, got ${baseProofs.length}`,
      );
    }

    const proofId = this.clock.uuid();
    const baseProofIds = baseProofs.map((p) => p.proofId);

    const proofHashes = baseProofs.map((p) =>
      createHash("sha256").update(p.starkProof).digest("hex"),
    );

    const aggregatedProof = this.generateMockProof([
      "tier1-aggregation",
      ...proofHashes,
    ]);

    const idempotencyKeys = baseProofs.map((p) =>
      createHash("sha256").update(p.txId).digest("hex"),
    );

    const firstBaseProof = baseProofs[0]!;
    const lastBaseProof = baseProofs[baseProofs.length - 1]!;
    const preStateRoot = firstBaseProof.preStateRoot;
    const postStateRoot = lastBaseProof.postStateRoot;

    const publicInputs = [
      preStateRoot,
      postStateRoot,
      baseProofs.length.toString(),
    ];

    return {
      proofId,
      baseProofIds,
      aggregatedProof,
      publicInputs,
      idempotencyKeys,
      preStateRoot,
      postStateRoot,
      txCount: this.tier1BatchSize,
      createdAt: this.clock.now(),
    };
  }

  async aggregateTier2(
    tier1Proofs: readonly Tier1Proof[],
  ): Promise<Tier2BlockProof> {
    if (tier1Proofs.length !== this.tier2BatchSize) {
      throw new Error(
        `Tier-2 aggregation requires exactly ${this.tier2BatchSize} Tier-1 proofs, got ${tier1Proofs.length}`,
      );
    }

    const blockProofId = this.clock.uuid();
    const tier1ProofIds = tier1Proofs.map((p) => p.proofId);

    const proofHashes = tier1Proofs.map((p) =>
      createHash("sha256").update(p.aggregatedProof).digest("hex"),
    );

    const finalProof = this.generateMockProof([
      "tier2-block-proof",
      ...proofHashes,
    ]);

    const idempotencyKeys = tier1Proofs.flatMap((p) => p.idempotencyKeys);
    const lastTier1 = tier1Proofs[tier1Proofs.length - 1]!;
    const stateRoot = lastTier1.postStateRoot;
    const txCount = tier1Proofs.reduce((sum, p) => sum + p.txCount, 0);
    const blockNumber = this.proofCounter++;

    return {
      blockProofId,
      tier1ProofIds,
      finalProof,
      publicInputs: [stateRoot, txCount.toString()],
      stateRoot,
      idempotencyKeys,
      txCount,
      blockNumber,
      createdAt: this.clock.now(),
    };
  }

  async verifyBlockProof(blockProof: Tier2BlockProof): Promise<boolean> {
    return (
      blockProof.finalProof.length > 0 &&
      blockProof.tier1ProofIds.length === this.tier2BatchSize &&
      blockProof.stateRoot.length === 64
    );
  }

  async getVerificationKeyHash(): Promise<string> {
    return this.baseAdapter.getVerificationKeyHash();
  }

  private generateMockProof(inputs: string[]): Uint8Array {
    const hash = createHash("sha256");
    hash.update("flexible-mock-stark-proof-v1");
    for (const input of inputs) {
      hash.update(input);
    }
    return new Uint8Array(hash.digest());
  }

  /**
   * Get the configured batch sizes.
   */
  getBatchSizes(): { tier1: number; tier2: number } {
    return { tier1: this.tier1BatchSize, tier2: this.tier2BatchSize };
  }
}
