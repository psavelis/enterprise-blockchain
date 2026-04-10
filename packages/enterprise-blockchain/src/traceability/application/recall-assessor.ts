import type { RecallAssessment, RecallRule } from "../domain/recall.js";
import type { TraceabilityRepository } from "../domain/ports.js";
import type { Logger } from "../../shared/logger.js";
import { noopLogger } from "../../shared/logger.js";

export class RecallAssessor {
  private readonly logger: Logger;

  constructor(
    private readonly repo: TraceabilityRepository,
    logger?: Logger,
  ) {
    this.logger = logger ?? noopLogger;
  }

  assess(rule: RecallRule): RecallAssessment {
    const start = Date.now();
    this.logger.info("assessment started", {
      operation: "RecallAssessor.assess",
      flaggedLotCount: rule.flaggedLotIds.length,
      flaggedLotIdsCsv: rule.flaggedLotIds.join(","),
    });

    const lotIds = new Set<string>();
    const shipmentIds = new Set<string>();
    const destinations = new Set<string>();
    const reasons = new Set<string>();

    this.flagLots(rule, lotIds, reasons);
    this.flagBreachedShipments(
      rule,
      lotIds,
      shipmentIds,
      destinations,
      reasons,
    );
    this.propagateImpact(lotIds, shipmentIds, destinations);

    const result: RecallAssessment = {
      impactedLotIds: [...lotIds].sort(),
      impactedShipmentIds: [...shipmentIds].sort(),
      impactedDestinations: [...destinations].sort(),
      reasons: [...reasons],
    };

    this.logger.info("assessment completed", {
      operation: "RecallAssessor.assess",
      flaggedLotCount: rule.flaggedLotIds.length,
      flaggedLotIdsCsv: rule.flaggedLotIds.join(","),
      result: result.impactedLotIds.length > 0 ? "impacted" : "safe",
      durationMs: Date.now() - start,
      impactedLots: result.impactedLotIds.length,
    });

    return result;
  }

  private flagLots(
    rule: RecallRule,
    lotIds: Set<string>,
    reasons: Set<string>,
  ): void {
    for (const lot of this.repo.lots.values()) {
      if (rule.flaggedLotIds.includes(lot.id)) {
        lotIds.add(lot.id);
        reasons.add(
          `Lot ${lot.id} was explicitly flagged by quality assurance.`,
        );
      }
      if (rule.suspectSuppliers.includes(lot.supplier)) {
        lotIds.add(lot.id);
        reasons.add(`Supplier ${lot.supplier} was placed under investigation.`);
      }
    }
  }

  private flagBreachedShipments(
    rule: RecallRule,
    lotIds: Set<string>,
    shipmentIds: Set<string>,
    destinations: Set<string>,
    reasons: Set<string>,
  ): void {
    for (const shipment of this.repo.shipments.values()) {
      const readings = this.repo.getTelemetry(shipment.id);
      const breached = readings.some(
        (r) => r.temperatureCelsius > rule.maxTemperatureCelsius,
      );

      if (breached) {
        lotIds.add(shipment.lotId);
        shipmentIds.add(shipment.id);
        destinations.add(shipment.to);
        reasons.add(
          `Shipment ${shipment.id} exceeded ${rule.maxTemperatureCelsius}C cold-chain limits.`,
        );
      }
    }
  }

  private propagateImpact(
    lotIds: Set<string>,
    shipmentIds: Set<string>,
    destinations: Set<string>,
  ): void {
    for (const shipment of this.repo.shipments.values()) {
      if (lotIds.has(shipment.lotId)) {
        shipmentIds.add(shipment.id);
        destinations.add(shipment.to);
      }
    }
  }
}
