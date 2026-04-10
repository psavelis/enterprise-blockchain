import type { ReadonlyStore } from "../../shared/store.js";
import type { AidGrant, RedemptionClaim } from "./entities.js";

export interface AidSettlementRepository {
  readonly grants: ReadonlyStore<string, AidGrant>;
  claimsForGrant(grantId: string): readonly RedemptionClaim[];
  grantIds(): Iterable<string>;
  addGrant(grant: AidGrant): void;
  addClaim(claim: RedemptionClaim): void;
}
