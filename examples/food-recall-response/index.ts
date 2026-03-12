import { TraceabilityLedger } from "../../modules/traceability/src/index";

const ledger = new TraceabilityLedger();

ledger.registerLot({
  id: "LOT-SPINACH-001",
  productName: "Baby Spinach",
  supplier: "Green Valley Farms",
  originCountry: "ES",
  harvestDate: "2026-02-17",
  expirationDate: "2026-02-27",
});

ledger.registerLot({
  id: "LOT-SPINACH-002",
  productName: "Baby Spinach",
  supplier: "North Ridge Produce",
  originCountry: "PT",
  harvestDate: "2026-02-18",
  expirationDate: "2026-02-28",
});

ledger.dispatchShipment({
  id: "SHIP-101",
  lotId: "LOT-SPINACH-001",
  from: "Madrid Consolidation Hub",
  to: "Rotterdam DC",
  departedAt: "2026-02-19T04:00:00Z",
});

ledger.dispatchShipment({
  id: "SHIP-102",
  lotId: "LOT-SPINACH-002",
  from: "Porto Consolidation Hub",
  to: "Hamburg DC",
  departedAt: "2026-02-19T06:30:00Z",
});

ledger.recordTelemetry({
  shipmentId: "SHIP-101",
  timestamp: "2026-02-19T08:00:00Z",
  temperatureCelsius: 7.9,
  location: "Bayonne",
});

ledger.recordTelemetry({
  shipmentId: "SHIP-102",
  timestamp: "2026-02-19T09:15:00Z",
  temperatureCelsius: 3.8,
  location: "Salamanca",
});

const assessment = ledger.assessRecall({
  suspectSuppliers: ["Green Valley Farms"],
  flaggedLotIds: [],
  maxTemperatureCelsius: 5,
});

console.log("Food Recall Response");
console.log(JSON.stringify(assessment, null, 2));
