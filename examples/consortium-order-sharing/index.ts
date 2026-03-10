import { SelectiveDisclosureLedger } from "../../modules/privacy/src/index";

const ledger = new SelectiveDisclosureLedger();

ledger.publishOrder({
  id: "PO-44018",
  buyer: "Aquila Retail Group",
  supplier: "North Sea Textiles",
  sku: "ORGANIC-COTTON-ROLL-32",
  quantity: 800,
  unitPriceUsd: 42,
  incoterm: "FOB",
  destinationPort: "Rotterdam",
  financingBank: "ING Trade Finance",
  sustainabilityGrade: "A",
});

const audiences = ["logistics", "bank", "regulator", "supplier"] as const;

console.log("Consortium Order Sharing");
for (const audience of audiences) {
  const view = ledger.createView("PO-44018", audience);
  console.log(`\n${audience.toUpperCase()} VIEW`);
  console.log(JSON.stringify(view, null, 2));
}