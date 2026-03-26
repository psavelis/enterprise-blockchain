import { sha256hex } from "../../../shared/src/crypto";
import type {
  Audience,
  PurchaseOrder,
  SharedOrderView,
} from "../domain/entities";
import type { OrderRepository } from "../domain/ports";

// Audience-specific field projection rules.
// Ref: W3C Verifiable Credentials Data Model — selective disclosure
// https://www.w3.org/TR/vc-data-model-2.0/#selective-disclosure
const fieldProjections: Record<
  Audience,
  (order: PurchaseOrder) => Record<string, string | number>
> = {
  logistics: (o) => ({
    buyer: o.buyer,
    supplier: o.supplier,
    sku: o.sku,
    quantity: o.quantity,
    incoterm: o.incoterm,
    destinationPort: o.destinationPort,
  }),
  bank: (o) => ({
    buyer: o.buyer,
    supplier: o.supplier,
    totalValueUsd: o.quantity * o.unitPriceUsd,
    destinationPort: o.destinationPort,
    financingBank: o.financingBank ?? "n/a",
    sustainabilityGrade: o.sustainabilityGrade,
  }),
  regulator: (o) => ({
    buyer: o.buyer,
    supplier: o.supplier,
    sku: o.sku,
    quantity: o.quantity,
    destinationPort: o.destinationPort,
    sustainabilityGrade: o.sustainabilityGrade,
  }),
  supplier: (o) => ({
    buyer: o.buyer,
    sku: o.sku,
    quantity: o.quantity,
    unitPriceUsd: o.unitPriceUsd,
    incoterm: o.incoterm,
    destinationPort: o.destinationPort,
  }),
};

export class ViewProjector {
  constructor(private readonly repo: OrderRepository) {}

  createView(orderId: string, audience: Audience): SharedOrderView {
    const order = this.repo.orders.get(orderId);
    if (!order) {
      throw new Error(`Unknown order ${orderId}`);
    }

    return {
      orderId,
      audience,
      data: fieldProjections[audience](order),
      auditProof: sha256hex(JSON.stringify(order)),
    };
  }
}
