export interface AidGrant {
  readonly id: string;
  readonly beneficiaryId: string;
  readonly program: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly approvedMerchantCategories: string[];
  readonly amountUsd: number;
}

export interface RedemptionClaim {
  readonly id: string;
  readonly grantId: string;
  readonly merchantId: string;
  readonly merchantCategory: string;
  readonly submittedAt: string;
  readonly invoiceReference: string;
  readonly amountUsd: number;
}

export interface ReconciliationReport {
  readonly settledClaimIds: string[];
  readonly rejectedClaimIds: string[];
  readonly exceptions: string[];
}
