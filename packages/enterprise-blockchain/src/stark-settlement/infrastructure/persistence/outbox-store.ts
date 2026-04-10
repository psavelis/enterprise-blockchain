/**
 * In-Memory Outbox Store
 *
 * Implements OutboxPort for the settlement queue.
 * Append-only queue with exactly-once consumption semantics.
 *
 * @see domain/ports.ts for interface definition
 */

/* eslint-disable @typescript-eslint/require-await */

import type { AssetType, OutboxEntry } from "../../domain/entities.js";
import type { OutboxPort } from "../../domain/ports.js";

/**
 * In-memory implementation of the outbox port.
 */
export class InMemoryOutboxStore implements OutboxPort {
  private readonly entries = new Map<string, OutboxEntry>();
  private readonly entriesByAsset = new Map<AssetType, string[]>();
  private nextOffset = 0n;

  async appendEntry(entry: OutboxEntry): Promise<OutboxEntry> {
    if (this.entries.has(entry.entryId)) {
      throw new Error(`Outbox entry ${entry.entryId} already exists`);
    }

    // Always assign offsets in the store to preserve append-order FIFO semantics.
    // This ensures entries are correctly ordered regardless of what offset value was passed.
    const offset = this.nextOffset;
    this.nextOffset += 1n;

    const entryWithOffset: OutboxEntry = {
      ...entry,
      offset,
    };

    this.entries.set(entry.entryId, entryWithOffset);

    // Index by asset type
    const assetEntries = this.entriesByAsset.get(entry.assetType) ?? [];
    this.entriesByAsset.set(entry.assetType, [...assetEntries, entry.entryId]);

    return entryWithOffset;
  }

  async getPendingEntries(
    assetType: AssetType,
    limit: number,
  ): Promise<readonly OutboxEntry[]> {
    if (limit <= 0) return [];

    const entryIds = this.entriesByAsset.get(assetType) ?? [];
    const pending: OutboxEntry[] = [];

    for (const entryId of entryIds) {
      const entry = this.entries.get(entryId);
      if (entry && entry.status === "pending") {
        pending.push(entry);
        if (pending.length >= limit) break;
      }
    }

    // Sort by offset for FIFO ordering (use direct bigint comparison to avoid overflow)
    return pending.sort((a, b) =>
      a.offset < b.offset ? -1 : a.offset > b.offset ? 1 : 0,
    );
  }

  async getEntry(entryId: string): Promise<OutboxEntry | null> {
    return this.entries.get(entryId) ?? null;
  }

  async markProcessing(entryId: string): Promise<void> {
    const entry = this.entries.get(entryId);
    if (!entry) {
      throw new Error(`Outbox entry ${entryId} not found`);
    }

    if (entry.status !== "pending" && entry.status !== "failed") {
      throw new Error(
        `Cannot mark entry ${entryId} as processing: current status is ${entry.status}`,
      );
    }

    const updatedEntry: OutboxEntry = {
      ...entry,
      status: "processing",
    };

    this.entries.set(entryId, updatedEntry);
  }

  async markSettled(entryId: string, settlementTxId: string): Promise<void> {
    const entry = this.entries.get(entryId);
    if (!entry) {
      throw new Error(`Outbox entry ${entryId} not found`);
    }

    if (entry.status !== "processing") {
      throw new Error(
        `Cannot mark entry ${entryId} as settled: current status is ${entry.status}`,
      );
    }

    const updatedEntry: OutboxEntry = {
      ...entry,
      status: "settled",
      settledAt: Date.now(),
      settlementTxId,
    };

    this.entries.set(entryId, updatedEntry);
  }

  async markFailed(entryId: string, errorMessage: string): Promise<void> {
    const entry = this.entries.get(entryId);
    if (!entry) {
      throw new Error(`Outbox entry ${entryId} not found`);
    }

    if (entry.status !== "processing") {
      throw new Error(
        `Cannot mark entry ${entryId} as failed: current status is ${entry.status}`,
      );
    }

    const updatedEntry: OutboxEntry = {
      ...entry,
      status: "failed",
      retryCount: entry.retryCount + 1,
      errorMessage,
    };

    this.entries.set(entryId, updatedEntry);
  }

  async getRetryableEntries(
    assetType: AssetType,
    limit: number,
  ): Promise<readonly OutboxEntry[]> {
    if (limit <= 0) return [];

    const entryIds = this.entriesByAsset.get(assetType) ?? [];
    const retryable: OutboxEntry[] = [];

    for (const entryId of entryIds) {
      const entry = this.entries.get(entryId);
      if (
        entry &&
        entry.status === "failed" &&
        entry.retryCount < entry.maxRetries
      ) {
        retryable.push(entry);
        if (retryable.length >= limit) break;
      }
    }

    // Sort by offset for FIFO ordering (use direct bigint comparison to avoid overflow)
    return retryable.sort((a, b) =>
      a.offset < b.offset ? -1 : a.offset > b.offset ? 1 : 0,
    );
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Get statistics about the outbox (for debugging/monitoring).
   */
  getStats(): {
    total: number;
    pending: number;
    processing: number;
    settled: number;
    failed: number;
    byAsset: Record<AssetType, number>;
  } {
    let pending = 0;
    let processing = 0;
    let settled = 0;
    let failed = 0;
    const byAsset: Record<AssetType, number> = { SOL: 0, BTC: 0, USD: 0 };

    for (const entry of this.entries.values()) {
      switch (entry.status) {
        case "pending":
          pending++;
          break;
        case "processing":
          processing++;
          break;
        case "settled":
          settled++;
          break;
        case "failed":
          failed++;
          break;
      }
      byAsset[entry.assetType]++;
    }

    return {
      total: this.entries.size,
      pending,
      processing,
      settled,
      failed,
      byAsset,
    };
  }

  /**
   * Get the next offset value (for testing).
   */
  getNextOffset(): bigint {
    return this.nextOffset;
  }

  /**
   * Clear all entries (for testing).
   */
  clear(): void {
    this.entries.clear();
    this.entriesByAsset.clear();
    this.nextOffset = 0n;
  }
}
