import { TraceabilityLedger } from "../modules/traceability/src/index";
import { SelectiveDisclosureLedger } from "../modules/privacy/src/index";
import { CredentialRegistry } from "../modules/credentialing/src/index";
import { FabricTraceabilityAdapter } from "../modules/protocols/fabric/src/index";
import { BesuSelectiveDisclosureAdapter } from "../modules/protocols/besu/src/index";
import { CordaCredentialingAdapter } from "../modules/protocols/corda/src/index";

const traceability = new TraceabilityLedger();
const fabric = new FabricTraceabilityAdapter();

traceability.registerLot({
  id: "LOT-DEMO-001",
  productName: "Frozen Berries",
  supplier: "Nordic Farms Cooperative",
  originCountry: "SE",
  harvestDate: "2026-02-02",
  expirationDate: "2026-08-02",
});

const shipment = {
  id: "SHIP-DEMO-001",
  lotId: "LOT-DEMO-001",
  from: "Stockholm Cold Hub",
  to: "Berlin Retail DC",
  departedAt: "2026-02-04T08:00:00Z",
};

const telemetry = {
  shipmentId: shipment.id,
  timestamp: "2026-02-04T12:15:00Z",
  temperatureCelsius: 6.4,
  location: "Malmo",
};

const privacy = new SelectiveDisclosureLedger();
const besu = new BesuSelectiveDisclosureAdapter();

privacy.publishOrder({
  id: "PO-DEMO-100",
  buyer: "Harbor Retail",
  supplier: "Blue River Manufacturing",
  sku: "BIO-POLYMER-22",
  quantity: 1200,
  unitPriceUsd: 18,
  incoterm: "CIF",
  destinationPort: "Antwerp",
  financingBank: "Trade Capital NV",
  sustainabilityGrade: "A",
});

const bankView = privacy.createView("PO-DEMO-100", "bank");

const credentialing = new CredentialRegistry();
const corda = new CordaCredentialingAdapter();

credentialing.registerProvider({
  id: "PROV-DEMO-001",
  name: "Dr. Sofia Lindholm",
  specialties: ["Anesthesiology"],
  sanctionStatus: "clear",
});

credentialing.issueCredential({
  id: "LIC-DEMO-001",
  providerId: "PROV-DEMO-001",
  type: "medical-license",
  jurisdictions: ["NL"],
  validUntil: "2027-04-01",
});

credentialing.issueCredential({
  id: "SED-DEMO-001",
  providerId: "PROV-DEMO-001",
  type: "sedation-privilege",
  jurisdictions: ["NL"],
  validUntil: "2026-12-01",
});

const staffingAssignment = {
  providerId: "PROV-DEMO-001",
  facility: "Rotterdam Surgical Centre",
  jurisdiction: "NL",
  requiredCredentials: ["medical-license", "sedation-privilege"],
  procedure: "Outpatient Sedation Block",
  scheduledAt: "2026-05-10T08:00:00Z",
};

const clearance = credentialing.evaluateAssignment(staffingAssignment);

console.log("Adapter Projection Demo");
console.log("\nFABRIC");
console.log(
  JSON.stringify(
    {
      createLot: fabric.createLotCommand({
        id: "LOT-DEMO-001",
        productName: "Frozen Berries",
        supplier: "Nordic Farms Cooperative",
        originCountry: "SE",
        harvestDate: "2026-02-02",
        expirationDate: "2026-08-02",
      }),
      recordShipment: fabric.recordShipmentCommand(shipment, telemetry),
    },
    null,
    2,
  ),
);

console.log("\nBESU");
console.log(
  JSON.stringify(
    {
      anchorOrder: besu.anchorOrder(
        {
          id: "PO-DEMO-100",
          buyer: "Harbor Retail",
          supplier: "Blue River Manufacturing",
          sku: "BIO-POLYMER-22",
          quantity: 1200,
          unitPriceUsd: 18,
          incoterm: "CIF",
          destinationPort: "Antwerp",
          financingBank: "Trade Capital NV",
          sustainabilityGrade: "A",
        },
        typeof bankView.auditProof === "string"
          ? bankView.auditProof
          : bankView.auditProof.hash,
      ),
      publishBankView: besu.publishAudienceView(bankView),
    },
    null,
    2,
  ),
);

console.log("\nCORDA");
console.log(
  JSON.stringify(
    corda.buildAssignmentClearanceFlow(staffingAssignment, {
      approved: clearance.approved,
      reasons: clearance.reasons,
    }),
    null,
    2,
  ),
);
