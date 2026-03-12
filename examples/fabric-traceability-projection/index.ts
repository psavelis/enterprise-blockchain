import { FabricTraceabilityAdapter } from "../../modules/protocols/fabric/src/index";

const adapter = new FabricTraceabilityAdapter();

const createLot = adapter.createLotCommand({
  id: "LOT-FAB-001",
  productName: "Fresh Mango",
  supplier: "Pacific Produce Alliance",
  originCountry: "MX",
  harvestDate: "2026-03-01",
  expirationDate: "2026-03-15",
});

const recordShipment = adapter.recordShipmentCommand(
  {
    id: "SHIP-FAB-001",
    lotId: "LOT-FAB-001",
    from: "Veracruz Export Hub",
    to: "Houston Inbound DC",
    departedAt: "2026-03-02T04:00:00Z",
  },
  {
    shipmentId: "SHIP-FAB-001",
    timestamp: "2026-03-02T10:00:00Z",
    temperatureCelsius: 5.9,
    location: "Monterrey",
  },
);

console.log("Fabric Traceability Projection");
console.log(JSON.stringify({ createLot, recordShipment }, null, 2));
