import { SelectiveDisclosureLedger } from "../../modules/privacy/src/index";
import { BesuSelectiveDisclosureAdapter } from "../../modules/protocols/besu/src/index";

const ledger = new SelectiveDisclosureLedger();
const adapter = new BesuSelectiveDisclosureAdapter();

ledger.publishOrder({
  id: "PO-BESU-001",
  buyer: "Continental Retail Group",
  supplier: "Helios Components",
  sku: "MED-SENSOR-09",
  quantity: 500,
  unitPriceUsd: 72,
  incoterm: "DAP",
  destinationPort: "Antwerp",
  financingBank: "Euro Trade Bank",
  sustainabilityGrade: "B",
});

const regulatorView = ledger.createView("PO-BESU-001", "regulator");

console.log("Besu Order Privacy Projection");
console.log(
  JSON.stringify(
    {
      anchorOrder: adapter.anchorOrder(
        {
          id: "PO-BESU-001",
          buyer: "Continental Retail Group",
          supplier: "Helios Components",
          sku: "MED-SENSOR-09",
          quantity: 500,
          unitPriceUsd: 72,
          incoterm: "DAP",
          destinationPort: "Antwerp",
          financingBank: "Euro Trade Bank",
          sustainabilityGrade: "B",
        },
        regulatorView.auditProof,
      ),
      publishRegulatorView: adapter.publishAudienceView(regulatorView),
    },
    null,
    2,
  ),
);
