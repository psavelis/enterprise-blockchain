import { InMemoryStore, CollectionStore } from "../../shared/index.js";
import type {
  ProductLot,
  Shipment,
  TelemetryReading,
} from "../domain/entities.js";
import type { TraceabilityStore } from "../domain/ports.js";

export class InMemoryTraceabilityStore implements TraceabilityStore {
  readonly lots = new InMemoryStore<string, ProductLot>();
  readonly shipments = new InMemoryStore<string, Shipment>();
  private readonly telemetry = new CollectionStore<string, TelemetryReading>();

  addLot(lot: ProductLot): void {
    this.lots.set(lot.id, lot);
  }

  addShipment(shipment: Shipment): void {
    if (!this.lots.has(shipment.lotId)) {
      throw new Error(`Unknown lot ${shipment.lotId}`);
    }
    this.shipments.set(shipment.id, shipment);
  }

  addTelemetry(reading: TelemetryReading): void {
    if (!this.shipments.has(reading.shipmentId)) {
      throw new Error(`Unknown shipment ${reading.shipmentId}`);
    }
    this.telemetry.append(reading.shipmentId, reading);
  }

  getTelemetry(shipmentId: string): readonly TelemetryReading[] {
    return this.telemetry.getAll(shipmentId);
  }
}
