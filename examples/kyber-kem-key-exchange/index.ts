/**
 * ML-KEM (Kyber) Key Exchange — Cross-Border FX Settlement
 *
 * Scenario: Leet Gaming Global Bank (Frankfurt) needs to deliver encrypted FX
 * settlement routing instructions to Leet Gaming Settlement Corp (Tokyo).
 * The instruction contains wire-transfer details worth €50 million.
 *
 * Why not RSA or ECDH?
 * A cryptographically-relevant quantum computer running Shor's algorithm
 * can solve both the integer-factorisation problem (RSA) and the elliptic-curve
 * discrete-logarithm problem (ECDH) in polynomial time.  Attackers already
 * collect encrypted TLS traffic today, expecting to decrypt it once quantum
 * hardware matures — the "harvest-now, decrypt-later" threat.
 *
 * Solution: Replace ECDH key exchange with ML-KEM (NIST FIPS 203, finalised
 * August 2024).  The underlying lattice problem has no known quantum speedup
 * beyond Grover's, which only halves the effective security level — meaning
 * ML-KEM-768 retains ~192-bit post-quantum security.
 *
 * This example shows all three ML-KEM parameter sets so you can see the
 * key-size and ciphertext-size trade-offs in concrete byte counts.
 *
 * Run: npm run example:kyber-kem
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { KyberKem, ML_KEM_SIZES } from "../../modules/mpc/src/kyber";
import type { MlKemParams } from "../../modules/mpc/src/kyber";

// ---------------------------------------------------------------------------
// Settlement instruction — the sensitive payload
// ---------------------------------------------------------------------------

interface SettlementInstruction {
  instructionId: string;
  version: string;
  originatingBank: { name: string; bic: string; country: string };
  receivingBank: { name: string; bic: string; country: string };
  currencyPair: string;
  notionalEur: number;
  fxRate: number;
  notionalJpy: number;
  settlementDate: string;
  valueDate: string;
  swiftRef: string;
  correspondentChain: string[];
  purposeCode: string;
  regulatoryRef: string;
  timestamp: string;
}

// Real-looking FX trade data — EUR/JPY spot transaction
const SETTLEMENT: SettlementInstruction = {
  instructionId: "MGB-NPY-2026-03-20-FX-001",
  version: "1.0",
  originatingBank: {
    name: "Leet Gaming Global Bank AG",
    bic: "MRGBDEFF",
    country: "DE",
  },
  receivingBank: {
    name: "Leet Gaming Settlement Corp",
    bic: "NOVAJPJT",
    country: "JP",
  },
  currencyPair: "EUR/JPY",
  notionalEur: 50_000_000,
  // Mid-market rate at trade date (illustrative)
  fxRate: 162.34,
  notionalJpy: Math.round(50_000_000 * 162.34),
  settlementDate: "2026-03-22",
  valueDate: "2026-03-22",
  // SWIFT FIN MT202 analogue
  swiftRef: "MGB20260320EUR50M001",
  correspondentChain: [
    "MRGBDEFF (Leet Gaming, Frankfurt)",
    "DEUTDEDB (Deutsche Bank, Frankfurt — EUR CLS leg)",
    "BOTKJPJT (MUFG Bank, Tokyo — JPY CLS leg)",
    "NOVAJPJT (Leet Gaming SC, Tokyo)",
  ],
  purposeCode: "CORT", // Corporate trade settlement
  regulatoryRef: "EMIR-2026-MGB-001 / J-FSA-2026-NPY-001",
  timestamp: new Date().toISOString(),
};

// ---------------------------------------------------------------------------
// AES-256-GCM encrypt / decrypt — using the ML-KEM derived key
// ---------------------------------------------------------------------------

function encryptPayload(
  key: Buffer,
  plaintext: string,
): { iv: string; tag: string; ciphertext: string } {
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    ciphertext: enc.toString("hex"),
  };
}

function decryptPayload(
  key: Buffer,
  iv: string,
  tag: string,
  ciphertext: string,
): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return (
    decipher.update(Buffer.from(ciphertext, "hex")).toString("utf8") +
    decipher.final("utf8")
  );
}

// ---------------------------------------------------------------------------
// Main demonstration
// ---------------------------------------------------------------------------

const kem = new KyberKem();
const section = (title: string) => console.log(`\n── ${title}`);

console.log("FX Settlement Key Exchange — ML-KEM (NIST FIPS 203)");
console.log(
  `Leet Gaming Global Bank → Leet Gaming Settlement Corp  |  ${SETTLEMENT.instructionId}  |  ${SETTLEMENT.currencyPair}  €${SETTLEMENT.notionalEur.toLocaleString()} @ ${SETTLEMENT.fxRate}  |  value date ${SETTLEMENT.valueDate}\n`,
);

// ---------------------------------------------------------------------------
// Section 1: Run all three ML-KEM parameter sets and compare
// ---------------------------------------------------------------------------

const paramSets: MlKemParams[] = ["ml-kem-512", "ml-kem-768", "ml-kem-1024"];

/**
 * Security level descriptions in plain language so they are easy to explain
 * in a design review without needing a cryptography background.
 *
 * Reference: NIST FIPS 203 §3 and NIST IR 8413 security strength tables.
 * https://csrc.nist.gov/pubs/fips/203/final
 */
const PARAM_DESCRIPTIONS: Record<
  MlKemParams,
  { nistLevel: string; securityNote: string }
> = {
  "ml-kem-512": {
    nistLevel: "NIST Level 1",
    securityNote:
      "Comparable to AES-128 against a quantum attacker.  Fast and compact — " +
      "suitable for IoT or constrained environments where bandwidth matters more " +
      "than decades of future-proofing.",
  },
  "ml-kem-768": {
    nistLevel: "NIST Level 3",
    securityNote:
      "Comparable to AES-192.  NIST's recommended choice for most enterprise " +
      "deployments.  Balances key size growth (~48 % larger than 512) against " +
      "the additional security margin — the right pick for financial messaging.",
  },
  "ml-kem-1024": {
    nistLevel: "NIST Level 5",
    securityNote:
      "Comparable to AES-256.  Largest keys; chosen when data must remain " +
      "confidential for 30+ years or when protecting assets with catastrophic " +
      "compromise implications (e.g., central bank master signing keys).",
  },
};

const results: { params: MlKemParams; success: boolean }[] = [];

for (const params of paramSets) {
  const sizes = ML_KEM_SIZES[params];
  const desc = PARAM_DESCRIPTIONS[params];

  section(
    `${params.toUpperCase()} — ${desc.nistLevel}  (pk ${sizes.publicKey} B  sk ${sizes.secretKey} B  ct ${sizes.ciphertext} B)`,
  );
  console.log(`   ${desc.securityNote}\n`);

  // --- Leet Gaming SC (recipient) generates their post-quantum public key ---
  const novaPayKeypair = kem.generateKeyPair(params);
  console.log(
    `   [Leet Gaming SC]  pk=${novaPayKeypair.publicKey.length} B published to consortium directory`,
  );
  const t0 = performance.now();
  const encap = kem.encapsulate(novaPayKeypair.publicKey, params);
  const encapMs = performance.now() - t0;

  console.log(
    `   [Leet Gaming] ct=${encap.ciphertext.length} B  commitment=${encap.auditCommitment}`,
  );

  // Derive AES-256 key from the shared secret — include the instruction ID as
  // context so the derived key is unique to this specific settlement.
  const senderAesKey = kem.deriveAesKey(
    encap.sharedSecret,
    `ml-kem-aes-key-v1:${SETTLEMENT.instructionId}`,
  );

  // Encrypt the settlement instruction
  const {
    iv,
    tag,
    ciphertext: encryptedPayload,
  } = encryptPayload(senderAesKey, JSON.stringify(SETTLEMENT));
  console.log(
    `   [Leet Gaming] payload=${encryptedPayload.length / 2} B  → [ct || iv || tag || ciphertext]\n`,
  );

  // --- Leet Gaming SC (recipient) decapsulates ---
  const t1 = performance.now();
  const recoveredSharedSecret = kem.decapsulate(
    encap.ciphertext,
    novaPayKeypair.secretKey,
    params,
  );
  const decapMs = performance.now() - t1;

  const receiverAesKey = kem.deriveAesKey(
    recoveredSharedSecret,
    `ml-kem-aes-key-v1:${SETTLEMENT.instructionId}`,
  );

  const decryptedJson = decryptPayload(
    receiverAesKey,
    iv,
    tag,
    encryptedPayload,
  );
  const recovered = JSON.parse(decryptedJson) as SettlementInstruction;

  const match =
    recovered.instructionId === SETTLEMENT.instructionId &&
    recovered.notionalEur === SETTLEMENT.notionalEur &&
    recovered.swiftRef === SETTLEMENT.swiftRef;

  console.log(
    `   [Leet Gaming SC]  ${match ? "✓" : "✗"} ${recovered.instructionId}  €${recovered.notionalEur.toLocaleString()} @ ${recovered.fxRate}  ${recovered.swiftRef}`,
  );
  console.log(
    `              encap=${encapMs.toFixed(2)} ms  decap=${decapMs.toFixed(2)} ms\n`,
  );

  results.push({ params, success: match });
}

// ---------------------------------------------------------------------------
// Section 2: Parameter set comparison table
// ---------------------------------------------------------------------------

section("Parameter Set Comparison");
console.log(
  "   Param set     | Pub key  | Sec key  | Ciphertext | NIST level | Result",
);
console.log(
  "   --------------|----------|----------|------------|------------|-------",
);
for (const { params, success } of results) {
  const s = ML_KEM_SIZES[params];
  const level = PARAM_DESCRIPTIONS[params].nistLevel.replace("NIST ", "");
  console.log(
    `   ${params.padEnd(13)} | ${String(s.publicKey).padStart(6)} B | ${String(s.secretKey).padStart(6)} B | ${String(s.ciphertext).padStart(8)} B | ${level.padEnd(10)} | ${success ? "✓" : "✗"}`,
  );
}
console.log();

// ---------------------------------------------------------------------------
// Section 3: Wrong-key failure demonstration
// ---------------------------------------------------------------------------

section(
  "Security property — implicit rejection (wrong secret key → different output)",
);

const legitKeypair = kem.generateKeyPair("ml-kem-768");
const attackerKeypair = kem.generateKeyPair("ml-kem-768");

const legitEncap = kem.encapsulate(legitKeypair.publicKey, "ml-kem-768");

const correctSecret = kem.decapsulate(
  legitEncap.ciphertext,
  legitKeypair.secretKey,
  "ml-kem-768",
);
const wrongSecret = kem.decapsulate(
  legitEncap.ciphertext,
  attackerKeypair.secretKey,
  "ml-kem-768",
);

const secretsMatch = Buffer.from(correctSecret).equals(
  Buffer.from(wrongSecret),
);

console.log(
  `   correct key  ${Buffer.from(correctSecret).subarray(0, 8).toString("hex")}...`,
);
console.log(
  `   wrong key    ${Buffer.from(wrongSecret).subarray(0, 8).toString("hex")}...`,
);
console.log(
  `   match=${secretsMatch}  ${!secretsMatch ? "✓ implicit rejection confirmed" : "✗"}`,
);

// ---------------------------------------------------------------------------
// Section 4: Audit record (suitable for on-chain logging)
// ---------------------------------------------------------------------------

section("Audit record (on-chain anchor format)");

const auditRec = kem.auditRecord(
  legitEncap,
  legitKeypair.publicKey,
  "ml-kem-768",
);
console.log(JSON.stringify(auditRec, null, 2));
console.log();
