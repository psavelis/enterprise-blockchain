/**
 * Settlement Service
 *
 * Orchestrates outbound settlement to external chains:
 * - Solana (devnet): VersionedTransaction with lookup tables
 * - Bitcoin (testnet): PSBT batched UTXO spends
 * - Fiat (mock): ISO 20022 pain.001 credit transfers
 *
 * Uses idempotency keys and outbox entry state transitions to coordinate
 * settlement attempts and reduce duplicate processing.
 *
 * @see domain/ports.ts for settlement port interfaces
 */

import type {
  AssetType,
  Tier2BlockProof,
  OutboxEntry,
  NetTransfer,
  SolanaSettlementResult,
  BitcoinSettlementResult,
  FiatSettlementResult,
} from "../domain/entities";
import type {
  SolanaSettlementPort,
  BitcoinSettlementPort,
  FiatSettlementPort,
} from "../domain/ports";
import type { SettlementContext } from "../index";

/**
 * Result of settling a single rail.
 */
export type SettlementRailResult =
  | {
      success: true;
      assetType: AssetType;
      result:
        | SolanaSettlementResult
        | BitcoinSettlementResult
        | FiatSettlementResult;
    }
  | { success: false; assetType: AssetType; error: string };

/**
 * Result of settling all rails.
 */
export interface SettleAllRailsResult {
  blockProofId: string;
  results: SettlementRailResult[];
  allSucceeded: boolean;
}

/**
 * Settlement service configuration.
 */
export interface SettlementServiceConfig {
  /** Delay between retries in ms (default: 1000) */
  retryDelayMs?: number;
}

/**
 * Settlement service for external chain settlement.
 */
export class SettlementService {
  private readonly config: Required<SettlementServiceConfig>;
  private solanaAdapter: SolanaSettlementPort | null = null;
  private bitcoinAdapter: BitcoinSettlementPort | null = null;
  private fiatAdapter: FiatSettlementPort | null = null;

  constructor(
    private readonly ctx: SettlementContext,
    config?: SettlementServiceConfig,
  ) {
    this.config = {
      retryDelayMs: config?.retryDelayMs ?? 1000,
    };
  }

  /**
   * Set the Solana settlement adapter.
   */
  setSolanaAdapter(adapter: SolanaSettlementPort): void {
    this.solanaAdapter = adapter;
  }

  /**
   * Set the Bitcoin settlement adapter.
   */
  setBitcoinAdapter(adapter: BitcoinSettlementPort): void {
    this.bitcoinAdapter = adapter;
  }

  /**
   * Set the Fiat settlement adapter.
   */
  setFiatAdapter(adapter: FiatSettlementPort): void {
    this.fiatAdapter = adapter;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Settlement Operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Settle all pending outbox entries for a block proof.
   */
  async settleAllRails(
    blockProof: Tier2BlockProof,
  ): Promise<SettleAllRailsResult> {
    const results: SettlementRailResult[] = [];

    // Get all pending entries for this block
    for (const assetType of ["SOL", "BTC", "USD"] as AssetType[]) {
      const entries = await this.ctx.outboxStore.getPendingEntries(
        assetType,
        100,
      );
      const blockEntries = entries.filter(
        (e) => e.blockProofId === blockProof.blockProofId,
      );

      for (const entry of blockEntries) {
        const result = await this.settleEntry(entry, blockProof);
        results.push(result);
      }
    }

    return {
      blockProofId: blockProof.blockProofId,
      results,
      allSucceeded: results.every((r) => r.success),
    };
  }

  /**
   * Settle a single outbox entry.
   */
  async settleEntry(
    entry: OutboxEntry,
    blockProof: Tier2BlockProof,
  ): Promise<SettlementRailResult> {
    // Mark as processing
    await this.ctx.outboxStore.markProcessing(entry.entryId);

    try {
      const result = await this.executeSettlement(entry, blockProof);

      // Mark as settled
      await this.ctx.outboxStore.markSettled(
        entry.entryId,
        this.getSettlementTxId(result),
      );

      // Log audit record
      await this.ctx.auditLog.append({
        eventType: "settlement_confirmed",
        entityId: entry.entryId,
        entityType: "outbox_entry",
        actor: "settlement-service",
        timestamp: this.ctx.clock.now(),
        data: {
          assetType: entry.assetType,
          blockProofId: blockProof.blockProofId,
          settlementTxId: this.getSettlementTxId(result),
        },
      });

      // Emit event with updated entry status
      const settledEntry: OutboxEntry = {
        ...entry,
        status: "settled",
        settledAt: this.ctx.clock.now(),
        settlementTxId: this.getSettlementTxId(result),
      };
      this.ctx.events.emit({
        type: "settlement:completed",
        entry: settledEntry,
        result,
      });

      return { success: true, assetType: entry.assetType, result };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      // Mark as failed
      await this.ctx.outboxStore.markFailed(entry.entryId, errorMessage);

      // Log audit record
      await this.ctx.auditLog.append({
        eventType: "settlement_failed",
        entityId: entry.entryId,
        entityType: "outbox_entry",
        actor: "settlement-service",
        timestamp: this.ctx.clock.now(),
        data: {
          assetType: entry.assetType,
          blockProofId: blockProof.blockProofId,
          error: errorMessage,
          retryCount: entry.retryCount + 1,
        },
      });

      // Emit event with updated entry status
      const failedEntry: OutboxEntry = {
        ...entry,
        status: "failed",
        retryCount: entry.retryCount + 1,
        errorMessage,
      };
      this.ctx.events.emit({
        type: "settlement:failed",
        entry: failedEntry,
        error: errorMessage,
      });

      return {
        success: false,
        assetType: entry.assetType,
        error: errorMessage,
      };
    }
  }

  /**
   * Process all retryable entries.
   */
  async processRetries(): Promise<SettlementRailResult[]> {
    const results: SettlementRailResult[] = [];

    for (const assetType of ["SOL", "BTC", "USD"] as AssetType[]) {
      const entries = await this.ctx.outboxStore.getRetryableEntries(
        assetType,
        10,
      );

      for (const entry of entries) {
        // Get the block proof for this entry
        const blockProof = await this.ctx.ledgerStore.getTier2Proof(
          entry.blockProofId,
        );
        if (!blockProof) {
          console.warn(`Block proof ${entry.blockProofId} not found for retry`);
          continue;
        }

        const result = await this.settleEntry(entry, blockProof);
        results.push(result);

        // Delay between retries
        if (this.config.retryDelayMs > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelayMs),
          );
        }
      }
    }

    return results;
  }

  /**
   * Get health status of all settlement rails.
   */
  async getHealth(): Promise<{
    solana: { available: boolean; healthy: boolean; details?: unknown };
    bitcoin: { available: boolean; healthy: boolean; details?: unknown };
    fiat: { available: boolean; healthy: boolean; details?: unknown };
  }> {
    const result = {
      solana: { available: false, healthy: false } as {
        available: boolean;
        healthy: boolean;
        details?: unknown;
      },
      bitcoin: { available: false, healthy: false } as {
        available: boolean;
        healthy: boolean;
        details?: unknown;
      },
      fiat: { available: false, healthy: false } as {
        available: boolean;
        healthy: boolean;
        details?: unknown;
      },
    };

    if (this.solanaAdapter) {
      result.solana.available = true;
      try {
        const health = await this.solanaAdapter.getHealth();
        result.solana.healthy = health.healthy;
        result.solana.details = health;
      } catch {
        result.solana.healthy = false;
      }
    }

    if (this.bitcoinAdapter) {
      result.bitcoin.available = true;
      try {
        const health = await this.bitcoinAdapter.getHealth();
        result.bitcoin.healthy = health.healthy;
        result.bitcoin.details = health;
      } catch {
        result.bitcoin.healthy = false;
      }
    }

    if (this.fiatAdapter) {
      result.fiat.available = true;
      try {
        const health = await this.fiatAdapter.getHealth();
        result.fiat.healthy = health.healthy;
      } catch {
        result.fiat.healthy = false;
      }
    }

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async executeSettlement(
    entry: OutboxEntry,
    blockProof: Tier2BlockProof,
  ): Promise<
    SolanaSettlementResult | BitcoinSettlementResult | FiatSettlementResult
  > {
    switch (entry.assetType) {
      case "SOL":
        return this.settleSolana(entry.netTransfers, blockProof);
      case "BTC":
        return this.settleBitcoin(entry.netTransfers, blockProof);
      case "USD":
        return this.settleFiat(entry.netTransfers, blockProof);
    }
  }

  private async settleSolana(
    transfers: readonly NetTransfer[],
    blockProof: Tier2BlockProof,
  ): Promise<SolanaSettlementResult> {
    if (!this.solanaAdapter) {
      throw new Error("Solana adapter not configured");
    }
    return this.solanaAdapter.executeBatchedTransfer(transfers, blockProof);
  }

  private async settleBitcoin(
    transfers: readonly NetTransfer[],
    blockProof: Tier2BlockProof,
  ): Promise<BitcoinSettlementResult> {
    if (!this.bitcoinAdapter) {
      throw new Error("Bitcoin adapter not configured");
    }
    return this.bitcoinAdapter.executeBatchedSpend(transfers, blockProof);
  }

  private async settleFiat(
    transfers: readonly NetTransfer[],
    blockProof: Tier2BlockProof,
  ): Promise<FiatSettlementResult> {
    if (!this.fiatAdapter) {
      throw new Error("Fiat adapter not configured");
    }
    return this.fiatAdapter.executeTransfer(transfers, blockProof);
  }

  private getSettlementTxId(
    result:
      | SolanaSettlementResult
      | BitcoinSettlementResult
      | FiatSettlementResult,
  ): string {
    if ("signature" in result) {
      return result.signature; // Solana
    }
    if ("txid" in result) {
      return result.txid; // Bitcoin
    }
    return result.iso20022MessageId; // Fiat
  }
}
