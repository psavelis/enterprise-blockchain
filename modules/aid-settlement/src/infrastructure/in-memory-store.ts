import { InMemoryStore } from "../../../shared/src/store";
import type { AidGrant, RedemptionClaim } from "../domain/entities";
import type { AidSettlementRepository } from "../domain/ports";

export class InMemoryAidSettlementRepository implements AidSettlementRepository {
  readonly grants = new InMemoryStore<string, AidGrant>();
  private readonly claims = new InMemoryStore<string, RedemptionClaim[]>();

  addGrant(grant: AidGrant): void {
    this.grants.set(grant.id, grant);
  }

  addClaim(claim: RedemptionClaim): void {
    const existing = this.claims.get(claim.grantId) ?? [];
    existing.push(claim);
    this.claims.set(claim.grantId, existing);
  }

  claimsForGrant(grantId: string): readonly RedemptionClaim[] {
    return this.claims.get(grantId) ?? [];
  }

  grantIds(): Iterable<string> {
    const ids = new Set<string>();
    for (const [grantId] of this.claims.entries()) {
      ids.add(grantId);
    }
    return ids;
  }
}
