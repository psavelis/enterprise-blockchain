import test from "node:test";
import assert from "node:assert/strict";

import { AidSettlementLedger } from "../modules/aid-settlement/src/index";

test("reconcile settles valid claims", () => {
  const ledger = new AidSettlementLedger();

  ledger.issueGrant({
    id: "G-VALID",
    beneficiaryId: "BEN-1",
    program: "Food Support",
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-02-01T00:00:00Z",
    approvedMerchantCategories: ["groceries"],
    amountUsd: 100,
  });

  ledger.submitClaim({
    id: "C-1",
    grantId: "G-VALID",
    merchantId: "M-1",
    merchantCategory: "groceries",
    submittedAt: "2026-01-20T00:00:00Z",
    invoiceReference: "INV-1",
    amountUsd: 40,
  });

  const report = ledger.reconcile();
  assert.deepEqual(report.settledClaimIds, ["C-1"]);
  assert.deepEqual(report.rejectedClaimIds, []);
});

test("reconcile rejects claims submitted after grant expires", () => {
  const ledger = new AidSettlementLedger();

  ledger.issueGrant({
    id: "G-EXP",
    beneficiaryId: "BEN-1",
    program: "Food Support",
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-02-01T00:00:00Z",
    approvedMerchantCategories: ["groceries"],
    amountUsd: 100,
  });

  ledger.submitClaim({
    id: "C-LATE",
    grantId: "G-EXP",
    merchantId: "M-1",
    merchantCategory: "groceries",
    submittedAt: "2026-02-10T00:00:00Z",
    invoiceReference: "INV-LATE",
    amountUsd: 10,
  });

  const report = ledger.reconcile();
  assert.deepEqual(report.rejectedClaimIds, ["C-LATE"]);
  assert.ok(report.exceptions.some((e) => e.includes("expired")));
});

test("reconcile rejects claims with an unapproved merchant category", () => {
  const ledger = new AidSettlementLedger();

  ledger.issueGrant({
    id: "G-CAT",
    beneficiaryId: "BEN-1",
    program: "Food Support",
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-12-31T00:00:00Z",
    approvedMerchantCategories: ["groceries"],
    amountUsd: 100,
  });

  ledger.submitClaim({
    id: "C-WRONG-CAT",
    grantId: "G-CAT",
    merchantId: "M-1",
    merchantCategory: "electronics",
    submittedAt: "2026-01-20T00:00:00Z",
    invoiceReference: "INV-E",
    amountUsd: 10,
  });

  const report = ledger.reconcile();
  assert.deepEqual(report.rejectedClaimIds, ["C-WRONG-CAT"]);
  assert.ok(report.exceptions.some((e) => e.includes("electronics")));
});

test("reconcile rejects duplicate invoice references within a grant", () => {
  const ledger = new AidSettlementLedger();

  ledger.issueGrant({
    id: "G-DUP",
    beneficiaryId: "BEN-1",
    program: "Food Support",
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-12-31T00:00:00Z",
    approvedMerchantCategories: ["groceries"],
    amountUsd: 100,
  });

  ledger.submitClaim({
    id: "C-FIRST",
    grantId: "G-DUP",
    merchantId: "M-1",
    merchantCategory: "groceries",
    submittedAt: "2026-01-10T00:00:00Z",
    invoiceReference: "INV-DUP",
    amountUsd: 20,
  });

  ledger.submitClaim({
    id: "C-SECOND",
    grantId: "G-DUP",
    merchantId: "M-1",
    merchantCategory: "groceries",
    submittedAt: "2026-01-11T00:00:00Z",
    invoiceReference: "INV-DUP",
    amountUsd: 20,
  });

  const report = ledger.reconcile();
  assert.deepEqual(report.settledClaimIds, ["C-FIRST"]);
  assert.deepEqual(report.rejectedClaimIds, ["C-SECOND"]);
  assert.ok(report.exceptions.some((e) => e.includes("duplicated")));
});

// legacy combined test kept for regression coverage
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

test("reconcile rejects claims that exceed the grant budget", () => {
  const ledger = new AidSettlementLedger();

  ledger.issueGrant({
    id: "G-BUDGET",
    beneficiaryId: "BEN-1",
    program: "Food Support",
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-12-31T00:00:00Z",
    approvedMerchantCategories: ["groceries"],
    amountUsd: 50,
  });

  ledger.submitClaim({
    id: "C-FIT",
    grantId: "G-BUDGET",
    merchantId: "M-1",
    merchantCategory: "groceries",
    submittedAt: "2026-01-10T00:00:00Z",
    invoiceReference: "INV-A",
    amountUsd: 30,
  });

  ledger.submitClaim({
    id: "C-OVER",
    grantId: "G-BUDGET",
    merchantId: "M-1",
    merchantCategory: "groceries",
    submittedAt: "2026-01-11T00:00:00Z",
    invoiceReference: "INV-B",
    amountUsd: 25,
  });

  const report = ledger.reconcile();
  assert.deepEqual(report.settledClaimIds, ["C-FIT"]);
  assert.deepEqual(report.rejectedClaimIds, ["C-OVER"]);
  assert.ok(report.exceptions.some((e) => e.includes("overspend")));
});

test("reconcile rejects orphaned claims with unknown grant reference", () => {
  const ledger = new AidSettlementLedger();

  ledger.submitClaim({
    id: "C-ORPHAN",
    grantId: "G-PHANTOM",
    merchantId: "M-1",
    merchantCategory: "groceries",
    submittedAt: "2026-01-10T00:00:00Z",
    invoiceReference: "INV-X",
    amountUsd: 10,
  });

  const report = ledger.reconcile();
  assert.deepEqual(report.rejectedClaimIds, ["C-ORPHAN"]);
  assert.ok(report.exceptions.some((e) => e.includes("unknown grant")));
});

test("reconcile rejects any claim against a zero-budget grant", () => {
  const ledger = new AidSettlementLedger();

  ledger.issueGrant({
    id: "G-ZERO",
    beneficiaryId: "BEN-1",
    program: "Emergency Aid",
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-12-31T00:00:00Z",
    approvedMerchantCategories: ["groceries"],
    amountUsd: 0,
  });

  ledger.submitClaim({
    id: "C-ANY",
    grantId: "G-ZERO",
    merchantId: "M-1",
    merchantCategory: "groceries",
    submittedAt: "2026-01-10T00:00:00Z",
    invoiceReference: "INV-Z",
    amountUsd: 1,
  });

  const report = ledger.reconcile();
  assert.deepEqual(report.rejectedClaimIds, ["C-ANY"]);
  assert.ok(report.exceptions.some((e) => e.includes("overspend")));
});
