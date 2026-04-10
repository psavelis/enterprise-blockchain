/**
 * Audit Adapter
 *
 * Implements AuditPort for compliance logging.
 * Maintains a cryptographically chained audit log.
 *
 * @see domain/ports.ts for AuditPort interface
 */

/* eslint-disable @typescript-eslint/require-await */

import { createHash, randomUUID } from "node:crypto";

import type { AuditRecord } from "../../domain/entities.js";
import type { AuditPort } from "../../domain/ports.js";

/**
 * In-memory audit log with chain integrity verification.
 */
export class InMemoryAuditLog implements AuditPort {
  private readonly records: AuditRecord[] = [];
  private readonly recordsByEntity = new Map<string, string[]>(); // entityId -> recordIds
  private lastHash = "0".repeat(64); // Genesis hash

  async append(
    record: Omit<AuditRecord, "recordId" | "previousHash" | "recordHash">,
  ): Promise<AuditRecord> {
    const recordId = randomUUID();
    const previousHash = this.lastHash;

    // Compute record hash (includes previous hash for chain integrity)
    // IMPORTANT: Use explicit property order for deterministic hashing
    const hashInput = JSON.stringify({
      recordId,
      eventType: record.eventType,
      entityId: record.entityId,
      entityType: record.entityType,
      actor: record.actor,
      timestamp: record.timestamp,
      data: record.data,
      previousHash,
    });
    const recordHash = createHash("sha256").update(hashInput).digest("hex");

    const fullRecord: AuditRecord = {
      recordId,
      ...record,
      previousHash,
      recordHash,
    };

    this.records.push(fullRecord);
    this.lastHash = recordHash;

    // Index by entity
    const existingRecordIds = this.recordsByEntity.get(record.entityId) ?? [];
    this.recordsByEntity.set(record.entityId, [...existingRecordIds, recordId]);

    return fullRecord;
  }

  async getRecordsForEntity(entityId: string): Promise<readonly AuditRecord[]> {
    const recordIds = this.recordsByEntity.get(entityId) ?? [];
    const records: AuditRecord[] = [];

    for (const recordId of recordIds) {
      const record = this.records.find((r) => r.recordId === recordId);
      if (record) {
        records.push(record);
      }
    }

    return records.sort((a, b) => a.timestamp - b.timestamp);
  }

  async verifyChainIntegrity(): Promise<{
    valid: boolean;
    lastValidRecord: string | null;
    errorMessage: string | null;
  }> {
    if (this.records.length === 0) {
      return { valid: true, lastValidRecord: null, errorMessage: null };
    }

    let expectedPreviousHash = "0".repeat(64); // Genesis hash
    let lastValidRecordId: string | null = null;

    for (let i = 0; i < this.records.length; i++) {
      const record = this.records[i]!;

      // Check previous hash
      if (record.previousHash !== expectedPreviousHash) {
        return {
          valid: false,
          lastValidRecord: lastValidRecordId,
          errorMessage: `Chain broken at record ${record.recordId}: expected previousHash ${expectedPreviousHash}, got ${record.previousHash}`,
        };
      }

      // Verify record hash
      const hashInput = JSON.stringify({
        recordId: record.recordId,
        eventType: record.eventType,
        entityId: record.entityId,
        entityType: record.entityType,
        actor: record.actor,
        timestamp: record.timestamp,
        data: record.data,
        previousHash: record.previousHash,
      });
      const computedHash = createHash("sha256").update(hashInput).digest("hex");

      if (record.recordHash !== computedHash) {
        return {
          valid: false,
          lastValidRecord: lastValidRecordId,
          errorMessage: `Hash mismatch at record ${record.recordId}: expected ${computedHash}, got ${record.recordHash}`,
        };
      }

      lastValidRecordId = record.recordId;
      expectedPreviousHash = record.recordHash;
    }

    return {
      valid: true,
      lastValidRecord: lastValidRecordId,
      errorMessage: null,
    };
  }

  async getLatestRecord(): Promise<AuditRecord | null> {
    if (this.records.length === 0) {
      return null;
    }
    return this.records[this.records.length - 1] ?? null;
  }

  // ─── Utilities ──────────────────────────────────────────────────────────

  /**
   * Get all records (for debugging/export).
   */
  getAllRecords(): readonly AuditRecord[] {
    return [...this.records];
  }

  /**
   * Get the total number of records.
   */
  getRecordCount(): number {
    return this.records.length;
  }

  /**
   * Get records by event type.
   */
  getRecordsByEventType(
    eventType: AuditRecord["eventType"],
  ): readonly AuditRecord[] {
    return this.records.filter((r) => r.eventType === eventType);
  }

  /**
   * Export audit log as JSON (for compliance reporting).
   */
  exportAsJson(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        recordCount: this.records.length,
        chainIntegrity: "pending-verification",
        records: this.records,
      },
      null,
      2,
    );
  }

  /**
   * Clear all records (for testing).
   */
  clear(): void {
    this.records.length = 0;
    this.recordsByEntity.clear();
    this.lastHash = "0".repeat(64);
  }
}

/**
 * Default audit log instance.
 */
export const defaultAuditLog = new InMemoryAuditLog();
