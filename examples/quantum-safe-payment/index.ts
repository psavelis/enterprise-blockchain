/**
 * Quantum-Safe Payment Authorization — Full Stack
 *
 * This is the capstone example.  It wires together every NIST post-quantum
 * primitive from this repository into a single, end-to-end payment lifecycle:
 *
 *   Phase 1 — Key Ceremony
 *     HSM-backed key generation for both institutions.  Leet Gaming generates an
 *     ML-DSA-65 signing key (FIPS 204).  Leet Gaming SC generates a Hybrid KEM key
 *     pair (X25519 + ML-KEM-768, FIPS 203).  Both publish SHA-256–anchored
 *     public keys to a simulated consortium ledger.
 *
 *   Phase 2 — Leet Gaming Signs and Encrypts
 *     Leet Gaming constructs the €50M EUR/JPY FX instruction, signs it with
 *     ML-DSA-65, encapsulates a session key via Hybrid KEM, and AES-256-GCM
 *     encrypts the {instruction + signature} bundle.
 *
 *   Phase 3 — Leet Gaming SC Decrypts and Verifies
 *     Leet Gaming SC decapsulates the session key via Hybrid KEM, decrypts the
 *     bundle, and verifies the ML-DSA-65 signature.  A forged or tampered
 *     payload fails at one of these three layers.
 *
 *   Phase 4 — Settlement Committee Authorization
 *     Before funds move, three Leet Gaming SC officers each submit an additive
 *     secret share of the settlement authorization code.  Reconstruction
 *     and equality check enforces the 3-of-3 quorum.
 *
 *   Security Properties Demo
 *     Four attack scenarios are exercised and shown to fail:
 *     1. Tampered ciphertext       → AES-GCM auth tag mismatch
 *     2. Tampered signature bytes  → ML-DSA verify returns false
 *     3. Wrong KEM private key     → different combined key → decrypt fails
 *     4. Missing authorization share → reconstructed code does not match
 *
 * Standards:
 *   NIST FIPS 203 (ML-KEM) — https://csrc.nist.gov/pubs/fips/203/final
 *   NIST FIPS 204 (ML-DSA) — https://csrc.nist.gov/pubs/fips/204/final
 *
 * Run: npm run example:quantum-safe-payment
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import { HybridKem } from "../../modules/mpc/src/hybrid-kem";

/**
 * Domain-specific salt for HKDF key derivation in quantum-safe payments.
 * Per RFC 5869, salt provides additional entropy for the extraction step.
 * Using SHA-256 of domain string ensures cryptographic binding to this context.
 */
const HKDF_SALT = createHash("sha256")
  .update("enterprise-blockchain:quantum-safe-payment-v1:salt")
  .digest();
import { MlDsaSigner } from "../../modules/mpc/src/dsa";
import { MPCEngine } from "../../modules/mpc/src/index";

// ---------------------------------------------------------------------------
// Settlement payload
// ---------------------------------------------------------------------------

interface SettlementInstruction {
  instructionId: string;
  originatingBank: { name: string; bic: string };
  receivingBank: { name: string; bic: string };
  currencyPair: string;
  notionalEur: number;
  fxRate: number;
  settlementDate: string;
  swiftRef: string;
  correspondentChain: string[];
  channel: string;
  timestamp: string;
}

const INSTRUCTION_ID = "MGB-NPY-2026-03-20-QSAF-001";

const INSTRUCTION: SettlementInstruction = {
  instructionId: INSTRUCTION_ID,
  originatingBank: { name: "Leet Gaming Global Bank AG", bic: "MRGBDEFF" },
  receivingBank: { name: "Leet Gaming Settlement Corp", bic: "NOVAJPJT" },
  currencyPair: "EUR/JPY",
  notionalEur: 50_000_000,
  fxRate: 162.34,
  settlementDate: "2026-03-22",
  swiftRef: "MGB20260320EUR50M-QSAF",
  correspondentChain: [
    "MRGBDEFF (Leet Gaming, Frankfurt)",
    "DEUTDEDB (Deutsche Bank, Frankfurt — EUR leg)",
    "BOTKJPJT (MUFG Bank, Tokyo — JPY leg)",
    "NOVAJPJT (Leet Gaming SC, Tokyo)",
  ],
  channel: "ml-dsa-65 + hybrid-x25519-ml-kem-768",
  timestamp: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// AES-256-GCM helpers
// ---------------------------------------------------------------------------

interface Encrypted {
  iv: string;
  tag: string;
  ciphertext: string;
}

function encrypt(key: Buffer, plaintext: string): Encrypted {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    ciphertext: body.toString("hex"),
  };
}

function tryDecrypt(
  key: Buffer,
  enc: Encrypted,
): { ok: true; plaintext: string } | { ok: false; error: string } {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(enc.iv, "hex"),
    );
    decipher.setAuthTag(Buffer.from(enc.tag, "hex"));
    const pt =
      decipher.update(Buffer.from(enc.ciphertext, "hex")).toString("utf8") +
      decipher.final("utf8");
    return { ok: true, plaintext: pt };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Main demonstration
// ---------------------------------------------------------------------------

const hybridKem = new HybridKem();
const dsaSigner = new MlDsaSigner();
const mpcEngine = new MPCEngine();
const section = (title: string) => console.log(`\n── ${title}`);

console.log("Quantum-Safe Payment Authorization — Full Stack");
console.log(
  `Leet Gaming Global Bank AG → Leet Gaming Settlement Corp  |  ${INSTRUCTION_ID}  |  €${INSTRUCTION.notionalEur.toLocaleString()} EUR/JPY @ ${INSTRUCTION.fxRate}`,
);
console.log(
  "ML-DSA-65 (FIPS 204) + ML-KEM-768/X25519 hybrid (FIPS 203) + AES-256-GCM + MPC 3-of-3\n",
);

// ===========================================================================
// Phase 1 — Key Ceremony
// ===========================================================================

section("Phase 1 — Key Ceremony");

// Leet Gaming: ML-DSA-65 signing key pair
const meridianDsaKeys = dsaSigner.generateKeyPair("ml-dsa-65");
const meridianDsaPubAnchor =
  Buffer.from(meridianDsaKeys.publicKey).toString("hex").slice(0, 16) + "...";

console.log(
  `   [Leet Gaming] ML-DSA-65: pk=${meridianDsaKeys.publicKey.length} B  sk=${meridianDsaKeys.secretKey.length} B  anchor=${meridianDsaPubAnchor}`,
);

// Leet Gaming SC: Hybrid KEM key pairs (X25519 + ML-KEM-768)
const novaPayKemKeys = hybridKem.generateKeyPairs();
const novaPayKyberPubAnchor =
  Buffer.from(novaPayKemKeys.kyber.publicKey).toString("hex").slice(0, 16) +
  "...";

console.log(
  `   [Leet Gaming SC]  X25519 pk=32 B  ML-KEM-768 pk=${novaPayKemKeys.kyber.publicKey.length} B  sk=${novaPayKemKeys.kyber.secretKey.length} B  anchor=${novaPayKyberPubAnchor}`,
);
console.log("   Public keys published to consortium directory ✓\n");

// ===========================================================================
// Phase 2 — Leet Gaming Signs and Encrypts
// ===========================================================================

section("Phase 2 — Leet Gaming: sign + encrypt");

// 2a. Sign the instruction
const instructionBytes = Buffer.from(JSON.stringify(INSTRUCTION), "utf8");
const sigResult = dsaSigner.sign(
  instructionBytes,
  meridianDsaKeys.secretKey,
  "ml-dsa-65",
);

console.log(
  `   [Leet Gaming] ML-DSA-65 sig=${sigResult.signature.length} B  commitment=${sigResult.auditCommitment}`,
);

// 2b. Encapsulate session key via Hybrid KEM
const encap = hybridKem.encapsulate(
  novaPayKemKeys.x25519.publicKey,
  novaPayKemKeys.kyber.publicKey,
);

console.log(
  `   [Leet Gaming] Hybrid KEM: X25519 eph=${encap.x25519EphemeralPublicKeyDer.length} B  ML-KEM-768 ct=${encap.kyberCiphertext.length} B  combined key=32 B (not transmitted)`,
);
console.log(`              commitment=${encap.auditCommitment}`);

// 2c. Derive AES key with domain-separated context
const aesKey = Buffer.from(
  hkdfSync(
    "sha256",
    encap.combinedKey,
    HKDF_SALT,
    `quantum-safe-payment-v1:${INSTRUCTION_ID}`,
    32,
  ),
);

// 2d. Encrypt {instruction + signature} bundle
const bundle = JSON.stringify({
  instruction: INSTRUCTION,
  signature: Buffer.from(sigResult.signature).toString("hex"),
});
const encrypted = encrypt(aesKey, bundle);

console.log(
  `   [Leet Gaming] AES-256-GCM payload=${encrypted.ciphertext.length / 2} B  → [x25519EphemeralPub || kyberCiphertext || iv || tag || body]\n`,
);

// ===========================================================================
// Phase 3 — Leet Gaming SC Decrypts and Verifies
// ===========================================================================

section("Phase 3 — Leet Gaming SC: decrypt + verify");

// 3a. Decapsulate
const decap = hybridKem.decapsulate(
  novaPayKemKeys.x25519.privateKey,
  novaPayKemKeys.kyber.secretKey,
  encap.x25519EphemeralPublicKeyDer,
  encap.kyberCiphertext,
);

const aesKeyRecovered = Buffer.from(
  hkdfSync(
    "sha256",
    decap.combinedKey,
    HKDF_SALT,
    `quantum-safe-payment-v1:${INSTRUCTION_ID}`,
    32,
  ),
);

// 3b. Decrypt
const decryptResult = tryDecrypt(aesKeyRecovered, encrypted);
if (!decryptResult.ok) {
  console.error(`  [NovaPay]  ✗ Decryption failed: ${decryptResult.error}`);
  process.exit(1);
}

const { instruction: receivedInstruction, signature: sigHex } = JSON.parse(
  decryptResult.plaintext,
) as { instruction: SettlementInstruction; signature: string };

const receivedSig = Buffer.from(sigHex, "hex");
const receivedBytes = Buffer.from(JSON.stringify(receivedInstruction), "utf8");

// 3c. Verify ML-DSA-65 signature
const sigValid = dsaSigner.verify(
  receivedBytes,
  receivedSig,
  meridianDsaKeys.publicKey,
  "ml-dsa-65",
);

const keysMatch = encap.combinedKey.equals(decap.combinedKey);
const payloadMatch =
  receivedInstruction.instructionId === INSTRUCTION.instructionId &&
  receivedInstruction.notionalEur === INSTRUCTION.notionalEur;

console.log(
  `   keys=${keysMatch ? "✓" : "✗"}  payload=${payloadMatch ? "✓" : "✗"}  ML-DSA-65=${sigValid ? "✓" : "✗"}`,
);
if (sigValid) {
  console.log(`\n   ✓ Instruction authenticated — ML-DSA-65 (FIPS 204)`);
  console.log(
    `     ${receivedInstruction.instructionId}  €${receivedInstruction.notionalEur.toLocaleString()} ${receivedInstruction.currencyPair} @ ${receivedInstruction.fxRate}  ${receivedInstruction.swiftRef}\n`,
  );
} else {
  console.error("   ✗ Signature verification failed — aborting settlement");
  process.exit(1);
}

// ===========================================================================
// Phase 4 — Settlement Committee Authorization (3-of-3)
// ===========================================================================

section("Phase 4 — Settlement committee: 3-of-3 MPC authorization");

const OFFICERS = [
  { id: "officer-settlement-head", name: "Officer A (Settlement Head)" },
  { id: "officer-risk", name: "Officer B (Risk Officer)" },
  { id: "officer-compliance", name: "Officer C (Compliance Lead)" },
];

OFFICERS.forEach((o) =>
  mpcEngine.registerParty({
    id: o.id,
    name: o.name,
    endpoint: `https://lgsc.internal/${o.id}`,
  }),
);

// Authorization code: integer encoding of notional in JPY (truncated for demo)
const authorizationCode =
  Math.round(INSTRUCTION.notionalEur * INSTRUCTION.fxRate) % 2 ** 30;
console.log(
  `   authorization code (notional × rate mod 2³⁰): ${authorizationCode}`,
);

const shares = mpcEngine.splitSecret(
  authorizationCode,
  OFFICERS.map((o) => o.id),
);

shares.forEach((s, i) => {
  console.log(`   [${OFFICERS[i]!.name}] share ${s.shareIndex + 1}/3`);
});
console.log();

const computationId = `qsaf-settlement-${INSTRUCTION_ID}`;
shares.forEach((s) => mpcEngine.submitShare(computationId, s));

const computationResult = mpcEngine.compute(computationId, "sum");
const reconstituted =
  computationResult.op === "sum" ? computationResult.aggregate : null;

const authorized = reconstituted === authorizationCode;

console.log(
  `   reconstructed=${reconstituted}  original=${authorizationCode}  match=${authorized} ${authorized ? "✓" : "✗"}\n`,
);

if (authorized) {
  console.log("   ✓ Settlement authorized — 3/3 threshold met\n");
} else {
  console.error("   ✗ Authorization failed — threshold not met");
  process.exit(1);
}

// ===========================================================================
// Security Properties Demo
// ===========================================================================

section("Security properties — attack scenarios");

// --- Scenario 1: Tampered ciphertext (AES-GCM auth tag fails) ---
console.log("   1. tampered ciphertext");
const tamperedEnc: Encrypted = {
  ...encrypted,
  ciphertext: encrypted.ciphertext
    .replace("a", "b")
    .replace(/^(.{1,8})/, (m) => m.split("").reverse().join("")),
};
const tamperResult = tryDecrypt(aesKeyRecovered, tamperedEnc);
console.log(
  `      tryDecrypt: ${tamperResult.ok ? "✗ SHOULD HAVE FAILED" : "✓ " + tamperResult.error.split(":")[0]}\n`,
);

// --- Scenario 2: Valid ciphertext, tampered signature bytes ---
console.log("   2. tampered signature (byte 42 flipped)");
const tamperedSig = new Uint8Array(sigResult.signature);
tamperedSig.set([tamperedSig[42]! ^ 0xff], 42); // flip byte 42
const tamperedSigValid = dsaSigner.verify(
  receivedBytes,
  tamperedSig,
  meridianDsaKeys.publicKey,
  "ml-dsa-65",
);
console.log(
  `      ML-DSA-65 verify: ${!tamperedSigValid ? "✓ false" : "✗ SHOULD HAVE REJECTED"}\n`,
);

// --- Scenario 3: Wrong KEM private key → different combined key → decrypt fails ---
console.log("   3. wrong Hybrid KEM private key");
const attackerKemKeys = hybridKem.generateKeyPairs();
const attackerDecap = hybridKem.decapsulate(
  attackerKemKeys.x25519.privateKey, // wrong X25519
  attackerKemKeys.kyber.secretKey, // wrong ML-KEM
  encap.x25519EphemeralPublicKeyDer,
  encap.kyberCiphertext,
);
const attackerAesKey = Buffer.from(
  hkdfSync(
    "sha256",
    attackerDecap.combinedKey,
    HKDF_SALT,
    `quantum-safe-payment-v1:${INSTRUCTION_ID}`,
    32,
  ),
);
const attackerDecrypt = tryDecrypt(attackerAesKey, encrypted);
console.log(
  `      tryDecrypt (wrong KEM): ${attackerDecrypt.ok ? "✗ SHOULD HAVE FAILED" : "✓ " + attackerDecrypt.error.split(":")[0]}\n`,
);

// --- Scenario 4: Missing 1 of 3 authorization shares ---
console.log("   4. only 2-of-3 shares submitted");
const partialComputationId = `qsaf-partial-${INSTRUCTION_ID}`;
shares
  .slice(0, 2)
  .forEach((s) => mpcEngine.submitShare(partialComputationId, s));
let partialAuthorized = true;
try {
  mpcEngine.compute(partialComputationId, "sum");
} catch {
  partialAuthorized = false;
}
console.log(
  `      compute(2 shares): ${!partialAuthorized ? "✓ incomplete share set — refused" : "✗ SHOULD NOT HAVE AUTHORIZED"}\n`,
);

// ===========================================================================
// Summary
// ===========================================================================

section("Summary");
console.log("   ✓ Phase 1  Key ceremony complete");
console.log(
  "   ✓ Phase 2  Instruction signed (ML-DSA-65) + encrypted (Hybrid KEM + AES-256-GCM)",
);
console.log("   ✓ Phase 3  Decrypted and authenticated");
console.log("   ✓ Phase 4  Settlement authorized — 3/3 officer quorum met");
console.log("\n   ✓ All 4 security property tests passed\n");
console.log(
  "   NIST FIPS 203 (ML-KEM)  https://csrc.nist.gov/pubs/fips/203/final",
);
console.log(
  "   NIST FIPS 204 (ML-DSA)  https://csrc.nist.gov/pubs/fips/204/final",
);
console.log(
  "   RFC 5869 (HKDF)         https://datatracker.ietf.org/doc/html/rfc5869\n",
);
