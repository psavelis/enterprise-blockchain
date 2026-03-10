export interface ClinicalCredential {
  id: string;
  providerId: string;
  type: string;
  jurisdictions: string[];
  validUntil: string;
}

export interface ProviderProfile {
  id: string;
  name: string;
  specialties: string[];
  sanctionStatus: "clear" | "review" | "blocked";
}

export interface StaffingAssignment {
  providerId: string;
  facility: string;
  jurisdiction: string;
  requiredCredentials: string[];
  procedure: string;
  scheduledAt: string;
}

export interface ClearanceDecision {
  approved: boolean;
  missingCredentials: string[];
  expiringSoon: string[];
  reasons: string[];
}

export class CredentialRegistry {
  private readonly providers = new Map<string, ProviderProfile>();
  private readonly credentials = new Map<string, ClinicalCredential[]>();

  registerProvider(provider: ProviderProfile): void {
    this.providers.set(provider.id, provider);
  }

  issueCredential(credential: ClinicalCredential): void {
    const providerCredentials = this.credentials.get(credential.providerId) ?? [];
    providerCredentials.push(credential);
    this.credentials.set(credential.providerId, providerCredentials);
  }

  evaluateAssignment(assignment: StaffingAssignment): ClearanceDecision {
    const provider = this.providers.get(assignment.providerId);
    if (!provider) {
      throw new Error(`Unknown provider ${assignment.providerId}`);
    }

    const providerCredentials = this.credentials.get(assignment.providerId) ?? [];
    const reasons: string[] = [];
    const missingCredentials: string[] = [];
    const expiringSoon: string[] = [];
    const scheduleDate = new Date(assignment.scheduledAt);

    if (provider.sanctionStatus !== "clear") {
      reasons.push(`Provider sanction status is ${provider.sanctionStatus}.`);
    }

    for (const requiredCredential of assignment.requiredCredentials) {
      const credential = providerCredentials.find(
        (item) =>
          item.type === requiredCredential && item.jurisdictions.includes(assignment.jurisdiction),
      );

      if (!credential) {
        missingCredentials.push(requiredCredential);
        reasons.push(
          `Missing ${requiredCredential} credential for jurisdiction ${assignment.jurisdiction}.`,
        );
        continue;
      }

      const validUntil = new Date(credential.validUntil);
      if (validUntil < scheduleDate) {
        missingCredentials.push(requiredCredential);
        reasons.push(`${requiredCredential} expires before the scheduled procedure.`);
        continue;
      }

      const daysUntilExpiry = Math.ceil(
        (validUntil.getTime() - scheduleDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilExpiry <= 30) {
        expiringSoon.push(`${requiredCredential} (${daysUntilExpiry} days remaining)`);
      }
    }

    return {
      approved:
        reasons.length === 0 && missingCredentials.length === 0 && provider.sanctionStatus === "clear",
      missingCredentials,
      expiringSoon,
      reasons,
    };
  }
}