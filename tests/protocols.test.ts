import test from "node:test";
import assert from "node:assert/strict";

import { FabricTraceabilityAdapter } from "../modules/protocols/fabric/src/index";
import { BesuSelectiveDisclosureAdapter } from "../modules/protocols/besu/src/index";
import { CordaCredentialingAdapter } from "../modules/protocols/corda/src/index";

test("fabric adapter emits chaincode-style invocations", () => {
  const adapter = new FabricTraceabilityAdapter();

  const invocation = adapter.createLotCommand({
    id: "LOT-1",
    productName: "Spinach",
    supplier: "Supplier A",
    originCountry: "ES",
    harvestDate: "2026-02-01",
    expirationDate: "2026-02-09",
  });

  assert.equal(invocation.contract, "FoodTraceContract");
  assert.equal(invocation.transaction, "CreateProduct");
  assert.deepEqual(invocation.args, [
    "LOT-1",
    "ES",
    "Supplier A",
    "2026-02-01",
  ]);
});

test("besu adapter emits privacy-group contract calls", () => {
  const adapter = new BesuSelectiveDisclosureAdapter();

  const call = adapter.anchorOrder(
    {
      id: "PO-1",
      buyer: "Buyer",
      supplier: "Supplier",
      sku: "SKU",
      quantity: 10,
      unitPriceUsd: 25,
      incoterm: "FOB",
      destinationPort: "Rotterdam",
      sustainabilityGrade: "A",
    },
    "proof-123",
  );

  assert.equal(call.method, "anchorOrder");
  assert.equal(call.privacyGroup, "buyer-supplier-regulator");
});

test("corda adapter emits state-and-flow clearance commands", () => {
  const adapter = new CordaCredentialingAdapter();

  const command = adapter.buildAssignmentClearanceFlow(
    {
      providerId: "PROV-1",
      facility: "Central Hospital",
      jurisdiction: "NL",
      requiredCredentials: ["medical-license", "bls"],
      procedure: "Night Shift",
      scheduledAt: "2026-03-10T00:00:00Z",
    },
    {
      approved: false,
      reasons: ["Missing bls credential for jurisdiction NL."],
    },
  );

  assert.equal(command.flow, "IssueProviderClearanceFlow");
  assert.equal(command.command, "RejectClearance");
  assert.deepEqual(command.outputState.requiredCredentials, [
    "medical-license",
    "bls",
  ]);
});
