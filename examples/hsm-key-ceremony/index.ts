import { HsmClient } from "../../modules/hsm/src/index";
import { QuantumResistantVault } from "../../modules/mpc/src/quantum";

// ---------------------------------------------------------------------------
// GlobalNet Consortium — Member onboarding key ceremony
//
// Scenario: Argent Bank joins the GlobalNet trade-finance consortium.
// Five named custodians conduct a root-key ceremony:
//   (1) The HSM generates the bank's root signing key pair.
//   (2) A Shamir 3-of-5 threshold splits a ceremony seed across the five
//       custodians — any three can reconstruct it to authorise future
//       key-rotation events.
//   (3) A ceremony completion certificate is HSM-signed and printed for
//       the consortium governance record.
//
// HSM + QuantumResistantVault are complementary tools:
//   • HSM        → hardware-protected private-key storage and signing
//   • Shamir SSS → distributed custodianship; no single custodian holds authority
// ---------------------------------------------------------------------------

const hsm = new HsmClient();
const vault = new QuantumResistantVault();

hsm.initialize({
  slotId: "consortium-ceremony-hsm",
  label: "GlobalNet Consortium Ceremony HSM",
});

// --- Step 1: Generate Argent Bank's root signing key -----------------------

const rootKey = hsm.generateKeyPair("argent-bank-root-signing-key");

const publicKeyFingerprint =
  rootKey.publicKeyPem
    .replace(/-----[^-]+-----/g, "")
    .replace(/\s/g, "")
    .slice(0, 40) + "…";

console.log("HSM Key Ceremony — GlobalNet Consortium / Argent Bank");
console.log("\nStep 1 — Root key generated:");
console.log(
  JSON.stringify(
    {
      keyLabel: rootKey.keyLabel,
      keyType: rootKey.keyType,
      namedCurve: rootKey.namedCurve,
      privateKeyHandle: rootKey.privateKeyHandle,
      publicKeyFingerprint,
      createdAt: rootKey.createdAt,
    },
    null,
    2,
  ),
);

// --- Step 2: Distribute ceremony seed across five custodians ---------------
//
// In production the ceremony seed would be derived from HSM key material
// (e.g. a KDF output or a TRNG value exported in encrypted form).
// Here we use a numeric value that fits the demo prime field.

const ceremonySeed = 7_419_253n;

const custodians = [
  { id: "cfo", name: "James Whitfield", role: "Chief Financial Officer" },
  {
    id: "ciso",
    name: "Priya Nair",
    role: "Chief Information Security Officer",
  },
  { id: "legal", name: "Marcus Webb", role: "General Counsel" },
  { id: "ops", name: "Sofia Rossi", role: "Head of Operations" },
  { id: "it", name: "Amir Hussain", role: "Infrastructure Lead" },
];

const custodianIds = custodians.map((c) => c.id);
const shares = vault.distributeSecret(ceremonySeed, custodianIds, 3);

console.log("\nStep 2 — Ceremony seed distributed (3-of-5 threshold):");
for (const custodian of custodians) {
  const share = shares.get(custodian.id)!;
  console.log(
    `  ${custodian.name} (${custodian.role}): commitment ${share.commitment.slice(0, 20)}…`,
  );
}

// --- Step 3: Quorum reconstruction (CFO, CISO, General Counsel) ------------

const quorumMembers = ["cfo", "ciso", "legal"];
const quorumShares = quorumMembers.map((id) => shares.get(id)!);
const reconstructed = vault.reconstructSecret(quorumShares, 3);

console.log("\nStep 3 — 3-of-5 quorum reconstruction (CFO + CISO + Counsel):");
console.log(
  JSON.stringify(
    {
      participatingCustodians: quorumMembers,
      reconstructionSucceeded: reconstructed !== null,
      seedMatchesOriginal: reconstructed === ceremonySeed,
    },
    null,
    2,
  ),
);

// --- Rejection: below-threshold attempt (Ops + IT only) --------------------

const belowThresholdMembers = ["ops", "it"];
const belowThresholdShares = belowThresholdMembers.map((id) => shares.get(id)!);
const belowThresholdResult = vault.reconstructSecret(belowThresholdShares, 3);

console.log("\nBelow-threshold attempt (Ops + IT — 2 of 5 custodians):");
console.log(
  JSON.stringify(
    {
      participatingCustodians: belowThresholdMembers,
      reconstructionResult: belowThresholdResult,
      expectedOutcome: "null — below threshold, no information revealed",
    },
    null,
    2,
  ),
);

// --- Step 4: Issue HSM-signed ceremony certificate -------------------------

const ceremonyCertificate = {
  type: "consortium-onboarding-certificate",
  consortium: "GlobalNet Trade Finance",
  newMember: "Argent Bank",
  rootKeyLabel: rootKey.keyLabel,
  rootKeyFingerprint: publicKeyFingerprint,
  threshold: "3-of-5",
  custodians: custodians.map((c) => ({ id: c.id, name: c.name, role: c.role })),
  completedAt: new Date().toISOString(),
};

const certSigned = hsm.sign(
  "argent-bank-root-signing-key",
  JSON.stringify(ceremonyCertificate),
);

console.log("\nStep 4 — Ceremony certificate (HSM-signed):");
console.log(
  JSON.stringify(
    {
      ...ceremonyCertificate,
      signature: certSigned.signature.slice(0, 24) + "…",
      hsmAttestation: certSigned.hsmAttestation.slice(0, 24) + "…",
    },
    null,
    2,
  ),
);

// --- HSM audit trail -------------------------------------------------------

console.log("\nHSM audit log:");
console.log(JSON.stringify(hsm.getAuditLog(), null, 2));
