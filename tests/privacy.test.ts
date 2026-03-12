import test from "node:test";
import assert from "node:assert/strict";

import { SelectiveDisclosureLedger } from "../modules/privacy/src/index";
import { BesuSelectiveDisclosureAdapter } from "../modules/protocols/besu/src/index";

test("privacy ledger exposes only audience-relevant order fields", () => {
  const ledger = new SelectiveDisclosureLedger();
  const adapter = new BesuSelectiveDisclosureAdapter();

  ledger.publishOrder({
    id: "PO-1",
    buyer: "Buyer",
    supplier: "Supplier",
    sku: "SKU-100",
    quantity: 20,
    unitPriceUsd: 15,
    incoterm: "FOB",
    destinationPort: "Rotterdam",
    financingBank: "Trade Bank",
    sustainabilityGrade: "A",
  });

  const bankView = ledger.createView("PO-1", "bank");
  assert.equal(bankView.data.totalValueUsd, 300);
  assert.equal("unitPriceUsd" in bankView.data, false);

  const call = adapter.publishAudienceView(bankView);
  assert.equal(call.contractName, "ConsortiumOrderRegistry");
  assert.equal(call.privacyGroup, "view-bank");
});
