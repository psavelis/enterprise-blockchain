import test from "node:test";
import assert from "node:assert/strict";

import { FabricGatewayClientSketch } from "../modules/integrations/fabric-gateway/src/index";
import { BesuEthersClientSketch } from "../modules/integrations/besu-client/src/index";
import { CordaGatewayClientSketch } from "../modules/integrations/corda-gateway/src/index";
import { SelectiveDisclosureLedger } from "../modules/privacy/src/index";

test("fabric gateway sketch builds shipment proposal plans with transient data", () => {
  const client = new FabricGatewayClientSketch();

  const plan = client.buildRecordShipmentProposal({
    lotId: "LOT-1",
    shipmentId: "SHIP-1",
    temperatureCelsius: 6.1,
    location: "Transit Hub",
    telemetryTimestamp: "2026-03-10T09:00:00Z",
    endorsingOrganizations: ["RetailerMSP", "CarrierMSP"],
  });

  assert.equal(plan.transactionName, "RecordShipment");
  assert.deepEqual(plan.endorsingOrganizations, ["RetailerMSP", "CarrierMSP"]);
  assert.equal(
    plan.transientData?.telemetryTimestamp instanceof Uint8Array,
    true,
  );
  assert.equal(plan.payloadDigestHex.length, 64);
});

test("besu ethers sketch encodes audience view transactions", () => {
  const client = new BesuEthersClientSketch();
  const ledger = new SelectiveDisclosureLedger();

  ledger.publishOrder({
    id: "PO-1",
    buyer: "Buyer",
    supplier: "Supplier",
    sku: "SKU-1",
    quantity: 20,
    unitPriceUsd: 10,
    incoterm: "FOB",
    destinationPort: "Rotterdam",
    financingBank: "Bank",
    sustainabilityGrade: "A",
  });

  const view = ledger.createView("PO-1", "regulator");
  const transaction = client.buildAudienceViewTransaction(
    {
      rpcUrl: "https://rpc.example.org",
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000001001",
      privacyGroupId: "regulator-group",
    },
    view,
  );

  assert.equal(transaction.privacyGroupId, "regulator-group");
  assert.equal(
    transaction.transaction.to,
    "0x0000000000000000000000000000000000001001",
  );
  assert.equal(typeof transaction.transaction.data, "string");
  assert.equal(
    client.createContract({
      rpcUrl: "https://rpc.example.org",
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000001001",
    }).target,
    "0x0000000000000000000000000000000000001001",
  );
});

test("besu audience view transactions require a privacy group", () => {
  const client = new BesuEthersClientSketch();
  const ledger = new SelectiveDisclosureLedger();

  ledger.publishOrder({
    id: "PO-2",
    buyer: "Buyer",
    supplier: "Supplier",
    sku: "SKU-2",
    quantity: 10,
    unitPriceUsd: 15,
    incoterm: "CIF",
    destinationPort: "Antwerp",
    sustainabilityGrade: "A",
  });

  const view = ledger.createView("PO-2", "bank");

  assert.throws(
    () =>
      client.buildAudienceViewTransaction(
        {
          rpcUrl: "https://rpc.example.org",
          chainId: 1337,
          contractAddress: "0x0000000000000000000000000000000000001001",
        },
        view,
      ),
    /privacyGroupId is required/,
  );
});

test("corda gateway sketch builds clearance flow requests", () => {
  const client = new CordaGatewayClientSketch();

  const request = client.buildIssueClearanceRequest(
    {
      baseUrl: "https://corda-gateway.example.org",
      network: "health-net",
      bearerToken: "test-token",
      timeoutMs: 10000,
    },
    {
      providerId: "PROV-1",
      facility: "Hospital",
      jurisdiction: "NL",
      scheduledAt: "2026-03-10T00:00:00Z",
      requiredCredentials: ["medical-license"],
      approved: true,
      reasons: [],
    },
  );

  assert.equal(request.method, "POST");
  assert.match(request.url, /IssueProviderClearanceFlow$/);
  assert.match(request.body, /ApproveClearance/);
  assert.equal(request.timeoutMs, 10000);
});

test("fabric gateway profile can be loaded from environment", () => {
  const client = new FabricGatewayClientSketch();
  const profile = client.createProfileFromEnv({
    FABRIC_MSP_ID: "RetailerMSP",
    FABRIC_CHANNEL_NAME: "food-trace",
    FABRIC_CHAINCODE_NAME: "food-trace-contract",
    FABRIC_PEER_ENDPOINT: "peer0.retailer.example.com:7051",
    FABRIC_TLS_CERT_PATH: "./tls.crt",
    FABRIC_IDENTITY_CERT_PATH: "./cert.pem",
    FABRIC_PRIVATE_KEY_PATH: "./key.pem",
  });

  assert.equal(profile.mspId, "RetailerMSP");
});

test("fabric recall request includes reason as transient data", () => {
  const client = new FabricGatewayClientSketch();
  const plan = client.buildEvaluateRecallRequest({
    lotId: "LOT-RECALL-1",
    reason: "Temperature excursion during transit.",
  });

  assert.equal(plan.transactionName, "TraceOrigin");
  assert.deepEqual(plan.args, ["LOT-RECALL-1"]);
  assert.equal(plan.transientData?.recallReason instanceof Uint8Array, true);
  assert.equal(plan.payloadDigestHex.length, 64);
});
