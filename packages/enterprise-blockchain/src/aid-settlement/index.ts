// Domain
export type {
  AidGrant,
  RedemptionClaim,
  ReconciliationReport,
} from "./domain/entities.js";
export type { AidSettlementRepository } from "./domain/ports.js";

// Application
export { Reconciler } from "./application/reconciler.js";

// Infrastructure
export { InMemoryAidSettlementRepository } from "./infrastructure/in-memory-store.js";

// ---------------------------------------------------------------------------
// Facade — preserves the original public API.
// ---------------------------------------------------------------------------

import type {
  AidGrant,
  RedemptionClaim,
  ReconciliationReport,
} from "./domain/entities.js";
import type { AidSettlementRepository } from "./domain/ports.js";
import type { Logger } from "../shared/logger.js";
import { InMemoryAidSettlementRepository } from "./infrastructure/in-memory-store.js";
import { Reconciler } from "./application/reconciler.js";

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
