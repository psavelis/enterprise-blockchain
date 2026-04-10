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
import type { AidSettlementRepository } from "./domain/ports";
import type { Logger } from "../shared/logger.js";
import { InMemoryAidSettlementRepository } from "./infrastructure/in-memory-store";
import { Reconciler } from "./application/reconciler";

export class AidSettlementLedger {
  private readonly repo: AidSettlementRepository;
  private readonly logger: Logger | undefined;

  constructor(options?: { repo?: AidSettlementRepository; logger?: Logger }) {
    this.repo = options?.repo ?? new InMemoryAidSettlementRepository();
    this.logger = options?.logger;
  }

  issueGrant(grant: AidGrant): void {
    this.repo.addGrant(grant);
  }

  submitClaim(claim: RedemptionClaim): void {
    this.repo.addClaim(claim);
  }

  reconcile(): ReconciliationReport {
    return new Reconciler(this.repo, this.logger).reconcile();
  }
}
