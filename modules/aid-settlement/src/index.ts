// Domain
export type {
  AidGrant,
  RedemptionClaim,
  ReconciliationReport,
} from "./domain/entities";
export type { AidSettlementRepository } from "./domain/ports";

// Application
export { Reconciler } from "./application/reconciler";

// Infrastructure
export { InMemoryAidSettlementRepository } from "./infrastructure/in-memory-store";

// ---------------------------------------------------------------------------
// Facade — preserves the original public API.
// ---------------------------------------------------------------------------

import type {
  AidGrant,
  RedemptionClaim,
  ReconciliationReport,
} from "./domain/entities";
import { InMemoryAidSettlementRepository } from "./infrastructure/in-memory-store";
import { Reconciler } from "./application/reconciler";

export class AidSettlementLedger {
  private readonly repo = new InMemoryAidSettlementRepository();

  issueGrant(grant: AidGrant): void {
    this.repo.addGrant(grant);
  }

  submitClaim(claim: RedemptionClaim): void {
    this.repo.addClaim(claim);
  }

  reconcile(): ReconciliationReport {
    return new Reconciler(this.repo).reconcile();
  }
}
