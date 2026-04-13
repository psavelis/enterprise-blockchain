import type {
  ProductLot,
  Shipment,
  TelemetryReading,
} from "../traceability/domain/entities.js";

/**
 * Port for projecting traceability commands onto a distributed ledger.
 *
 * Implementations translate domain operations into platform-specific
 * invocations (Fabric chaincode, Besu contract calls, etc.).
 */
export interface TraceabilityProtocolAdapter<TInvocation> {
  createLotCommand(lot: ProductLot): TInvocation;
  recordShipmentCommand(
    shipment: Shipment,
    reading?: TelemetryReading,
  ): TInvocation;
}
