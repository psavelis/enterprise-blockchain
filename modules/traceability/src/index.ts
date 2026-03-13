export interface ProductLot {
  id: string;
  productName: string;
  supplier: string;
  originCountry: string;
  harvestDate: string;
  expirationDate: string;
}

export interface Shipment {
  id: string;
  lotId: string;
  from: string;
  to: string;
  departedAt: string;
  receivedAt?: string;
}

export interface TelemetryReading {
  shipmentId: string;
  timestamp: string;
  temperatureCelsius: number;
  location: string;
}

export interface RecallRule {
  suspectSuppliers: string[];
  flaggedLotIds: string[];
  maxTemperatureCelsius: number;
}

export interface RecallAssessment {
  impactedLotIds: string[];
  impactedShipmentIds: string[];
  impactedDestinations: string[];
  reasons: string[];
}

export class TraceabilityLedger {
  private readonly lots = new Map<string, ProductLot>();
  private readonly shipments = new Map<string, Shipment>();
  private readonly telemetry = new Map<string, TelemetryReading[]>();

  registerLot(lot: ProductLot): void {
    this.lots.set(lot.id, lot);
  }

  dispatchShipment(shipment: Shipment): void {
    if (!this.lots.has(shipment.lotId)) {
      throw new Error(`Unknown lot ${shipment.lotId}`);
    }

    this.shipments.set(shipment.id, shipment);
  }

  recordTelemetry(reading: TelemetryReading): void {
    if (!this.shipments.has(reading.shipmentId)) {
      throw new Error(`Unknown shipment ${reading.shipmentId}`);
    }
    const readings = this.telemetry.get(reading.shipmentId) ?? [];
    readings.push(reading);
    this.telemetry.set(reading.shipmentId, readings);
  }

  assessRecall(rule: RecallRule): RecallAssessment {
    const impactedLotIds = new Set<string>();
    const impactedShipmentIds = new Set<string>();
    const impactedDestinations = new Set<string>();
    const reasons = new Set<string>();

    for (const lot of this.lots.values()) {
      if (rule.flaggedLotIds.includes(lot.id)) {
        impactedLotIds.add(lot.id);
        reasons.add(
          `Lot ${lot.id} was explicitly flagged by quality assurance.`,
        );
      }

      if (rule.suspectSuppliers.includes(lot.supplier)) {
        impactedLotIds.add(lot.id);
        reasons.add(`Supplier ${lot.supplier} was placed under investigation.`);
      }
    }

    for (const shipment of this.shipments.values()) {
      const readings = this.telemetry.get(shipment.id) ?? [];
      const breached = readings.some(
        (reading) => reading.temperatureCelsius > rule.maxTemperatureCelsius,
      );

      if (breached) {
        impactedLotIds.add(shipment.lotId);
        impactedShipmentIds.add(shipment.id);
        impactedDestinations.add(shipment.to);
        reasons.add(
          `Shipment ${shipment.id} exceeded ${rule.maxTemperatureCelsius}C cold-chain limits.`,
        );
      }
    }

    for (const shipment of this.shipments.values()) {
      if (impactedLotIds.has(shipment.lotId)) {
        impactedShipmentIds.add(shipment.id);
        impactedDestinations.add(shipment.to);
      }
    }

    return {
      impactedLotIds: [...impactedLotIds].sort(),
      impactedShipmentIds: [...impactedShipmentIds].sort(),
      impactedDestinations: [...impactedDestinations].sort(),
      reasons: [...reasons],
    };
  }
}
