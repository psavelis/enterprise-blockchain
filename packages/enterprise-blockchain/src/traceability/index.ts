// Domain
export type { ProductLot, Shipment, TelemetryReading } from "./domain/entities";
export type { RecallRule, RecallAssessment } from "./domain/recall";
export type {
  TraceabilityRepository,
  TraceabilityWriter,
  TraceabilityStore,
} from "./domain/ports";

// Application
export { RecallAssessor } from "./application/recall-assessor";

// Infrastructure
export { InMemoryTraceabilityStore } from "./infrastructure/in-memory-store";

// ---------------------------------------------------------------------------
// Facade — preserves the original public API so existing consumers,
// examples, and tests continue to work without import changes.
// ---------------------------------------------------------------------------

import type { ProductLot, Shipment, TelemetryReading } from "./domain/entities";
import type { RecallRule, RecallAssessment } from "./domain/recall";
import type { TraceabilityStore } from "./domain/ports";
import type { Logger } from "../shared/logger.js";
import { InMemoryTraceabilityStore } from "./infrastructure/in-memory-store";
import { RecallAssessor } from "./application/recall-assessor";

export class TraceabilityLedger {
  private readonly store: TraceabilityStore;
  private readonly logger: Logger | undefined;

  constructor(options?: { store?: TraceabilityStore; logger?: Logger }) {
    this.store = options?.store ?? new InMemoryTraceabilityStore();
    this.logger = options?.logger;
  }

  registerLot(lot: ProductLot): void {
    this.store.addLot(lot);
  }

  dispatchShipment(shipment: Shipment): void {
    this.store.addShipment(shipment);
  }

  recordTelemetry(reading: TelemetryReading): void {
    this.store.addTelemetry(reading);
  }

  assessRecall(rule: RecallRule): RecallAssessment {
    return new RecallAssessor(this.store, this.logger).assess(rule);
  }
}
