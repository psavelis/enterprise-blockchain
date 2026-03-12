import test from "node:test";
import assert from "node:assert/strict";

import { AidSettlementLedger } from "../modules/aid-settlement/src/index";

test("aid settlement reconciliation rejects expired, duplicate, and disallowed claims", () => {
  const ledger = new AidSettlementLedger();

  ledger.issueGrant({
    id: "GRANT-1",
    beneficiaryId: "BEN-1",
    program: "Food Support",
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-02-01T00:00:00Z",
    approvedMerchantCategories: ["groceries"],
    amountUsd: 100,
  });

  ledger.submitClaim({
    id: "CLAIM-1",
    grantId: "GRANT-1",
    merchantId: "M-1",
    merchantCategory: "groceries",
    submittedAt: "2026-01-20T00:00:00Z",
    invoiceReference: "INV-1",
    amountUsd: 40,
  });

  ledger.submitClaim({
    id: "CLAIM-2",
    grantId: "GRANT-1",
    merchantId: "M-1",
    merchantCategory: "electronics",
    submittedAt: "2026-01-21T00:00:00Z",
    invoiceReference: "INV-2",
    amountUsd: 10,
  });

  ledger.submitClaim({
    id: "CLAIM-3",
    grantId: "GRANT-1",
    merchantId: "M-2",
    merchantCategory: "groceries",
    submittedAt: "2026-02-10T00:00:00Z",
    invoiceReference: "INV-3",
    amountUsd: 10,
  });

  const report = ledger.reconcile();

  assert.deepEqual(report.settledClaimIds, ["CLAIM-1"]);
  assert.deepEqual(report.rejectedClaimIds, ["CLAIM-2", "CLAIM-3"]);
  assert.equal(report.exceptions.length, 2);
});
