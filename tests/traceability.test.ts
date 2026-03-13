import test from "node:test";
import assert from "node:assert/strict";

import { TraceabilityLedger } from "../modules/traceability/src/index";

test("dispatchShipment rejects an unknown lot reference", () => {
  const ledger = new TraceabilityLedger();
  assert.throws(
    () =>
      ledger.dispatchShipment({
        id: "SHIP-X",
        lotId: "NONEXISTENT-LOT",
        from: "A",
        to: "B",
        departedAt: "2026-01-01T00:00:00Z",
      }),
    /unknown lot/i,
  );
});

test("traceability ledger identifies supplier and telemetry recall impact", () => {
  const ledger = new TraceabilityLedger();

  ledger.registerLot({
    id: "LOT-1",
    productName: "Leafy Greens",
    supplier: "Supplier A",
    originCountry: "ES",
    harvestDate: "2026-02-01",
    expirationDate: "2026-02-10",
  });

  ledger.registerLot({
    id: "LOT-2",
    productName: "Leafy Greens",
    supplier: "Supplier B",
    originCountry: "PT",
    harvestDate: "2026-02-01",
    expirationDate: "2026-02-10",
  });

  ledger.dispatchShipment({
    id: "SHIP-1",
    lotId: "LOT-1",
    from: "Origin",
    to: "DC-1",
    departedAt: "2026-02-02T00:00:00Z",
  });

  ledger.dispatchShipment({
    id: "SHIP-2",
    lotId: "LOT-2",
    from: "Origin",
    to: "DC-2",
    departedAt: "2026-02-02T00:00:00Z",
  });

  ledger.recordTelemetry({
    shipmentId: "SHIP-2",
    timestamp: "2026-02-02T03:00:00Z",
    temperatureCelsius: 8,
    location: "Transit Hub",
  });

  const assessment = ledger.assessRecall({
    suspectSuppliers: ["Supplier A"],
    flaggedLotIds: [],
    maxTemperatureCelsius: 5,
  });

  assert.deepEqual(assessment.impactedLotIds, ["LOT-1", "LOT-2"]);
  assert.deepEqual(assessment.impactedShipmentIds, ["SHIP-1", "SHIP-2"]);
  assert.deepEqual(assessment.impactedDestinations, ["DC-1", "DC-2"]);
});

test("assessRecall includes earlier shipments when a later shipment breaches temperature", () => {
  const ledger = new TraceabilityLedger();

  ledger.registerLot({
    id: "LOT-A",
    productName: "Frozen Berries",
    supplier: "Supplier X",
    originCountry: "SE",
    harvestDate: "2026-02-01",
    expirationDate: "2026-08-01",
  });

  ledger.dispatchShipment({
    id: "SHIP-EARLY",
    lotId: "LOT-A",
    from: "Stockholm",
    to: "Berlin DC",
    departedAt: "2026-02-02T00:00:00Z",
  });

  ledger.dispatchShipment({
    id: "SHIP-LATE",
    lotId: "LOT-A",
    from: "Stockholm",
    to: "Hamburg DC",
    departedAt: "2026-02-03T00:00:00Z",
  });

  ledger.recordTelemetry({
    shipmentId: "SHIP-LATE",
    timestamp: "2026-02-03T06:00:00Z",
    temperatureCelsius: 9,
    location: "Malmo",
  });

  const assessment = ledger.assessRecall({
    suspectSuppliers: [],
    flaggedLotIds: [],
    maxTemperatureCelsius: 5,
  });

  assert.deepEqual(assessment.impactedLotIds, ["LOT-A"]);
  assert.deepEqual(assessment.impactedShipmentIds.sort(), [
    "SHIP-EARLY",
    "SHIP-LATE",
  ]);
  assert.deepEqual(assessment.impactedDestinations.sort(), [
    "Berlin DC",
    "Hamburg DC",
  ]);
});
