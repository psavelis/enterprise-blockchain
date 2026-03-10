import { createHash } from "node:crypto";

export interface PurchaseOrder {
  id: string;
  buyer: string;
  supplier: string;
  sku: string;
  quantity: number;
  unitPriceUsd: number;
  incoterm: string;
  destinationPort: string;
  financingBank?: string;
  sustainabilityGrade: "A" | "B" | "C";
}

export type Audience = "logistics" | "bank" | "regulator" | "supplier";

export interface SharedOrderView {
  orderId: string;
  audience: Audience;
  data: Record<string, string | number>;
  auditProof: string;
}

export class SelectiveDisclosureLedger {
  private readonly orders = new Map<string, PurchaseOrder>();

  publishOrder(order: PurchaseOrder): void {
    this.orders.set(order.id, order);
  }

  createView(orderId: string, audience: Audience): SharedOrderView {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Unknown order ${orderId}`);
    }

    const totalValueUsd = order.quantity * order.unitPriceUsd;
    const dataByAudience: Record<Audience, Record<string, string | number>> = {
      logistics: {
        buyer: order.buyer,
        supplier: order.supplier,
        sku: order.sku,
        quantity: order.quantity,
        incoterm: order.incoterm,
        destinationPort: order.destinationPort,
      },
      bank: {
        buyer: order.buyer,
        supplier: order.supplier,
        totalValueUsd,
        destinationPort: order.destinationPort,
        financingBank: order.financingBank ?? "n/a",
        sustainabilityGrade: order.sustainabilityGrade,
      },
      regulator: {
        buyer: order.buyer,
        supplier: order.supplier,
        sku: order.sku,
        quantity: order.quantity,
        destinationPort: order.destinationPort,
        sustainabilityGrade: order.sustainabilityGrade,
      },
      supplier: {
        buyer: order.buyer,
        sku: order.sku,
        quantity: order.quantity,
        unitPriceUsd: order.unitPriceUsd,
        incoterm: order.incoterm,
        destinationPort: order.destinationPort,
      },
    };

    return {
      orderId,
      audience,
      data: dataByAudience[audience],
      auditProof: this.hash(JSON.stringify(order)),
    };
  }

  private hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }
}