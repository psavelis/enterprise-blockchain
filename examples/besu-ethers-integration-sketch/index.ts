import { BesuEthersClientSketch } from "../../modules/integrations/besu-client/src/index";
import { SelectiveDisclosureLedger } from "../../modules/privacy/src/index";

const client = new BesuEthersClientSketch();
const ledger = new SelectiveDisclosureLedger();

ledger.publishOrder({
  id: "PO-ETHERS-001",
  buyer: "Aster Logistics",
  supplier: "BioSensor Works",
  sku: "THERMAL-SENSOR-8",
  quantity: 120,
  unitPriceUsd: 120,
  incoterm: "CIF",
  destinationPort: "Rotterdam",
  financingBank: "Trade Capital NV",
  sustainabilityGrade: "A",
});

const bankView = ledger.createView("PO-ETHERS-001", "bank");
const profile = client.createProfile({
  rpcUrl: "https://besu-consortium.example.org",
  chainId: 1337,
  contractAddress: "0x0000000000000000000000000000000000001001",
  privacyGroupId: "bank-review-group",
});

const privateTransaction = client.buildAudienceViewTransaction(
  profile,
  bankView,
);

console.log("Besu Ethers Integration Sketch");
console.log(JSON.stringify({ profile, privateTransaction }, null, 2));
