// Domain
export type {
  ClinicalCredential,
  ProviderProfile,
  StaffingAssignment,
  ClearanceDecision,
} from "./domain/entities.js";
export type { CredentialRepository } from "./domain/ports.js";

// Application
export { ClearanceEvaluator } from "./application/clearance-evaluator.js";

// Infrastructure
export { InMemoryCredentialRepository } from "./infrastructure/in-memory-store.js";

// ---------------------------------------------------------------------------
// Facade — preserves the original public API.
// ---------------------------------------------------------------------------

import type {
  ClinicalCredential,
  ClearanceDecision,
  ProviderProfile,
  StaffingAssignment,
} from "./domain/entities.js";
import type { CredentialRepository } from "./domain/ports.js";
import type { Logger } from "../shared/logger.js";
import { InMemoryCredentialRepository } from "./infrastructure/in-memory-store.js";
import { ClearanceEvaluator } from "./application/clearance-evaluator.js";

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
