import type { HsmAuditEntry } from "../domain/entities";
import type { AuditLog } from "../domain/ports";

export class InMemoryAuditLog implements AuditLog {
  private readonly log: HsmAuditEntry[] = [];

  record(
    operation: string,
    keyLabel: string,
    result: "success" | "failed",
    detail?: string,
  ): void {
    const entry: HsmAuditEntry = {
      timestamp: new Date().toISOString(),
      operation,
      keyLabel,
      result,
    };
    if (detail !== undefined) {
      entry.detail = detail;
    }
    this.log.push(entry);
  }

  entries(): readonly HsmAuditEntry[] {
    return [...this.log];
  }
}
