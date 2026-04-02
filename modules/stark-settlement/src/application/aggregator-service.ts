/**
 * Aggregator Service
 *
 * Orchestrates the tiered recursive STARK proof aggregation:
 * - Tier-1: Aggregates 128 base proofs into a single Tier-1 proof
 * - Tier-2: Aggregates 64 Tier-1 proofs into a final Block Proof
 *
 * The aggregator maintains idempotency keys through all tiers
 * for exactly-once settlement semantics.
 *
 * @see domain/ports.ts for StarkProofGeneratorPort interface
 */

import type {
  BaseProof,
  Tier1Proof,
  Tier2BlockProof,
  AssetType,
  OutboxEntry,
  NetTransfer,
} from "../domain/entities";
import type { SettlementContext } from "../index";

/**
 * Result of the aggregation process.
 */
export interface AggregationResult {
  /** The generated block proof (null if not enough proofs) */
  blockProof: Tier2BlockProof | null;
  /** Number of base proofs processed */
  baseProofsProcessed: number;
  /** Number of Tier-1 proofs generated */
  tier1ProofsGenerated: number;
  /** Whether a block proof was generated */
  blockGenerated: boolean;
}

/**
 * Configuration for the aggregator service.
 */
export interface AggregatorConfig {
  /** Number of base proofs per Tier-1 aggregation (default: 128) */
  tier1BatchSize: number;
  /** Number of Tier-1 proofs per Tier-2 block (default: 64) */
  tier2BatchSize: number;
}

/**
 * Aggregator service for recursive STARK proof composition.
 */
export class AggregatorService {
  private readonly config: AggregatorConfig;

  constructor(
    private readonly ctx: SettlementContext,
    config?: Partial<AggregatorConfig>,
  ) {
    // Get batch sizes from the STARK prover if it's a flexible adapter
    const prover = ctx.starkProver as {
      getBatchSizes?: () => { tier1: number; tier2: number };
    };
    const defaultSizes = prover.getBatchSizes?.() ?? { tier1: 128, tier2: 64 };

    this.config = {
      tier1BatchSize: config?.tier1BatchSize ?? defaultSizes.tier1,
      tier2BatchSize: config?.tier2BatchSize ?? defaultSizes.tier2,
    };
  }

  /**
   * Get the current batch sizes.
   */
  getBatchSizes(): { tier1: number; tier2: number; totalTxsPerBlock: number } {
    return {
      tier1: this.config.tier1BatchSize,
      tier2: this.config.tier2BatchSize,
      totalTxsPerBlock: this.config.tier1BatchSize * this.config.tier2BatchSize,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Aggregation Pipeline
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process available proofs through the aggregation pipeline.
   *
   * Attempts to:
   * 1. Aggregate base proofs into Tier-1 proofs
   * 2. Aggregate Tier-1 proofs into a Tier-2 block proof
   *
   * @returns Aggregation result with statistics
   */
  async processAggregation(): Promise<AggregationResult> {
    let baseProofsProcessed = 0;
    let tier1ProofsGenerated = 0;

    // Step 1: Aggregate base proofs into Tier-1 proofs
    while (true) {
      const baseProofs = await this.ctx.ledgerStore.getUnaggreatedBaseProofs(
        this.config.tier1BatchSize,
      );

      if (baseProofs.length < this.config.tier1BatchSize) {
        break; // Not enough base proofs for a Tier-1 aggregation
      }

      const tier1Proof = await this.aggregateTier1(baseProofs);
      baseProofsProcessed += baseProofs.length;
      tier1ProofsGenerated++;

      // Emit event
      this.ctx.events.emit({
        type: "proof:tier1:generated",
        proof: tier1Proof,
      });
    }

    // Step 2: Aggregate Tier-1 proofs into a Tier-2 block proof
    const tier1Proofs = await this.ctx.ledgerStore.getUnaggreatedTier1Proofs(
      this.config.tier2BatchSize,
    );

    if (tier1Proofs.length < this.config.tier2BatchSize) {
      return {
        blockProof: null,
        baseProofsProcessed,
        tier1ProofsGenerated,
        blockGenerated: false,
      };
    }

    const blockProof = await this.aggregateTier2(tier1Proofs);

    // Emit event
    this.ctx.events.emit({ type: "proof:tier2:generated", proof: blockProof });

    return {
      blockProof,
      baseProofsProcessed,
      tier1ProofsGenerated,
      blockGenerated: true,
    };
  }

  /**
   * Aggregate base proofs into a Tier-1 proof.
   */
  async aggregateTier1(baseProofs: readonly BaseProof[]): Promise<Tier1Proof> {
    if (baseProofs.length !== this.config.tier1BatchSize) {
      throw new Error(
        `Tier-1 aggregation requires exactly ${this.config.tier1BatchSize} base proofs, got ${baseProofs.length}`,
      );
    }

    const tier1Proof = await this.ctx.starkProver.aggregateTier1(baseProofs);

    // Save to ledger store
    await this.ctx.ledgerStore.saveTier1Proof(tier1Proof);

    // Update transaction statuses
    for (const baseProof of baseProofs) {
      await this.ctx.ledgerStore.updateTransactionStatus(
        baseProof.txId,
        "aggregated",
      );
    }

    // Log audit record
    await this.ctx.auditLog.append({
      eventType: "proof_aggregated",
      entityId: tier1Proof.proofId,
      entityType: "tier1_proof",
      actor: "aggregator",
      timestamp: this.ctx.clock.now(),
      data: {
        baseProofCount: baseProofs.length,
        txCount: tier1Proof.txCount,
        preStateRoot: tier1Proof.preStateRoot,
        postStateRoot: tier1Proof.postStateRoot,
      },
    });

    return tier1Proof;
  }

  /**
   * Aggregate Tier-1 proofs into a Tier-2 block proof.
   */
  async aggregateTier2(
    tier1Proofs: readonly Tier1Proof[],
  ): Promise<Tier2BlockProof> {
    if (tier1Proofs.length !== this.config.tier2BatchSize) {
      throw new Error(
        `Tier-2 aggregation requires exactly ${this.config.tier2BatchSize} Tier-1 proofs, got ${tier1Proofs.length}`,
      );
    }

    const blockProof = await this.ctx.starkProver.aggregateTier2(tier1Proofs);

    // Save to ledger store
    await this.ctx.ledgerStore.saveTier2Proof(blockProof);

    // Update transaction statuses for all covered transactions
    // (This would require tracking txIds through the proof chain)

    // Log audit record
    await this.ctx.auditLog.append({
      eventType: "proof_aggregated",
      entityId: blockProof.blockProofId,
      entityType: "tier2_proof",
      actor: "aggregator",
      timestamp: this.ctx.clock.now(),
      data: {
        tier1ProofCount: tier1Proofs.length,
        txCount: blockProof.txCount,
        blockNumber: blockProof.blockNumber.toString(),
        stateRoot: blockProof.stateRoot,
      },
    });

    return blockProof;
  }

  /**
   * Process proofs until a block is generated or no more proofs are available.
   *
   * Convenience method for demo/testing - processes multiple batches.
   */
  async processToBlockProof(): Promise<Tier2BlockProof | null> {
    // Keep processing until we get a block or run out of proofs
    let result = await this.processAggregation();
    while (!result.blockGenerated && result.baseProofsProcessed > 0) {
      result = await this.processAggregation();
    }
    return result.blockProof;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Outbox Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create outbox entries for a block proof.
   *
   * Computes net transfers per asset type and creates outbox entries
   * for settlement.
   *
   * @param blockProof - The block proof to create entries for
   * @param netTransfersByAsset - Pre-computed net transfers by asset type
   */
  async createOutboxEntries(
    blockProof: Tier2BlockProof,
    netTransfersByAsset: Map<AssetType, NetTransfer[]>,
  ): Promise<OutboxEntry[]> {
    const entries: OutboxEntry[] = [];
    const now = this.ctx.clock.now();

    for (const [assetType, transfers] of netTransfersByAsset) {
      if (transfers.length === 0) continue;

      const entry: OutboxEntry = {
        entryId: this.ctx.clock.uuid(),
        blockProofId: blockProof.blockProofId,
        assetType,
        netTransfers: transfers,
        status: "pending",
        retryCount: 0,
        maxRetries: 3,
        createdAt: now,
        settledAt: null,
        settlementTxId: null,
        errorMessage: null,
        offset: 0n, // Will be assigned by outbox store
      };

      await this.ctx.outboxStore.appendEntry(entry);
      entries.push(entry);

      // Emit event
      this.ctx.events.emit({ type: "settlement:initiated", entry });
    }

    return entries;
  }

  /**
   * Compute net transfers from transaction history.
   *
   * Groups transactions by external address and computes the net
   * amount change for each address.
   */
  computeNetTransfers(
    transactions: ReadonlyArray<{
      type: "deposit" | "transfer" | "withdrawal";
      fromAccountId: string | null;
      toAccountId: string | null;
      amount: bigint;
    }>,
    accountAddresses: Map<string, string>, // accountId -> externalAddress
  ): Map<string, bigint> {
    const netByAddress = new Map<string, bigint>();

    for (const tx of transactions) {
      // Withdrawals: debit from external address
      if (tx.type === "withdrawal" && tx.fromAccountId) {
        const address = accountAddresses.get(tx.fromAccountId);
        if (address) {
          const current = netByAddress.get(address) ?? 0n;
          netByAddress.set(address, current - tx.amount);
        }
      }

      // Deposits: credit to external address
      if (tx.type === "deposit" && tx.toAccountId) {
        const address = accountAddresses.get(tx.toAccountId);
        if (address) {
          const current = netByAddress.get(address) ?? 0n;
          netByAddress.set(address, current + tx.amount);
        }
      }

      // Transfers: Internal only, no external settlement needed
      // (unless transferring to a withdrawal-pending account)
    }

    return netByAddress;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Verification
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Verify a block proof.
   */
  async verifyBlockProof(blockProof: Tier2BlockProof): Promise<boolean> {
    return this.ctx.starkProver.verifyBlockProof(blockProof);
  }

  /**
   * Get aggregation statistics.
   */
  async getStats(): Promise<{
    pendingBaseProofs: number;
    pendingTier1Proofs: number;
    latestBlockNumber: bigint | null;
    totalTxsPerBlock: number;
  }> {
    const baseProofs = await this.ctx.ledgerStore.getUnaggreatedBaseProofs(
      this.config.tier1BatchSize * this.config.tier2BatchSize,
    );
    const tier1Proofs = await this.ctx.ledgerStore.getUnaggreatedTier1Proofs(
      this.config.tier2BatchSize,
    );
    const latestBlock = await this.ctx.ledgerStore.getLatestBlockProof();

    return {
      pendingBaseProofs: baseProofs.length,
      pendingTier1Proofs: tier1Proofs.length,
      latestBlockNumber: latestBlock?.blockNumber ?? null,
      totalTxsPerBlock: this.config.tier1BatchSize * this.config.tier2BatchSize,
    };
  }
}
