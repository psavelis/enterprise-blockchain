import { daysUntil } from "../../../shared/src/date";
import type { ClearanceDecision, StaffingAssignment } from "../domain/entities";
import type { CredentialRepository } from "../domain/ports";

export class ClearanceEvaluator {
  constructor(private readonly repo: CredentialRepository) {}

  evaluate(assignment: StaffingAssignment): ClearanceDecision {
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

    return {
      approved:
        reasons.length === 0 &&
        missingCredentials.length === 0 &&
        provider.sanctionStatus === "clear",
      missingCredentials,
      expiringSoon,
      reasons,
    };
  }
}
