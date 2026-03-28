import type {
  AidGrant,
  RedemptionClaim,
  ReconciliationReport,
} from "../domain/entities";
import type { AidSettlementRepository } from "../domain/ports";
import type { Logger } from "../../../shared/src/logger";
import { noopLogger } from "../../../shared/src/logger";

export class Reconciler {
  private readonly logger: Logger;

  constructor(
    private readonly repo: AidSettlementRepository,
    logger?: Logger,
  ) {
    this.logger = logger ?? noopLogger;
  }

  reconcile(): ReconciliationReport {
    const start = Date.now();
    this.logger.info("reconciliation started", {
      operation: "Reconciler.reconcile",
    });
    const settledClaimIds: string[] = [];
    const rejectedClaimIds: string[] = [];
    const exceptions: string[] = [];

    for (const grantId of this.repo.grantIds()) {
      const grant = this.repo.grants.get(grantId);
      const claims = this.repo.claimsForGrant(grantId);

      if (!grant) {
        this.rejectOrphanedClaims(
          claims,
          grantId,
          rejectedClaimIds,
          exceptions,
        );
        continue;
      }

      this.processClaims(
        grant,
        claims,
        settledClaimIds,
        rejectedClaimIds,
        exceptions,
      );
    }

    const report: ReconciliationReport = {
      settledClaimIds,
      rejectedClaimIds,
      exceptions,
    };

    this.logger.info("reconciliation completed", {
      operation: "Reconciler.reconcile",
      result: exceptions.length > 0 ? "with-exceptions" : "clean",
      durationMs: Date.now() - start,
      settled: settledClaimIds.length,
      rejected: rejectedClaimIds.length,
    });

    return report;
  }

  private rejectOrphanedClaims(
    claims: readonly RedemptionClaim[],
    grantId: string,
    rejectedClaimIds: string[],
    exceptions: string[],
  ): void {
    for (const claim of claims) {
      rejectedClaimIds.push(claim.id);
    }
    exceptions.push(`Claims reference unknown grant ${grantId}.`);
  }

  private processClaims(
    grant: AidGrant,
    claims: readonly RedemptionClaim[],
    settledClaimIds: string[],
    rejectedClaimIds: string[],
    exceptions: string[],
  ): void {
    let consumedAmountUsd = 0;
    const seenInvoices = new Set<string>();

    for (const claim of claims) {
      const rejection = this.validateClaim(
        claim,
        grant,
        consumedAmountUsd,
        seenInvoices,
      );

      if (rejection) {
        rejectedClaimIds.push(claim.id);
        exceptions.push(...rejection);
        continue;
      }

      consumedAmountUsd += claim.amountUsd;
      seenInvoices.add(claim.invoiceReference);
      settledClaimIds.push(claim.id);
    }
  }

  private validateClaim(
    claim: RedemptionClaim,
    grant: AidGrant,
    consumedAmountUsd: number,
    seenInvoices: Set<string>,
  ): string[] | null {
    const errors: string[] = [];

    if (new Date(claim.submittedAt) > new Date(grant.expiresAt)) {
      errors.push(
        `Claim ${claim.id} was submitted after grant ${grant.id} expired.`,
      );
    }
    if (!grant.approvedMerchantCategories.includes(claim.merchantCategory)) {
      errors.push(
        `Claim ${claim.id} used merchant category ${claim.merchantCategory}, which is not approved.`,
      );
    }
    if (seenInvoices.has(claim.invoiceReference)) {
      errors.push(
        `Claim ${claim.id} duplicated invoice ${claim.invoiceReference}.`,
      );
    }
    if (consumedAmountUsd + claim.amountUsd > grant.amountUsd) {
      errors.push(`Claim ${claim.id} would overspend grant ${grant.id}.`);
    }

    return errors.length > 0 ? errors : null;
  }
}
