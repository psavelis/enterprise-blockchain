import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

import type { HsmAuditEntry } from "../domain/entities";
import type { AuditLog } from "../domain/ports";

/**
 * Chained audit entry with cryptographic integrity.
 * Each entry includes a hash of the previous entry, creating a tamper-evident chain.
 */
export interface ChainedAuditEntry extends HsmAuditEntry {
  /** SHA-256 hash of the previous entry (hex). First entry uses "genesis". */
  previousHash: string;
  /** SHA-256 hash of this entry including previousHash (hex). */
  entryHash: string;
  /** Monotonic sequence number starting at 1. */
  sequenceNumber: number;
}

/**
 * Persistent audit log with append-only writes and cryptographic chaining.
 *
 * Each entry includes:
 * - SHA-256 hash of the previous entry (tamper-evidence)
 * - Monotonic sequence number (gap detection)
 * - Entry hash for integrity verification
 *
 * File format: NDJSON (newline-delimited JSON) for append-only writes.
 *
 * Ref: NIST SP 800-57 Part 1, §8.1 — key management lifecycle auditing
 */
export class FileAuditLog implements AuditLog {
  private readonly filePath: string;
  private lastHash: string = "genesis";
  private sequenceNumber: number = 0;
  private readonly cache: ChainedAuditEntry[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
    this.loadExistingEntries();
  }

  record(
    operation: string,
    keyLabel: string,
    result: "success" | "failed",
    detail?: string,
  ): void {
    this.sequenceNumber++;

    const baseEntry: HsmAuditEntry = {
      timestamp: new Date().toISOString(),
      operation,
      keyLabel,
      result,
    };
    if (detail !== undefined) {
      baseEntry.detail = detail;
    }

    const chainedEntry: ChainedAuditEntry = {
      ...baseEntry,
      previousHash: this.lastHash,
      sequenceNumber: this.sequenceNumber,
      entryHash: "", // Computed below
    };

    chainedEntry.entryHash = this.computeHash(chainedEntry);
    this.lastHash = chainedEntry.entryHash;

    this.appendToFile(chainedEntry);
    this.cache.push(chainedEntry);
  }

  entries(): readonly HsmAuditEntry[] {
    return this.cache.map((e) => {
      const entry: HsmAuditEntry = {
        timestamp: e.timestamp,
        operation: e.operation,
        keyLabel: e.keyLabel,
        result: e.result,
      };
      if (e.detail !== undefined) {
        entry.detail = e.detail;
      }
      return entry;
    });
  }

  /**
   * Get all chained entries including integrity metadata.
   */
  chainedEntries(): readonly ChainedAuditEntry[] {
    return [...this.cache];
  }

  /**
   * Verify the integrity of the entire audit chain.
   * Returns true if all hashes are valid and sequence is unbroken.
   */
  verifyIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    let expectedPreviousHash = "genesis";

    for (let i = 0; i < this.cache.length; i++) {
      const entry = this.cache[i]!;

      // Verify sequence number
      if (entry.sequenceNumber !== i + 1) {
        errors.push(
          `Entry ${i}: sequence number mismatch (expected ${i + 1}, got ${entry.sequenceNumber})`,
        );
      }

      // Verify previous hash chain
      if (entry.previousHash !== expectedPreviousHash) {
        errors.push(
          `Entry ${i}: previous hash mismatch (expected ${expectedPreviousHash.slice(0, 16)}..., got ${entry.previousHash.slice(0, 16)}...)`,
        );
      }

      // Verify entry hash
      const computedHash = this.computeHash(entry);
      if (entry.entryHash !== computedHash) {
        errors.push(
          `Entry ${i}: entry hash mismatch (computed ${computedHash.slice(0, 16)}..., stored ${entry.entryHash.slice(0, 16)}...)`,
        );
      }

      expectedPreviousHash = entry.entryHash;
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Get the current chain tip hash for external anchoring.
   */
  getChainTipHash(): string {
    return this.lastHash;
  }

  private computeHash(entry: ChainedAuditEntry): string {
    const payload = JSON.stringify({
      timestamp: entry.timestamp,
      operation: entry.operation,
      keyLabel: entry.keyLabel,
      result: entry.result,
      detail: entry.detail,
      previousHash: entry.previousHash,
      sequenceNumber: entry.sequenceNumber,
    });
    return createHash("sha256").update(payload).digest("hex");
  }

  private appendToFile(entry: ChainedAuditEntry): void {
    const line = JSON.stringify(entry) + "\n";
    appendFileSync(this.filePath, line, "utf-8");
  }

  private loadExistingEntries(): void {
    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, "", "utf-8");
      return;
    }

    const content = readFileSync(this.filePath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    for (const line of lines) {
      const entry = JSON.parse(line) as ChainedAuditEntry;
      this.cache.push(entry);
      this.lastHash = entry.entryHash;
      this.sequenceNumber = entry.sequenceNumber;
    }
  }
}
