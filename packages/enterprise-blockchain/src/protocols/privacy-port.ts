import type {
  PurchaseOrder,
  SharedOrderView,
} from "../privacy/domain/entities.js";

/**
 * Port for anchoring privacy-preserving order views on a distributed ledger.
 */
export interface PrivacyProtocolAdapter<TInvocation> {
  anchorOrder(order: PurchaseOrder, auditProof: string): TInvocation;
  publishAudienceView(view: SharedOrderView): TInvocation;
}
