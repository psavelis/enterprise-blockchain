import type { ReadonlyStore } from "../../shared/store";
import type { ProductLot, Shipment, TelemetryReading } from "./entities";

/**
 * Read-side port for traceability data.
 *
 * Domain services depend on this abstraction — infrastructure adapters
 * (in-memory, Fabric world state, SQL) implement it.
 */
export interface TraceabilityRepository {
  readonly lots: ReadonlyStore<string, ProductLot>;
  readonly shipments: ReadonlyStore<string, Shipment>;
  getTelemetry(shipmentId: string): readonly TelemetryReading[];
}

/**
 * Write-side port for traceability commands.
 */
export interface TraceabilityWriter {
  addLot(lot: ProductLot): void;
  addShipment(shipment: Shipment): void;
  addTelemetry(reading: TelemetryReading): void;
}

export type TraceabilityStore = TraceabilityRepository & TraceabilityWriter;
