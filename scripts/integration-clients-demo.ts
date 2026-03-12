import { FabricGatewayClientSketch } from "../modules/integrations/fabric-gateway/src/index";
import { BesuEthersClientSketch } from "../modules/integrations/besu-client/src/index";
import { CordaGatewayClientSketch } from "../modules/integrations/corda-gateway/src/index";
import { SelectiveDisclosureLedger } from "../modules/privacy/src/index";

const fabric = new FabricGatewayClientSketch();
const besu = new BesuEthersClientSketch();
const corda = new CordaGatewayClientSketch();
const privacy = new SelectiveDisclosureLedger();

privacy.publishOrder({
  id: "PO-INTEGRATION-001",
  buyer: "North Harbor Retail",
  supplier: "MedTech Components",
  sku: "SENSOR-300",
  quantity: 400,
  unitPriceUsd: 96,
  incoterm: "DAP",
  destinationPort: "Rotterdam",
  financingBank: "Trade Finance Bank",
  sustainabilityGrade: "A",
});

const regulatorView = privacy.createView("PO-INTEGRATION-001", "regulator");

console.log("Integration Client Demo");
console.log("\nFABRIC GATEWAY PLAN");
console.log(
  JSON.stringify(
    {
      profile: fabric.createProfile({
        mspId: "RetailerMSP",
        channelName: "food-trace",
        chaincodeName: "food-trace-contract",
        peerEndpoint: "peer0.retailer.example.com:7051",
        tlsCertPath: "./crypto/peer/tls/ca.crt",
        identityCertPath: "./crypto/user/signcerts/cert.pem",
        privateKeyPath: "./crypto/user/keystore/key.pem",
      }),
      proposal: fabric.buildRecordShipmentProposal({
        lotId: "LOT-INTEGRATION-001",
        shipmentId: "SHIP-INTEGRATION-001",
        temperatureCelsius: 6.2,
        location: "Cologne",
        telemetryTimestamp: "2026-03-10T09:00:00Z",
        endorsingOrganizations: ["RetailerMSP", "CarrierMSP"],
      }),
    },
    null,
    2,
  ),
);

console.log("\nBESU ETHERS PLAN");
console.log(
  JSON.stringify(
    {
      profile: besu.createProfile({
        rpcUrl: "https://besu-consortium.example.org",
        chainId: 1337,
        contractAddress: "0x0000000000000000000000000000000000001001",
        privacyGroupId: "regulator-review-group",
      }),
      privateTransaction: besu.buildAudienceViewTransaction(
        {
          rpcUrl: "https://besu-consortium.example.org",
          chainId: 1337,
          contractAddress: "0x0000000000000000000000000000000000001001",
          privacyGroupId: "regulator-review-group",
        },
        regulatorView,
      ),
    },
    null,
    2,
  ),
);

console.log("\nCORDA GATEWAY PLAN");
console.log(
  JSON.stringify(
    corda.buildIssueClearanceRequest(
      {
        baseUrl: "https://corda-gateway.example.org",
        network: "health-net",
        bearerToken: "demo-token",
        timeoutMs: 10000,
      },
      {
        providerId: "PROV-INTEGRATION-001",
        facility: "Rotterdam Surgical Centre",
        jurisdiction: "NL",
        scheduledAt: "2026-05-15T07:30:00Z",
        requiredCredentials: ["medical-license", "sedation-privilege"],
        approved: false,
        reasons: ["Missing sedation-privilege credential for jurisdiction NL."],
      },
    ),
    null,
    2,
  ),
);
