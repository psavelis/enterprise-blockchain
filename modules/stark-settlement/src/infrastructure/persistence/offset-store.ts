/**
 * In-Memory Offset Store
 *
 * Implements OffsetTrackingPort for exactly-once consumption.
 * Tracks the last committed offset per consumer per asset type.
 *
 * @see domain/ports.ts for interface definition
 */

/* eslint-disable @typescript-eslint/require-await */

import type { AssetType } from "../../domain/entities";
import type { OffsetTrackingPort } from "../../domain/ports";

/**
 * In-memory implementation of the offset tracking port.
 */
export class InMemoryOffsetStore implements OffsetTrackingPort {
  // Key: "consumerId:assetType", Value: offset
  private readonly offsets = new Map<string, bigint>();

  private makeKey(consumerId: string, assetType: AssetType): string {
    return `${consumerId}:${assetType}`;
  }

  async getOffset(consumerId: string, assetType: AssetType): Promise<bigint> {
    const key = this.makeKey(consumerId, assetType);
    return this.offsets.get(key) ?? 0n;
  }

  async commitOffset(
    consumerId: string,
    assetType: AssetType,
    offset: bigint,
  ): Promise<void> {
    const key = this.makeKey(consumerId, assetType);
    const currentOffset = this.offsets.get(key) ?? 0n;

    // Offset must be monotonically increasing
    if (offset <= currentOffset) {
      throw new Error(
        `Cannot commit offset ${offset}: current offset is ${currentOffset}`,
      );
    }

    this.offsets.set(key, offset);
  }

  async getConsumerOffsets(
    assetType: AssetType,
  ): Promise<ReadonlyMap<string, bigint>> {
    const result = new Map<string, bigint>();
    const suffix = `:${assetType}`;

    for (const [key, offset] of this.offsets) {
      if (key.endsWith(suffix)) {
        const consumerId = key.slice(0, -suffix.length);
        result.set(consumerId, offset);
      }
    }

    return result;
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Get all offsets (for debugging).
   */
  getAllOffsets(): ReadonlyMap<string, bigint> {
    return new Map(this.offsets);
  }

  /**
   * Clear all offsets (for testing).
   */
  clear(): void {
    this.offsets.clear();
  }
}
