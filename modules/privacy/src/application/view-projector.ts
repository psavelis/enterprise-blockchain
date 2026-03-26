import { sha256hex } from "../../../shared/src/crypto";
import type {
  Audience,
  PurchaseOrder,
  SharedOrderView,
} from "../domain/entities";
import type { OrderRepository } from "../domain/ports";
import type { Logger } from "../../../shared/src/logger";
import { noopLogger } from "../../../shared/src/logger";

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
  private readonly logger: Logger;

  constructor(
    private readonly repo: OrderRepository,
    logger?: Logger,
  ) {
    this.logger = logger ?? noopLogger;
  }

  createView(orderId: string, audience: Audience): SharedOrderView {
    const start = Date.now();
    const order = this.repo.orders.get(orderId);
    if (!order) {
      throw new Error(`Unknown order ${orderId}`);
    }

    const view: SharedOrderView = {
      orderId,
      audience,
      data: fieldProjections[audience](order),
      auditProof: sha256hex(JSON.stringify(order)),
    };

    this.logger.info("view projected", {
      operation: "ViewProjector.createView",
      entityId: orderId,
      result: audience,
      durationMs: Date.now() - start,
    });

    return view;
  }
}
