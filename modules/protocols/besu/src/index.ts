import type {
  PurchaseOrder,
  SharedOrderView,
} from "../../../privacy/src/domain/entities";
import type { PrivacyProtocolAdapter } from "../../src/privacy-port";

export interface BesuContractCall {
  contractName: string;
  method: string;
  args: Array<string | number>;
  privacyGroup: string;
  note: string;
}

export class BesuSelectiveDisclosureAdapter implements PrivacyProtocolAdapter<BesuContractCall> {
  anchorOrder(order: PurchaseOrder, auditProof: string): BesuContractCall {
    return {
      contractName: "ConsortiumOrderRegistry",
      method: "anchorOrder",
      args: [order.id, order.buyer, order.supplier, auditProof],
      privacyGroup: "buyer-supplier-regulator",
      note: "Anchor canonical order metadata and proof in a privacy group.",
    };
  }

  publishAudienceView(view: SharedOrderView): BesuContractCall {
    const proofArg =
      typeof view.auditProof === "string"
        ? view.auditProof
        : JSON.stringify(view.auditProof);
    return {
      contractName: "ConsortiumOrderRegistry",
      method: "publishAudienceView",
      args: [view.orderId, view.audience, JSON.stringify(view.data), proofArg],
      privacyGroup: `view-${view.audience}`,
      note: "Distribute a role-specific payload to the appropriate privacy group.",
    };
  }
}
