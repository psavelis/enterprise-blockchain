import { daysUntil } from "../../../shared/src/date";
import type { ClearanceDecision, StaffingAssignment } from "../domain/entities";
import type { CredentialRepository } from "../domain/ports";
import type { Logger } from "../../../shared/src/logger";
import { noopLogger } from "../../../shared/src/logger";

export class ClearanceEvaluator {
  private readonly logger: Logger;

  constructor(
    private readonly repo: CredentialRepository,
    logger?: Logger,
  ) {
    this.logger = logger ?? noopLogger;
  }

  evaluate(assignment: StaffingAssignment): ClearanceDecision {
    const start = Date.now();
    this.logger.info("clearance evaluation started", {
      operation: "ClearanceEvaluator.evaluate",
      entityId: assignment.providerId,
    });
    const provider = this.repo.providers.get(assignment.providerId);
    if (!provider) {
      throw new Error(`Unknown provider ${assignment.providerId}`);
    }

    const credentials = this.repo.getCredentials(assignment.providerId);
    const reasons: string[] = [];
    const missingCredentials: string[] = [];
    const expiringSoon: string[] = [];
    const scheduleDate = new Date(assignment.scheduledAt);

    if (provider.sanctionStatus !== "clear") {
      reasons.push(`Provider sanction status is ${provider.sanctionStatus}.`);
    }

    for (const required of assignment.requiredCredentials) {
      const credential = credentials.find(
        (c) =>
          c.type === required &&
          c.jurisdictions.includes(assignment.jurisdiction),
      );

      if (!credential) {
        missingCredentials.push(required);
        reasons.push(
          `Missing ${required} credential for jurisdiction ${assignment.jurisdiction}.`,
        );
        continue;
      }

      const validUntil = new Date(credential.validUntil);
      if (validUntil < scheduleDate) {
        missingCredentials.push(required);
        reasons.push(`${required} expires before the scheduled procedure.`);
        continue;
      }

      const remaining = daysUntil(scheduleDate, validUntil);
      if (remaining <= 30) {
        expiringSoon.push(`${required} (${remaining} days remaining)`);
      }
    }

    const decision: ClearanceDecision = {
      approved:
        reasons.length === 0 &&
        missingCredentials.length === 0 &&
        provider.sanctionStatus === "clear",
      missingCredentials,
      expiringSoon,
      reasons,
    };

    this.logger.info(
      decision.approved ? "clearance approved" : "clearance denied",
      {
        operation: "ClearanceEvaluator.evaluate",
        entityId: assignment.providerId,
        result: decision.approved ? "approved" : "denied",
        durationMs: Date.now() - start,
      },
    );

    return decision;
  }
}
