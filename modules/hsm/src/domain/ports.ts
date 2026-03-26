import type { HsmAuditEntry, KeyEntry } from "./entities";

/**
 * Port for the HSM key store — decouples domain services from storage.
 */
export interface KeyStore {
  has(label: string): boolean;
  get(label: string): KeyEntry | undefined;
  set(label: string, entry: KeyEntry): void;
}

/**
 * Port for the HSM audit log.
 *
 * Ref: NIST SP 800-57 Part 1, §8.1 — key management lifecycle auditing
 * https://csrc.nist.gov/pubs/sp/800-57/pt1/r5/final
 */
export interface AuditLog {
  record(
    operation: string,
    keyLabel: string,
    result: "success" | "failed",
    detail?: string,
  ): void;
  entries(): readonly HsmAuditEntry[];
}
