// Domain
export type {
  ClinicalCredential,
  ProviderProfile,
  StaffingAssignment,
  ClearanceDecision,
} from "./domain/entities";
export type { CredentialRepository } from "./domain/ports";

// Application
export { ClearanceEvaluator } from "./application/clearance-evaluator";

// Infrastructure
export { InMemoryCredentialRepository } from "./infrastructure/in-memory-store";

// ---------------------------------------------------------------------------
// Facade — preserves the original public API.
// ---------------------------------------------------------------------------

import type {
  ClinicalCredential,
  ClearanceDecision,
  ProviderProfile,
  StaffingAssignment,
} from "./domain/entities";
import type { CredentialRepository } from "./domain/ports";
import type { Logger } from "../shared/logger.js";
import { InMemoryCredentialRepository } from "./infrastructure/in-memory-store";
import { ClearanceEvaluator } from "./application/clearance-evaluator";

export class CredentialRegistry {
  private readonly repo: CredentialRepository;
  private readonly evaluator: ClearanceEvaluator;

  constructor(options?: { repo?: CredentialRepository; logger?: Logger }) {
    this.repo = options?.repo ?? new InMemoryCredentialRepository();
    this.evaluator = new ClearanceEvaluator(this.repo, options?.logger);
  }

  registerProvider(provider: ProviderProfile): void {
    this.repo.addProvider(provider);
  }

  issueCredential(credential: ClinicalCredential): void {
    this.repo.addCredential(credential);
  }

  evaluateAssignment(assignment: StaffingAssignment): ClearanceDecision {
    return this.evaluator.evaluate(assignment);
  }
}
