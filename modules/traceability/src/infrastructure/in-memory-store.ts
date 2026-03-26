import { InMemoryStore } from "../../../shared/src/store";
import type {
  ProductLot,
  Shipment,
  TelemetryReading,
} from "../domain/entities";
import type { TraceabilityStore } from "../domain/ports";

export class InMemoryTraceabilityStore implements TraceabilityStore {
  readonly lots = new InMemoryStore<string, ProductLot>();
  readonly shipments = new InMemoryStore<string, Shipment>();
  private readonly telemetry = new InMemoryStore<string, TelemetryReading[]>();

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
    const readings = this.telemetry.get(reading.shipmentId) ?? [];
    readings.push(reading);
    this.telemetry.set(reading.shipmentId, readings);
  }

  getTelemetry(shipmentId: string): readonly TelemetryReading[] {
    return this.telemetry.get(shipmentId) ?? [];
  }
}
