import test from "node:test";
import assert from "node:assert/strict";

import { FabricGatewayClientSketch } from "../modules/integrations/fabric-gateway/src/index";
import { BesuEthersClientSketch } from "../modules/integrations/besu-client/src/index";
import { CordaGatewayClientSketch } from "../modules/integrations/corda-gateway/src/index";
import { SelectiveDisclosureLedger } from "../modules/privacy/src/index";

/**
 * Test-only wallet private key. This is an intentionally fake key used
 * exclusively for unit testing. It has no value and is not used in any
 * production or testnet environment.
 *
 * Pattern: sequential hex digits repeated to fill 32 bytes.
 * DO NOT use this key for any real transactions.
 */
// snyk:ignore[HardcodedNonCryptoSecret] - Intentional test fixture
const TEST_WALLET_PRIVATE_KEY =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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

// ── Besu gas estimation and nonce management ────────────────────────

test("buildAnchorOrderTransaction includes gasLimit when provided", () => {
  const client = new BesuEthersClientSketch();
  const profile = {
    rpcUrl: "https://rpc.example.org",
    chainId: 1337,
    contractAddress: "0x0000000000000000000000000000000000001001",
  };

  const tx = client.buildAnchorOrderTransaction(
    profile,
    {
      id: "PO-GAS-1",
      buyer: "Buyer",
      supplier: "Supplier",
      sku: "SKU-1",
      quantity: 10,
      unitPriceUsd: 5,
      incoterm: "FOB",
      destinationPort: "Rotterdam",
      sustainabilityGrade: "A",
    },
    "abcd1234",
    200_000n,
  );

  assert.equal(tx.gasLimit, 200_000n);
  assert.equal(tx.to, profile.contractAddress);
});

test("buildAnchorOrderTransaction omits gasLimit when not provided", () => {
  const client = new BesuEthersClientSketch();
  const profile = {
    rpcUrl: "https://rpc.example.org",
    chainId: 1337,
    contractAddress: "0x0000000000000000000000000000000000001001",
  };

  const tx = client.buildAnchorOrderTransaction(
    profile,
    {
      id: "PO-GAS-2",
      buyer: "Buyer",
      supplier: "Supplier",
      sku: "SKU-2",
      quantity: 10,
      unitPriceUsd: 5,
      incoterm: "FOB",
      destinationPort: "Rotterdam",
      sustainabilityGrade: "A",
    },
    "abcd1234",
  );

  assert.equal(tx.gasLimit, undefined);
});

test("buildAudienceViewTransaction includes gasLimit when provided", () => {
  const client = new BesuEthersClientSketch();
  const ledger = new SelectiveDisclosureLedger();
  ledger.publishOrder({
    id: "PO-GAS-3",
    buyer: "Buyer",
    supplier: "Supplier",
    sku: "SKU-3",
    quantity: 10,
    unitPriceUsd: 5,
    incoterm: "FOB",
    destinationPort: "Rotterdam",
    sustainabilityGrade: "A",
  });

  const view = ledger.createView("PO-GAS-3", "bank");
  const result = client.buildAudienceViewTransaction(
    {
      rpcUrl: "https://rpc.example.org",
      chainId: 1337,
      contractAddress: "0x0000000000000000000000000000000000001001",
      privacyGroupId: "bank-group",
    },
    view,
    150_000n,
  );

  assert.equal(result.transaction.gasLimit, 150_000n);
});

test("estimateGas returns override when provided", async () => {
  const client = new BesuEthersClientSketch();
  const profile = {
    rpcUrl: "https://rpc.example.org",
    chainId: 1337,
    contractAddress: "0x0000000000000000000000000000000000001001",
  };

  const estimate = await client.estimateGas(
    profile,
    { to: profile.contractAddress },
    300_000n,
  );
  assert.equal(estimate, 300_000n);
});

test("createManagedSigner returns a NonceManager instance", () => {
  const client = new BesuEthersClientSketch();
  const profile = {
    rpcUrl: "https://rpc.example.org",
    chainId: 1337,
    contractAddress: "0x0000000000000000000000000000000000001001",
    walletPrivateKey: TEST_WALLET_PRIVATE_KEY,
  };

  const signer = client.createManagedSigner(profile);
  assert.equal(typeof signer.sendTransaction, "function");
  assert.equal(typeof signer.reset, "function");
});

test("estimateGas propagates insufficient-funds errors from provider", async () => {
  const client = new BesuEthersClientSketch();
  const profile = {
    rpcUrl: "https://rpc.example.org",
    chainId: 1337,
    contractAddress: "0x0000000000000000000000000000000000001001",
  };

  const insufficientErr: Error & { code?: string } = new Error(
    "insufficient funds for gas * price + value",
  );
  insufficientErr.code = "INSUFFICIENT_FUNDS";

  // Stub createProvider to return a fake provider that throws
  (client as unknown as { createProvider: () => unknown }).createProvider =
    () => ({
      estimateGas(): Promise<never> {
        return Promise.reject(insufficientErr);
      },
    });

  await assert.rejects(
    () => client.estimateGas(profile, { to: profile.contractAddress }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.toLowerCase().includes("insufficient"));
      return true;
    },
  );
});

test("sendTransaction surfaces NONCE_TOO_LOW with actionable guidance", async () => {
  const client = new BesuEthersClientSketch();
  const profile = {
    rpcUrl: "https://rpc.example.org",
    chainId: 1337,
    contractAddress: "0x0000000000000000000000000000000000001001",
    walletPrivateKey: TEST_WALLET_PRIVATE_KEY,
  };

  const besuErr: Error & { code?: string } = new Error("nonce too low");
  besuErr.code = "NONCE_TOO_LOW";

  const fakeSigner = client.createManagedSigner(profile);
  // Override sendTransaction on the signer instance
  fakeSigner.sendTransaction = () => Promise.reject(besuErr);

  await assert.rejects(
    () => client.sendTransaction(fakeSigner, { to: profile.contractAddress }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("NONCE_TOO_LOW"));
      return true;
    },
  );
});

test("sendTransaction surfaces INSUFFICIENT_FUNDS with actionable guidance", async () => {
  const client = new BesuEthersClientSketch();
  const profile = {
    rpcUrl: "https://rpc.example.org",
    chainId: 1337,
    contractAddress: "0x0000000000000000000000000000000000001001",
    walletPrivateKey: TEST_WALLET_PRIVATE_KEY,
  };

  const besuErr: Error & { code?: string } = new Error("insufficient funds");
  besuErr.code = "INSUFFICIENT_FUNDS";

  const fakeSigner = client.createManagedSigner(profile);
  fakeSigner.sendTransaction = () => Promise.reject(besuErr);

  await assert.rejects(
    () => client.sendTransaction(fakeSigner, { to: profile.contractAddress }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("INSUFFICIENT_FUNDS"));
      return true;
    },
  );
});
