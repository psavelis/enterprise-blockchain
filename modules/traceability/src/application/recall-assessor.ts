import type { RecallAssessment, RecallRule } from "../domain/recall";
import type { TraceabilityRepository } from "../domain/ports";

export class RecallAssessor {
  constructor(private readonly repo: TraceabilityRepository) {}

  assess(rule: RecallRule): RecallAssessment {
    const impactedLotIds = new Set<string>();
    const impactedShipmentIds = new Set<string>();
    const impactedDestinations = new Set<string>();
    const reasons = new Set<string>();

    this.flagLots(rule, impactedLotIds, reasons);
    this.flagBreachedShipments(
      rule,
      impactedLotIds,
      impactedShipmentIds,
      impactedDestinations,
      reasons,
    );
    this.propagateImpact(
      impactedLotIds,
      impactedShipmentIds,
      impactedDestinations,
    );

    return {
      impactedLotIds: [...impactedLotIds].sort(),
      impactedShipmentIds: [...impactedShipmentIds].sort(),
      impactedDestinations: [...impactedDestinations].sort(),
      reasons: [...reasons],
    };
  }

  private flagLots(
    rule: RecallRule,
    impactedLotIds: Set<string>,
    reasons: Set<string>,
  ): void {
    for (const lot of this.repo.lots.values()) {
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
  }

  private flagBreachedShipments(
    rule: RecallRule,
    impactedLotIds: Set<string>,
    impactedShipmentIds: Set<string>,
    impactedDestinations: Set<string>,
    reasons: Set<string>,
  ): void {
    for (const shipment of this.repo.shipments.values()) {
      const readings = this.repo.getTelemetry(shipment.id);
      const breached = readings.some(
        (r) => r.temperatureCelsius > rule.maxTemperatureCelsius,
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
  }

  private propagateImpact(
    impactedLotIds: Set<string>,
    impactedShipmentIds: Set<string>,
    impactedDestinations: Set<string>,
  ): void {
    for (const shipment of this.repo.shipments.values()) {
      if (impactedLotIds.has(shipment.lotId)) {
        impactedShipmentIds.add(shipment.id);
        impactedDestinations.add(shipment.to);
      }
    }
  }
}
