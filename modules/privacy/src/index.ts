// Domain
export type {
  PurchaseOrder,
  Audience,
  SharedOrderView,
  SignedAuditProof,
} from "./domain/entities";
export type { OrderRepository } from "./domain/ports";

// Application
export { ViewProjector } from "./application/view-projector";

// Infrastructure
export { InMemoryOrderRepository } from "./infrastructure/in-memory-store";

// ---------------------------------------------------------------------------
// Facade — preserves the original public API.
// ---------------------------------------------------------------------------

import type {
  Audience,
  PurchaseOrder,
  SharedOrderView,
} from "./domain/entities";
import { InMemoryOrderRepository } from "./infrastructure/in-memory-store";
import { ViewProjector } from "./application/view-projector";
import type { HsmClient } from "../../hsm/src/index";

export class SelectiveDisclosureLedger {
  private readonly repo = new InMemoryOrderRepository();
  private readonly projector: ViewProjector;

  constructor(hsm?: HsmClient, signerKeyLabel?: string) {
    this.projector = new ViewProjector(this.repo, hsm, signerKeyLabel);
  }

  publishOrder(order: PurchaseOrder): void {
    this.repo.addOrder(order);
  }

  createView(orderId: string, audience: Audience): SharedOrderView {
    return this.projector.createView(orderId, audience);
  }
}
