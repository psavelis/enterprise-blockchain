export interface ClinicalCredential {
  readonly id: string;
  readonly providerId: string;
  readonly type: string;
  readonly jurisdictions: string[];
  readonly validUntil: string;
}

export interface ProviderProfile {
  readonly id: string;
  readonly name: string;
  readonly specialties: string[];
  readonly sanctionStatus: "clear" | "review" | "blocked";
}

export interface StaffingAssignment {
  readonly providerId: string;
  readonly facility: string;
  readonly jurisdiction: string;
  readonly requiredCredentials: string[];
  readonly procedure: string;
  readonly scheduledAt: string;
}

export interface ClearanceDecision {
  readonly approved: boolean;
  readonly missingCredentials: string[];
  readonly expiringSoon: string[];
  readonly reasons: string[];
}
