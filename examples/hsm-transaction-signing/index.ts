import { HsmClient } from "../../modules/hsm/src/index";

// ---------------------------------------------------------------------------
// Apex Capital — HSM-backed trade order signing
//
// Scenario: Trader Alice at Apex Capital signs an equity buy order before
// submission to the consortium DLT venue.  The HSM holds her EC P-256 private
// key; only an opaque handle is returned.  Counterparties verify using the
// PEM public key published to the channel MSP.
// ---------------------------------------------------------------------------

const hsm = new HsmClient();

hsm.initialize({
  slotId: "apex-trading-hsm-01",
  label: "Apex Capital Trading HSM",
});

// --- Provision trader key on HSM -------------------------------------------

const keyPair = hsm.generateKeyPair("trader-alice-ec256");

console.log("HSM Transaction Signing");
console.log("\nKey provisioned:");
console.log(
  JSON.stringify(
    {
      keyLabel: keyPair.keyLabel,
      keyType: keyPair.keyType,
      namedCurve: keyPair.namedCurve,
      privateKeyHandle: keyPair.privateKeyHandle,
      publicKeyFingerprint:
        keyPair.publicKeyPem
          .replace(/-----[^-]+-----/g, "")
          .replace(/\s/g, "")
          .slice(0, 32) + "…",
      createdAt: keyPair.createdAt,
    },
    null,
    2,
  ),
);

// --- Construct trade order --------------------------------------------------

const tradeOrder = {
  orderId: "ORD-2026-03-0047",
  instrument: {
    isin: "XS0304487198",
    description: "Apex EUR Senior Unsecured Notes 2029",
  },
  side: "BUY",
  quantity: 50_000,
  limitPriceUsd: 102.75,
  currency: "USD",
  venue: "consortium-fixed-income-venue",
  counterpartyMspId: "MeridianBankMSP",
  settlementDate: "2026-03-15",
  submittedBy: "alice.thornton@apexcapital.com",
  submittedAt: new Date().toISOString(),
};

const orderPayload = JSON.stringify(tradeOrder);

// --- Sign via HSM -----------------------------------------------------------

const signed = hsm.sign("trader-alice-ec256", orderPayload);

console.log("\nSigned trade order:");
console.log(
  JSON.stringify(
    {
      orderId: tradeOrder.orderId,
      algorithm: signed.algorithm,
      signature: signed.signature.slice(0, 24) + "…",
      hsmAttestation: signed.hsmAttestation.slice(0, 24) + "…",
      timestamp: signed.timestamp,
    },
    null,
    2,
  ),
);

// --- Counterparty endorsement (verify on original payload) -----------------

const endorsed = hsm.verify(
  "trader-alice-ec256",
  orderPayload,
  signed.signature,
);

console.log("\nCounterparty endorsement (MeridianBankMSP):");
console.log(
  JSON.stringify(
    {
      orderId: tradeOrder.orderId,
      verifiedWith: signed.algorithm,
      endorsementResult: endorsed
        ? "VALID — order accepted"
        : "INVALID — order rejected",
    },
    null,
    2,
  ),
);

// --- Tamper detection -------------------------------------------------------

const tamperedOrder = { ...tradeOrder, quantity: 500_000 };
const tamperedPayload = JSON.stringify(tamperedOrder);
const tamperResult = hsm.verify(
  "trader-alice-ec256",
  tamperedPayload,
  signed.signature,
);

console.log("\nTamper detection (altered quantity field):");
console.log(
  JSON.stringify(
    {
      originalQuantity: tradeOrder.quantity,
      tamperedQuantity: tamperedOrder.quantity,
      signatureStillValid: tamperResult,
      expectedOutcome: "false — signature covers original payload",
    },
    null,
    2,
  ),
);

// --- HSM audit trail --------------------------------------------------------

console.log("\nHSM audit log:");
console.log(JSON.stringify(hsm.getAuditLog(), null, 2));
