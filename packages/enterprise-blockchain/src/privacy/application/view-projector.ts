import { sha256hex } from "../../shared/crypto";
import type {
  Audience,
  PurchaseOrder,
  SharedOrderView,
  SignedAuditProof,
} from "../domain/entities";
import type { OrderRepository } from "../domain/ports";
import type { HsmClient } from "../../hsm/index";
import type { Logger } from "../../shared/logger";
import { noopLogger } from "../../shared/logger";

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
    private readonly hsm?: HsmClient,
    private readonly signerKeyLabel?: string,
  ) {
    this.logger = logger ?? noopLogger;
  }

  createView(orderId: string, audience: Audience): SharedOrderView {
    const order = this.repo.orders.get(orderId);
    if (!order) {
      throw new Error(`Unknown order ${orderId}`);
    }

    const timestamp = new Date().toISOString();
    // Use null byte delimiter to prevent ambiguous preimages
    const preimage = [JSON.stringify(order), audience, timestamp].join("\0");
    const hash = sha256hex(preimage);

    let auditProof: string | SignedAuditProof;

    if (this.hsm && this.signerKeyLabel) {
      // Sign the preimage directly — the HSM's createSign("SHA256") handles
      // hashing internally.  Signing `hash` would result in double-SHA-256.
      const { signature } = this.hsm.sign(this.signerKeyLabel, preimage);
      auditProof = {
        hash,
        signature,
        signerKeyLabel: this.signerKeyLabel,
        timestamp,
      };
    } else {
      auditProof = sha256hex(JSON.stringify(order));
    }

    return {
      orderId,
      audience,
      data: fieldProjections[audience](order),
      auditProof,
    };
  }
}
