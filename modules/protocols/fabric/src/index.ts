import type {
  ProductLot,
  Shipment,
  TelemetryReading,
} from "../../../traceability/src/domain/entities";
import type { TraceabilityProtocolAdapter } from "../../src/traceability-port";

export interface FabricInvocation {
  contract: string;
  transaction: string;
  args: string[];
  transient?: Record<string, string>;
  endorsementPolicyHint: string;
}

export class FabricTraceabilityAdapter implements TraceabilityProtocolAdapter<FabricInvocation> {
  createLotCommand(lot: ProductLot): FabricInvocation {
    return {
      contract: "FoodTraceContract",
      transaction: "CreateProduct",
      args: [lot.id, lot.originCountry, lot.supplier, lot.harvestDate],
      endorsementPolicyHint: "AND('RetailerMSP.peer','SupplierMSP.peer')",
    };
  }

  recordShipmentCommand(
    shipment: Shipment,
    reading?: TelemetryReading,
  ): FabricInvocation {
    const invocation: FabricInvocation = {
      contract: "FoodTraceContract",
      transaction: "RecordShipment",
      args: [
        shipment.lotId,
        shipment.id,
        reading ? String(reading.temperatureCelsius) : "n/a",
        reading?.location ?? shipment.to,
      ],
      endorsementPolicyHint: "OR('CarrierMSP.peer','RetailerMSP.peer')",
    };

    if (reading) {
      invocation.transient = {
        telemetryTimestamp: reading.timestamp,
      };
    }

    return invocation;
  }
}
