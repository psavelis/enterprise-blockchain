import { InMemoryStore, CollectionStore } from "../../shared/index";
import type { AidGrant, RedemptionClaim } from "../domain/entities";
import type { AidSettlementRepository } from "../domain/ports";

export class InMemoryAidSettlementRepository implements AidSettlementRepository {
  readonly grants = new InMemoryStore<string, AidGrant>();
  private readonly claims = new CollectionStore<string, RedemptionClaim>();

  addGrant(grant: AidGrant): void {
    this.grants.set(grant.id, grant);
  }

  addClaim(claim: RedemptionClaim): void {
    this.claims.append(claim.grantId, claim);
  }

  claimsForGrant(grantId: string): readonly RedemptionClaim[] {
    return this.claims.getAll(grantId);
  }

  grantIds(): Iterable<string> {
    return this.claims.keys();
  }
}
