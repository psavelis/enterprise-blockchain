export interface AidGrant {
  id: string;
  beneficiaryId: string;
  program: string;
  issuedAt: string;
  expiresAt: string;
  approvedMerchantCategories: string[];
  amountUsd: number;
}

export interface RedemptionClaim {
  id: string;
  grantId: string;
  merchantId: string;
  merchantCategory: string;
  submittedAt: string;
  invoiceReference: string;
  amountUsd: number;
}

export interface ReconciliationReport {
  settledClaimIds: string[];
  rejectedClaimIds: string[];
  exceptions: string[];
}

export class AidSettlementLedger {
  private readonly grants = new Map<string, AidGrant>();
  private readonly claims = new Map<string, RedemptionClaim[]>();

  issueGrant(grant: AidGrant): void {
    this.grants.set(grant.id, grant);
  }

  submitClaim(claim: RedemptionClaim): void {
    const grantClaims = this.claims.get(claim.grantId) ?? [];
    grantClaims.push(claim);
    this.claims.set(claim.grantId, grantClaims);
  }

  reconcile(): ReconciliationReport {
    const settledClaimIds: string[] = [];
    const rejectedClaimIds: string[] = [];
    const exceptions: string[] = [];

    for (const [grantId, grantClaims] of this.claims.entries()) {
      const grant = this.grants.get(grantId);
      if (!grant) {
        for (const claim of grantClaims) {
          rejectedClaimIds.push(claim.id);
        }
        exceptions.push(`Claims reference unknown grant ${grantId}.`);
        continue;
      }

      let consumedAmountUsd = 0;
      const seenInvoices = new Set<string>();

      for (const claim of grantClaims) {
        const submittedAt = new Date(claim.submittedAt);
        const isExpired = submittedAt > new Date(grant.expiresAt);
        const disallowedCategory = !grant.approvedMerchantCategories.includes(
          claim.merchantCategory,
        );
        const duplicateInvoice = seenInvoices.has(claim.invoiceReference);
        const exceedsBalance = consumedAmountUsd + claim.amountUsd > grant.amountUsd;

        if (isExpired || disallowedCategory || duplicateInvoice || exceedsBalance) {
          rejectedClaimIds.push(claim.id);

          if (isExpired) {
            exceptions.push(`Claim ${claim.id} was submitted after grant ${grantId} expired.`);
          }
          if (disallowedCategory) {
            exceptions.push(
              `Claim ${claim.id} used merchant category ${claim.merchantCategory}, which is not approved.`,
            );
          }
          if (duplicateInvoice) {
            exceptions.push(`Claim ${claim.id} duplicated invoice ${claim.invoiceReference}.`);
          }
          if (exceedsBalance) {
            exceptions.push(`Claim ${claim.id} would overspend grant ${grantId}.`);
          }
          continue;
        }

        consumedAmountUsd += claim.amountUsd;
        seenInvoices.add(claim.invoiceReference);
        settledClaimIds.push(claim.id);
      }
    }

    return { settledClaimIds, rejectedClaimIds, exceptions };
  }
}