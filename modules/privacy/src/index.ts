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
import type { OrderRepository } from "./domain/ports";
import { InMemoryOrderRepository } from "./infrastructure/in-memory-store";
import { ViewProjector } from "./application/view-projector";
import type { HsmClient } from "../../hsm/src/index";
import type { Logger } from "../../shared/src/logger";

export class SelectiveDisclosureLedger {
  private readonly repo: OrderRepository;
  private readonly projector: ViewProjector;

  constructor(options?: {
    repo?: OrderRepository;
    hsm?: HsmClient;
    signerKeyLabel?: string;
    logger?: Logger;
  }) {
    const hsm = options?.hsm;
    const signerKeyLabel = options?.signerKeyLabel;
    if ((hsm && !signerKeyLabel) || (!hsm && signerKeyLabel)) {
      throw new Error(
        "Both hsm and signerKeyLabel must be provided together for signed audit proofs",
      );
    }
    this.repo = options?.repo ?? new InMemoryOrderRepository();
    this.projector = new ViewProjector(
      this.repo,
      options?.logger,
      hsm,
      signerKeyLabel,
    );
  }

  publishOrder(order: PurchaseOrder): void {
    this.repo.addOrder(order);
  }

  createView(orderId: string, audience: Audience): SharedOrderView {
    return this.projector.createView(orderId, audience);
  }
}
