import { AidSettlementLedger } from "../../modules/aid-settlement/src/index";

const ledger = new AidSettlementLedger();

ledger.issueGrant({
  id: "GRANT-9001",
  beneficiaryId: "HH-20014",
  program: "Urban Food Support",
  issuedAt: "2026-02-01T00:00:00Z",
  expiresAt: "2026-03-01T00:00:00Z",
  approvedMerchantCategories: ["groceries", "pharmacy"],
  amountUsd: 180,
});

ledger.submitClaim({
  id: "CLAIM-1",
  grantId: "GRANT-9001",
  merchantId: "M-44",
  merchantCategory: "groceries",
  submittedAt: "2026-02-10T13:00:00Z",
  invoiceReference: "INV-1001",
  amountUsd: 65,
});

ledger.submitClaim({
  id: "CLAIM-2",
  grantId: "GRANT-9001",
  merchantId: "M-44",
  merchantCategory: "electronics",
  submittedAt: "2026-02-12T13:00:00Z",
  invoiceReference: "INV-1002",
  amountUsd: 45,
});

ledger.submitClaim({
  id: "CLAIM-3",
  grantId: "GRANT-9001",
  merchantId: "M-18",
  merchantCategory: "groceries",
  submittedAt: "2026-03-05T09:30:00Z",
  invoiceReference: "INV-1003",
  amountUsd: 20,
});

ledger.submitClaim({
  id: "CLAIM-4",
  grantId: "GRANT-9001",
  merchantId: "M-44",
  merchantCategory: "groceries",
  submittedAt: "2026-02-17T11:10:00Z",
  invoiceReference: "INV-1001",
  amountUsd: 65,
});

console.log("Aid Voucher Reconciliation");
console.log(JSON.stringify(ledger.reconcile(), null, 2));
