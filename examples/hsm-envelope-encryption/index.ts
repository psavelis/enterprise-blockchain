import { HsmClient } from "../../modules/hsm/src/index";

// ---------------------------------------------------------------------------
// TradeFin Platform — HSM envelope encryption for trade documents
//
// Scenario: TradeFin protects Bills of Lading and commercial invoices on a
// shared ledger.  Each document is encrypted with a fresh random DEK
// (Data Encryption Key); the DEK itself is then wrapped by a KEK
// (Key Encryption Key) that never leaves the HSM.
//
// The on-ledger record contains only ciphertext + wrapped DEK — useless
// without HSM access.  Authorised parties (same HSM slot) can decrypt;
// a third-party with a different HSM instance cannot.
//
// This pattern mirrors what PKCS#11 CKM_AES_KEY_WRAP + CKM_AES_GCM offer
// in production HSM deployments (Thales Luna, AWS CloudHSM, Azure Managed HSM).
// ---------------------------------------------------------------------------

// --- Authorised KMS HSM (TradeFin internal) --------------------------------

const kmsHsm = new HsmClient();

kmsHsm.initialize({
  slotId: "tradefin-kms-hsm-01",
  label: "TradeFin KMS HSM",
});

kmsHsm.generateSymmetricKey("tradefin-master-kek-2026");

// --- Construct Bill of Lading document -------------------------------------

const billOfLading = {
  documentId: "BOL-2026-NSSEA-00419",
  documentType: "Bill of Lading",
  shipper: {
    name: "Northern Star Textile Mills",
    address: "Industrial Zone 4, Dhaka, Bangladesh",
    eori: "BD-MFG-4412-C",
  },
  consignee: {
    name: "Aquila Retail Group",
    address: "Zuidplein 36, 3083 CW Rotterdam, Netherlands",
    eori: "NL-RLT-7781-A",
  },
  notifyParty: "ING Trade Finance, Amsterdam",
  portOfLoading: "Chittagong, Bangladesh",
  portOfDischarge: "Rotterdam, Netherlands",
  commodity: "Organic Cotton Woven Fabric — HS 5208.21",
  grossWeightKg: 14_800,
  numberOfPackages: 320,
  containerRef: "MSCU7413829",
  letterOfCreditRef: "ING-LC-2026-00441",
  declaredValueUsd: 336_000,
  issuedAt: "2026-03-10T08:30:00Z",
};

console.log("HSM Envelope Encryption — TradeFin Platform");
console.log("\nOriginal document:");
console.log(
  JSON.stringify(
    {
      documentId: billOfLading.documentId,
      consignee: billOfLading.consignee.name,
      declaredValueUsd: billOfLading.declaredValueUsd,
    },
    null,
    2,
  ),
);

// --- Encrypt for ledger storage --------------------------------------------

const { encryptedRecord, wrappedDek } = kmsHsm.encryptWithEnvelope(
  "tradefin-master-kek-2026",
  JSON.stringify(billOfLading),
);

console.log("\nOn-ledger record (encrypted — safe for consortium storage):");
console.log(
  JSON.stringify(
    {
      algorithm: encryptedRecord.algorithm,
      ciphertext: encryptedRecord.ciphertext.slice(0, 32) + "…",
      wrappedDek: {
        kekLabel: wrappedDek.kekLabel,
        wrappedDek: wrappedDek.wrappedDek.slice(0, 32) + "…",
        wrappedAt: wrappedDek.wrappedAt,
      },
    },
    null,
    2,
  ),
);

// --- Authorised retrieval (same HSM instance) ------------------------------

const decryptedJson = kmsHsm.decryptWithEnvelope(wrappedDek, encryptedRecord);
const decryptedDoc = JSON.parse(decryptedJson) as typeof billOfLading;

console.log("\nAuthorised retrieval (TradeFin KMS HSM — same slot):");
console.log(
  JSON.stringify(
    {
      documentId: decryptedDoc.documentId,
      consignee: decryptedDoc.consignee.name,
      portOfDischarge: decryptedDoc.portOfDischarge,
      declaredValueUsd: decryptedDoc.declaredValueUsd,
      decryptionStatus: "success",
    },
    null,
    2,
  ),
);

// --- Unauthorised retrieval attempt ----------------------------------------
//
// A third party with a different HSM and a different KEK tries to unwrap the
// DEK.  GCM authentication detects the key mismatch and throws before any
// plaintext is produced.

const unauthorizedHsm = new HsmClient();
unauthorizedHsm.initialize({
  slotId: "third-party-hsm-99",
  label: "Forwarder HSM (no KEK access)",
});
unauthorizedHsm.generateSymmetricKey("wrong-kek");

// Clone wrappedDek metadata but point at the wrong KEK label so the
// unauthorized HSM attempts to use its own key for unwrapping.
const spoofedWrappedDek = { ...wrappedDek, kekLabel: "wrong-kek" };

let unauthorizedOutcome: string;
try {
  unauthorizedHsm.decryptWithEnvelope(spoofedWrappedDek, encryptedRecord);
  unauthorizedOutcome = "decrypted — UNEXPECTED";
} catch (err) {
  unauthorizedOutcome = (err as Error).message;
}

console.log("\nUnauthorised retrieval attempt (Forwarder HSM — wrong KEK):");
console.log(
  JSON.stringify(
    {
      attemptedKek: "wrong-kek",
      outcome: unauthorizedOutcome,
      expectedOutcome: "denied — GCM authentication failed",
    },
    null,
    2,
  ),
);

// --- KMS HSM audit trail ---------------------------------------------------

console.log("\nTradeFin KMS HSM audit log:");
console.log(JSON.stringify(kmsHsm.getAuditLog(), null, 2));
