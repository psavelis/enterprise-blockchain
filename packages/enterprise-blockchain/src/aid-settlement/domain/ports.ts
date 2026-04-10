import type { ReadonlyStore } from "../../shared/store";
import type { AidGrant, RedemptionClaim } from "./entities";

export interface AidSettlementRepository {
  readonly grants: ReadonlyStore<string, AidGrant>;
  claimsForGrant(grantId: string): readonly RedemptionClaim[];
  grantIds(): Iterable<string>;
  addGrant(grant: AidGrant): void;
  addClaim(claim: RedemptionClaim): void;
}
